"""Instant alerts with escalation to the customer's head. Email is sent only when SMTP_* env vars are set; otherwise the delivery log says so."""
import os, threading, time
from datetime import timedelta
from typing import Literal
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from . import mailer
from .models import Session, Alert, AlertContact, AlertSetting, Device, Org, Reading, Site, now

RANK = {"low": 1, "medium": 2, "high": 3}
last_run = {}
was_anom = {}

def _cfg(db, org):
    s = db.get(AlertSetting, org)
    if not s: s = AlertSetting(org_id=org, enabled=True, escalation_min=5); db.add(s); db.flush()
    return s

def _src(db, org):
    hw = db.scalar(select(Device).join(Site, Device.site_id == Site.id).where(Site.org_id == org, Device.source_type == "hardware", Device.last_seen >= now() - timedelta(minutes=10)))
    return "Hardware meter" if hw else "Virtual sensor (simulated)"

def _info(db, a, esc=None):
    o = db.get(Org, a.org_id)
    return dict(id=a.id, org=o.name if o else "your organization", sev=a.severity, obs=a.observed_kw, exp=a.expected_kw, msg=a.message,
                when=f"{a.ts:%d %b %Y, %H:%M}", time=f"{a.ts:%H:%M}", test=a.source == "test", esc=esc, src="Test alert (no real reading)" if a.source == "test" else _src(db, a.org_id))

def _deliver(alert_id, targets, kind, info):
    def run():
        lines = []
        for n, e, role in targets:
            sub, txt, htm = mailer.compose(kind, n, role, info); lines.append(f"{n} ({role}): {mailer.send(e, sub, txt, htm)}")
        with Session() as db:
            a = db.get(Alert, alert_id)
            if a: a.log = (a.log + " | " if a.log else "") + "; ".join(lines); db.commit()
    if targets: threading.Thread(target=run, daemon=True).start()

def _raise(db, org, ts, sev, obs, exp, msg, source="live"):
    a = Alert(org_id=org, ts=ts, severity=sev, observed_kw=round(obs, 3), expected_kw=round(exp, 3), message=msg, source=source, log="in-app")
    db.add(a); db.flush(); info = _info(db, a)
    cs = db.scalars(select(AlertContact).where(AlertContact.org_id == org, AlertContact.active == True)).all()  # noqa: E712
    t = [(c.name, c.email, c.role) for c in cs if RANK[c.min_severity] <= RANK[sev]]
    if not t: a.log += " | no email recipients configured"
    db.commit(); _deliver(a.id, t, "new", info)
    return a

def check(org):
    """Compare the newest reading with the typical level for that hour of day. Called on every live/ingested reading."""
    with Session() as db:
        st = _cfg(db, org)
        if not st.enabled: db.commit(); return
        ids = [d.id for d in db.scalars(select(Device).join(Site, Device.site_id == Site.id).where(Site.org_id == org)).all()]
        rows = db.scalars(select(Reading).where(Reading.device_id.in_(ids), Reading.ts >= now() - timedelta(days=14), Reading.ts <= now()).order_by(Reading.ts)).all()
        if len(rows) >= 72:
            df = pd.DataFrame([dict(ts=r.ts, kw=r.power_w / 1000) for r in rows]); last = df.iloc[-1]; hr = last.ts.floor("h")
            hist = df[df.ts < hr].groupby(df.ts.dt.floor("h")).kw.mean().reset_index()
            same = hist[hist.ts.dt.hour == last.ts.hour].kw
            if len(same) >= 3:
                med = float(same.median()); mad = float((same - med).abs().median()); z = (last.kw - med) / max(1.4826 * mad, 0.05)
                # Edge-triggered: alert when a spike STARTS (normal -> unusual). A spike that keeps going re-alerts every 10 min.
                anomalous = z > 3.5 and last.kw > med * 1.5
                prev = db.scalars(select(Alert).where(Alert.org_id == org, Alert.source == "live").order_by(Alert.id.desc())).first()
                gap = (now() - prev.created_at).total_seconds() if prev else 1e9
                fire = anomalous and ((not was_anom.get(org, False) and gap >= 20) or gap >= 600)
                was_anom[org] = anomalous
                if fire:
                    sev = "high" if z > 8 else "medium" if z > 5 else "low"
                    _raise(db, org, last.ts.to_pydatetime(), sev, float(last.kw), med, f"Power reached {last.kw:.2f} kW at {last.ts:%H:%M}, compared with a typical {med:.2f} kW for that hour.")
        for a in db.scalars(select(Alert).where(Alert.org_id == org, Alert.status == "new", Alert.escalated == False, Alert.created_at <= now() - timedelta(minutes=st.escalation_min))).all():  # noqa: E712
            a.escalated = True; heads = db.scalars(select(AlertContact).where(AlertContact.org_id == org, AlertContact.active == True, AlertContact.role == "head")).all()  # noqa: E712
            t = [(c.name, c.email, c.role) for c in heads if RANK[c.min_severity] <= RANK[a.severity]]
            a.log += f" | ESCALATED after {st.escalation_min} min without acknowledgement"; info = _info(db, a, st.escalation_min); db.commit()
            _deliver(a.id, t, "escalated", info)
        db.commit()

