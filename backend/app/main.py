import os, io, csv, time, secrets, hashlib, calendar
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import bcrypt, jwt
import pandas as pd  # pyright: ignore[reportMissingModuleSource]
from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from . import analytics as an, simulator as sim
from .models import TZ, Audit, Base, Device, Org, Reading, Session, Site, User, engine, now

SECRET = os.getenv("SECRET_KEY", "dev-only-change-me")  # set a real value in .env for anything beyond local dev
app = FastAPI(title="GridWise AI API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
                   allow_methods=["*"], allow_headers=["*"])
Base.metadata.create_all(engine)

def get_db():
    db = Session()
    try: yield db
    finally: db.close()

bearer = HTTPBearer(auto_error=False)
def current_user(c: HTTPAuthorizationCredentials = Depends(bearer), db=Depends(get_db)):
    if not c: raise HTTPException(401, "Not authenticated")
    try: uid = int(jwt.decode(c.credentials, SECRET, algorithms=["HS256"])["sub"])
    except Exception: raise HTTPException(401, "Invalid or expired token")
    u = db.get(User, uid)
    if not u: raise HTTPException(401, "Invalid or expired token")
    return u

hits = defaultdict(list)
def limit(request: Request):  # simple in-memory limiter; use a shared store behind multiple workers
    ip = request.client.host if request.client else "x"; t = time.time()
    hits[ip] = [x for x in hits[ip] if t - x < 60]
    if len(hits[ip]) >= 20: raise HTTPException(429, "Too many attempts. Try again in a minute.")
    hits[ip].append(t)

def audit(db, u, action):
    db.add(Audit(org_id=u.org_id, user_id=u.id, action=action)); db.commit()

def token_for(u):
    return jwt.encode({"sub": str(u.id), "exp": datetime.now(timezone.utc) + timedelta(hours=8)}, SECRET, "HS256")

# ---- tenant-scoped helpers: every data query goes through the caller's org ----
def org_devices(db, u):
    return db.scalars(select(Device).join(Site, Device.site_id == Site.id).where(Site.org_id == u.org_id)).all()

def frame(db, u, hours=24 * 14):
    ids = [d.id for d in org_devices(db, u)]
    rows = db.scalars(select(Reading).where(Reading.device_id.in_(ids), Reading.ts >= now() - timedelta(hours=hours)).order_by(Reading.ts)).all()
    return pd.DataFrame([dict(ts=r.ts, kw=r.power_w / 1000, kwh=r.energy_kwh) for r in rows], columns=["ts", "kw", "kwh"])

def hourly_df(db, u, hours=24 * 14): return an.hourly(frame(db, u, hours))

# ---- schemas ----
class SignupIn(BaseModel):
    email: EmailStr; password: str = Field(min_length=8, max_length=128); name: str = Field(min_length=1, max_length=120)
    org_name: str = Field(min_length=1, max_length=120)
class LoginIn(BaseModel):
    email: EmailStr; password: str
class TariffIn(BaseModel):
    tariff: float = Field(gt=0, le=100)
class SavingsIn(BaseModel):
    monthly_bill: float = Field(gt=0, le=10_000_000); reduction_pct: float = Field(ge=0, le=100)
class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
class IngestIn(BaseModel):
    voltage_v: float = Field(ge=0, le=500); current_a: float = Field(ge=0, le=100); power_w: float = Field(ge=0, le=25000)
    energy_kwh: float = Field(ge=0, le=1000); frequency_hz: float = Field(default=50, ge=40, le=70); timestamp: datetime | None = None

# ---- public / auth ----
@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/auth/signup", status_code=201, dependencies=[Depends(limit)])
def signup(b: SignupIn, db=Depends(get_db)):
    if db.scalar(select(User).where(User.email == b.email.lower())): raise HTTPException(409, "An account with this email already exists")
    org = Org(name=b.org_name); db.add(org); db.flush()
    u = User(email=b.email.lower(), password_hash=bcrypt.hashpw(b.password.encode(), bcrypt.gensalt()).decode(), name=b.name, org_id=org.id)
    site = Site(org_id=org.id, name="Main site"); db.add_all([u, site]); db.flush()
    dev = Device(site_id=site.id, name="Demo meter (simulated)", source_type="simulated"); db.add(dev); db.flush()
    end = now().replace(minute=0, second=0, microsecond=0); start = end - timedelta(hours=24 * 14)
    anomalies = {(end - timedelta(days=2)).replace(hour=2)}  # one night-time anomaly 2 days ago at 02:00
    for r in sim.generate(start, 24 * 14, seed=42, anomaly_ts=anomalies): db.add(Reading(device_id=dev.id, **r))
    dev.last_seen = end; db.commit(); audit(db, u, "signup")
    return {"access_token": token_for(u), "token_type": "bearer"}

@app.post("/auth/login", dependencies=[Depends(limit)])
def login(b: LoginIn, db=Depends(get_db)):
    u = db.scalar(select(User).where(User.email == b.email.lower()))
    if not u or not bcrypt.checkpw(b.password.encode(), u.password_hash.encode()): raise HTTPException(401, "Incorrect email or password")
    audit(db, u, "login"); return {"access_token": token_for(u), "token_type": "bearer"}

@app.get("/me")
def me(u=Depends(current_user), db=Depends(get_db)):
    o = db.get(Org, u.org_id); s = db.scalars(select(Site).where(Site.org_id == o.id)).all()
    return dict(email=u.email, name=u.name, role=u.role, org=o.name, tariff=o.tariff, sites=[x.name for x in s], mode="simulation")

@app.put("/settings/tariff")
def set_tariff(b: TariffIn, u=Depends(current_user), db=Depends(get_db)):
    db.get(Org, u.org_id).tariff = b.tariff; db.commit(); audit(db, u, f"tariff={b.tariff}"); return {"tariff": b.tariff}

# ---- devices ----
@app.get("/devices")
def devices(u=Depends(current_user), db=Depends(get_db)):
    return [dict(id=d.id, name=d.name, source_type=d.source_type, is_simulated=d.source_type == "simulated",
                 last_seen=d.last_seen, status="simulated" if d.source_type == "simulated" else ("online" if d.last_seen and now() - d.last_seen < timedelta(minutes=10) else "offline"))
            for d in org_devices(db, u)]

@app.post("/devices", status_code=201)
def add_device(b: DeviceIn, u=Depends(current_user), db=Depends(get_db)):
    site = db.scalars(select(Site).where(Site.org_id == u.org_id)).first(); key = "gw_" + secrets.token_urlsafe(24)
    d = Device(site_id=site.id, name=b.name, source_type="hardware", key_hash=hashlib.sha256(key.encode()).hexdigest())
    db.add(d); db.commit(); audit(db, u, f"device_created={d.id}")
    return {"id": d.id, "api_key": key, "note": "Store this key now. It is shown only once."}

@app.post("/ingest", status_code=202)  # future ESP32/PZEM entry point: authenticated by device key, not by user JWT
def ingest(b: IngestIn, x_device_key: str = Header(), db=Depends(get_db)):
    d = db.scalar(select(Device).where(Device.key_hash == hashlib.sha256(x_device_key.encode()).hexdigest()))
    if not d: raise HTTPException(401, "Unknown device key")
    ts = now() if not b.timestamp else (b.timestamp.astimezone(timezone.utc).replace(tzinfo=None) + timedelta(minutes=TZ) if b.timestamp.tzinfo else b.timestamp)
    if ts > now() + timedelta(minutes=5): raise HTTPException(422, "Timestamp is in the future")
    db.add(Reading(device_id=d.id, ts=ts, source_type="hardware", **b.model_dump(exclude={"timestamp"}))); d.last_seen = now(); db.commit()
    return {"accepted": True}

# ---- data ----
@app.get("/readings")
def readings(hours: int = 48, limit_: int = 500, u=Depends(current_user), db=Depends(get_db)):
    ids = [d.id for d in org_devices(db, u)]
    rows = db.scalars(select(Reading).where(Reading.device_id.in_(ids), Reading.ts >= now() - timedelta(hours=min(hours, 24 * 30))).order_by(Reading.ts.desc()).limit(min(limit_, 2000))).all()
    return [dict(ts=r.ts, voltage_v=r.voltage_v, current_a=r.current_a, power_w=r.power_w, energy_kwh=r.energy_kwh, frequency_hz=r.frequency_hz, source_type=r.source_type) for r in reversed(rows)]