class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120); email: EmailStr; role: Literal["head", "manager", "staff"] = "head"; min_severity: Literal["low", "medium", "high"] = "medium"
class SettingsIn(BaseModel):
    enabled: bool; escalation_min: int = Field(ge=1, le=240)

def make(get_db, current_user):
    r = APIRouter(prefix="/alerts", tags=["alerts"])
    def out(a): return dict(id=a.id, ts=a.ts, created_at=a.created_at, severity=a.severity, observed_kw=a.observed_kw, expected_kw=a.expected_kw, message=a.message, status=a.status, source=a.source, escalated=a.escalated, log=a.log)

    @r.get("/feed")
    def feed(u=Depends(current_user), db=Depends(get_db)):
        if time.time() - last_run.get(u.org_id, 0) > 3:  # throttle: at most one check per 3 s per organization
            last_run[u.org_id] = time.time(); check(u.org_id)
        rows = db.scalars(select(Alert).where(Alert.org_id == u.org_id).order_by(Alert.id.desc()).limit(30)).all()
        return dict(unread=sum(1 for a in rows if a.status == "new"), latest_id=rows[0].id if rows else 0, alerts=[out(a) for a in rows])

    def mine(db, u, i):
        a = db.get(Alert, i)
        if not a or a.org_id != u.org_id: raise HTTPException(404, "Alert not found")
        return a
    @r.post("/{i}/acknowledge")
    def ack(i: int, u=Depends(current_user), db=Depends(get_db)):
        a = mine(db, u, i)
        if a.status == "new": a.status = "acknowledged"; a.log += f" | acknowledged by {u.name}"; db.commit()
        return out(a)
    @r.post("/{i}/resolve")
    def resolve(i: int, u=Depends(current_user), db=Depends(get_db)):
        a = mine(db, u, i); a.status = "resolved"; a.log += f" | resolved by {u.name}"; db.commit(); return out(a)

    @r.post("/test", status_code=201)
    def test(u=Depends(current_user), db=Depends(get_db)):
        return out(_raise(db, u.org_id, now(), "high", 2.4, 0.4, "TEST ALERT: this is a drill to check that notifications reach your recipients.", "test"))

    @r.get("/contacts")
    def contacts(u=Depends(current_user), db=Depends(get_db)):
        return [dict(id=c.id, name=c.name, email=c.email, role=c.role, min_severity=c.min_severity) for c in db.scalars(select(AlertContact).where(AlertContact.org_id == u.org_id)).all()]
    @r.post("/contacts", status_code=201)
    def add(b: ContactIn, u=Depends(current_user), db=Depends(get_db)):
        if len(db.scalars(select(AlertContact).where(AlertContact.org_id == u.org_id)).all()) >= 10: raise HTTPException(409, "At most 10 recipients")
        c = AlertContact(org_id=u.org_id, name=b.name, email=b.email.lower(), role=b.role, min_severity=b.min_severity); db.add(c); db.commit(); return dict(id=c.id)
    @r.delete("/contacts/{i}")
    def rem(i: int, u=Depends(current_user), db=Depends(get_db)):
        c = db.get(AlertContact, i)
        if not c or c.org_id != u.org_id: raise HTTPException(404, "Recipient not found")
        db.delete(c); db.commit(); return {"deleted": True}

    @r.get("/settings")
    def get_settings(u=Depends(current_user), db=Depends(get_db)):
        s = _cfg(db, u.org_id); db.commit(); return dict(enabled=s.enabled, escalation_min=s.escalation_min, email_configured=bool(os.getenv("SMTP_HOST")))
    @r.put("/settings")
    def put_settings(b: SettingsIn, u=Depends(current_user), db=Depends(get_db)):
        s = _cfg(db, u.org_id); s.enabled = b.enabled; s.escalation_min = b.escalation_min; db.commit(); return dict(enabled=s.enabled, escalation_min=s.escalation_min)
    return r