@app.get("/dashboard/summary")
def summary(u=Depends(current_user), db=Depends(get_db)):
    o = db.get(Org, u.org_id); ids = [d.id for d in org_devices(db, u)]
    last = db.scalars(select(Reading).where(Reading.device_id.in_(ids)).order_by(Reading.ts.desc())).first()
    h = hourly_df(db, u); t = now(); today = h[h.ts >= t.replace(hour=0, minute=0, second=0, microsecond=0)].kwh.sum()
    month = h[h.ts >= t.replace(day=1, hour=0, minute=0, second=0, microsecond=0)].kwh.sum()
    avg_daily = h.tail(24 * 7).kwh.sum() / max(min(len(h), 168) / 24, 1) if len(h) else 0
    an_ = an.detect_anomalies(h)
    return dict(current_power_w=last.power_w if last else None, voltage_v=last.voltage_v if last else None, current_a=last.current_a if last else None,
        frequency_hz=last.frequency_hz if last else None, last_reading=last.ts if last else None, source_type=last.source_type if last else None,
        today_kwh=round(today, 2), month_to_date_kwh=round(month, 2), month_to_date_cost=round(month * o.tariff), tariff=o.tariff,
        projected_month_kwh=round(avg_daily * calendar.monthrange(t.year, t.month)[1], 1), projected_month_cost=round(avg_daily * calendar.monthrange(t.year, t.month)[1] * o.tariff),
        recent_anomalies=len(an_), projection_basis="Average of the last 7 days of recorded data")

@app.get("/analytics")
def analytics(u=Depends(current_user), db=Depends(get_db)):
    h = hourly_df(db, u)
    if h.empty: return dict(hourly=[], daily=[], peak_kw=None)
    hr = h.groupby(h.ts.dt.hour).kw.agg(["mean", "max"]).reset_index(); d = h.groupby(h.ts.dt.date).kwh.sum().reset_index()
    return dict(hourly=[dict(hour=int(r.hour), avg_kw=round(r.mean, 3), peak_kw=round(r.max, 3)) for r in hr.itertuples()],
                daily=[dict(date=str(r.ts), kwh=round(r.kwh, 2)) for r in d.itertuples()], peak_kw=round(h.kw.max(), 3))

@app.get("/anomalies")
def anomalies(u=Depends(current_user), db=Depends(get_db)):
    h = hourly_df(db, u); return dict(sufficient=len(h) >= 72, items=an.detect_anomalies(h))

@app.get("/forecast")
def forecast(u=Depends(current_user), db=Depends(get_db)):
    f = an.forecast(hourly_df(db, u)); t = db.get(Org, u.org_id).tariff
    if f["sufficient"]: f["daily_cost_inr"] = round(f["daily_kwh"] * t); f["projected_month_cost_inr"] = round(f["projected_month_kwh"] * t)
    return f

@app.get("/cost")
def cost(u=Depends(current_user), db=Depends(get_db)):
    s = summary(u, db); a = an.detect_anomalies(hourly_df(db, u)); excess = sum(x["diff_kw"] for x in a)
    return dict(tariff=s["tariff"], measured_month_kwh=s["month_to_date_kwh"], estimated_month_cost_inr=s["month_to_date_cost"], projected_month_cost_inr=s["projected_month_cost"],
                excess_kwh_vs_baseline=round(excess, 2), excess_cost_inr=round(excess * s["tariff"]),
                note="Measured energy comes from readings. Costs are estimates at a flat tariff. Excess is a hypothetical comparison to the hourly baseline, not verified savings.")

@app.get("/recommendations")
def recs(u=Depends(current_user), db=Depends(get_db)):
    h = hourly_df(db, u); return an.recommendations(h, db.get(Org, u.org_id).tariff, an.detect_anomalies(h))

@app.post("/savings/simulate")
def simulate_savings(b: SavingsIn, u=Depends(current_user)): return an.savings(b.monthly_bill, b.reduction_pct)

@app.post("/simulator/anomaly", status_code=201)  # demo only: injects a spike so anomaly detection can be verified
def inject(u=Depends(current_user), db=Depends(get_db)):
    d = next((x for x in org_devices(db, u) if x.source_type == "simulated"), None)
    if not d: raise HTTPException(404, "No simulated device")
    import numpy as np  # pyright: ignore[reportMissingImports]
    db.add(Reading(device_id=d.id, **sim.reading(now().replace(minute=30, second=0, microsecond=0), 2.4, np.random.default_rng()))); db.commit()
    audit(db, u, "simulated_anomaly"); return {"injected": True}

@app.get("/export/readings.csv")
def export(u=Depends(current_user), db=Depends(get_db)):
    rows = readings(24 * 14, 2000, u, db); buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["timestamp", "voltage_v", "current_a", "power_w", "energy_kwh", "frequency_hz", "source_type"])
    for r in rows: w.writerow([r["ts"], r["voltage_v"], r["current_a"], r["power_w"], r["energy_kwh"], r["frequency_hz"], r["source_type"]])
    buf.seek(0); return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=readings.csv"})
