import os, io, csv, time, secrets, hashlib, calendar, asyncio, contextlib, base64, json
import numpy as np
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import hmac, pandas as pd
from fastapi import FastAPI, Depends, HTTPException, Header, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from . import analytics as an, simulator as sim, alerts as alerts_mod, datasets as datasets_mod
from .models import TZ, Audit, Base, Device, Org, Reading, Session, Site, User, engine, now

SECRET = os.getenv("SECRET_KEY", "dev-only-change-me")  # set a real value in .env for anything beyond local dev

def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

def _jwt_encode(payload):
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header}.{body}"
    signature = hmac.new(SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url(signature)}"

def _jwt_decode(token):
    header, body, signature = token.split(".")
    signing_input = f"{header}.{body}"
    expected = hmac.new(SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    signature_bytes = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
    if not hmac.compare_digest(signature_bytes, expected):
        raise ValueError("Invalid token signature")
    header_data = json.loads(base64.urlsafe_b64decode(header + "=" * (-len(header) % 4)))
    if header_data.get("alg") != "HS256":
        raise ValueError("Unsupported token algorithm")
    payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    if "exp" in payload and datetime.now(timezone.utc).timestamp() >= payload["exp"]:
        raise ValueError("Token expired")
    return payload

def hash_password(password):
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"

def verify_password(password, stored):
    if stored.startswith("pbkdf2_sha256$"):
        try:
            _, salt, expected = stored.split("$")
            actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000).hex()
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False
    if stored.startswith(("$2a$", "$2b$", "$2y$")):
        with contextlib.suppress(ImportError):
            import importlib
            bcrypt = importlib.import_module("bcrypt")
            return bcrypt.checkpw(password.encode(), stored.encode())
    return False

# ---- Virtual sensors: a server-side stand-in for the ESP32/PZEM. Disable with SIM_LIVE=0 when real hardware is connected. ----
LOADS = {"led": ("LED bulbs", 20), "fan": ("Fan", 60), "motor": ("Small motor", 250), "heater": ("Heater", 1500)}
load_state = defaultdict(dict)   # org_id -> {load_key: bool}
active = {}                      # org_id -> last authenticated request time (only active workspaces get live readings)

def tick(interval):
    rng = np.random.default_rng()
    with Session() as db:
        for d in db.scalars(select(Device).where(Device.source_type == "simulated")).all():
            org = db.get(Site, d.site_id).org_id
            if time.time() - active.get(org, 0) > 600: continue
            ts = now(); extra = sum(w for k, (_, w) in LOADS.items() if load_state[org].get(k))
            kw = max(0.05, float(sim.profile_kw(ts.hour + ts.minute / 60) * rng.normal(1, 0.03)) + extra / 1000)
            r = sim.reading(ts, kw, rng); r["energy_kwh"] = round(kw * interval / 3600, 6)
            db.add(Reading(device_id=d.id, **r)); d.last_seen = ts
        db.commit()

async def live_loop():
    interval = float(os.getenv("SIM_INTERVAL_S", "5"))
    while True:
        await asyncio.sleep(interval)
        with contextlib.suppress(Exception): await asyncio.to_thread(tick, interval)
        for org in [o for o, t0 in list(active.items()) if time.time() - t0 < 600]:
            with contextlib.suppress(Exception): await asyncio.to_thread(alerts_mod.check, org)

@contextlib.asynccontextmanager
async def lifespan(_):
    task = asyncio.create_task(live_loop()) if os.getenv("SIM_LIVE", "1") == "1" else None
    yield
    if task: task.cancel()

app = FastAPI(title="GridWise AI API", version="0.2.0", lifespan=lifespan)
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
    try: uid = int(_jwt_decode(c.credentials)["sub"])
    except Exception: raise HTTPException(401, "Invalid or expired token")
    u = db.get(User, uid)
    if not u: raise HTTPException(401, "Invalid or expired token")
    active[u.org_id] = time.time()
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
    return _jwt_encode({"sub": str(u.id), "exp": int((datetime.now(timezone.utc) + timedelta(hours=8)).timestamp())})

# ---- tenant-scoped helpers: every data query goes through the caller's org ----
def org_devices(db, u):
    return db.scalars(select(Device).join(Site, Device.site_id == Site.id).where(Site.org_id == u.org_id)).all()

def frame(db, u, hours=24 * 14):
    ids = [d.id for d in org_devices(db, u)]
    rows = db.scalars(select(Reading).where(Reading.device_id.in_(ids), Reading.ts >= now() - timedelta(hours=hours), Reading.ts <= now()).order_by(Reading.ts)).all()
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
    power_factor: float | None = Field(default=None, ge=0, le=1); temperature_c: float | None = Field(default=None, ge=-40, le=125)
class LoadIn(BaseModel):
    key: str; on: bool

# ---- public / auth ----
@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/auth/signup", status_code=201, dependencies=[Depends(limit)])
def signup(b: SignupIn, db=Depends(get_db)):
    if db.scalar(select(User).where(User.email == b.email.lower())): raise HTTPException(409, "An account with this email already exists")
    org = Org(name=b.org_name); db.add(org); db.flush()
    u = User(email=b.email.lower(), password_hash=hash_password(b.password), name=b.name, org_id=org.id)
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
    if not u or not verify_password(b.password, u.password_hash): raise HTTPException(401, "Incorrect email or password")
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
    with contextlib.suppress(Exception): alerts_mod.check(db.get(Site, d.site_id).org_id)
    return {"accepted": True}

# ---- data ----
@app.get("/readings")
def readings(hours: int = 48, limit_: int = 500, u=Depends(current_user), db=Depends(get_db)):
    ids = [d.id for d in org_devices(db, u)]
    rows = db.scalars(select(Reading).where(Reading.device_id.in_(ids), Reading.ts >= now() - timedelta(hours=min(hours, 24 * 30)), Reading.ts <= now()).order_by(Reading.ts.desc()).limit(min(limit_, 2000))).all()
    return [dict(ts=r.ts, voltage_v=r.voltage_v, current_a=r.current_a, power_w=r.power_w, energy_kwh=r.energy_kwh, frequency_hz=r.frequency_hz, power_factor=r.power_factor, temperature_c=r.temperature_c, source_type=r.source_type) for r in reversed(rows)]

@app.get("/dashboard/summary")
def summary(u=Depends(current_user), db=Depends(get_db)):
    o = db.get(Org, u.org_id); ids = [d.id for d in org_devices(db, u)]
    last = db.scalars(select(Reading).where(Reading.device_id.in_(ids), Reading.ts <= now()).order_by(Reading.ts.desc())).first()
    h = hourly_df(db, u); t = now(); today = h[h.ts >= t.replace(hour=0, minute=0, second=0, microsecond=0)].kwh.sum()
    month = h[h.ts >= t.replace(day=1, hour=0, minute=0, second=0, microsecond=0)].kwh.sum()
    avg_daily = h.tail(24 * 7).kwh.sum() / max(min(len(h), 168) / 24, 1) if len(h) else 0
    an_ = an.detect_anomalies(h)
    return dict(current_power_w=last.power_w if last else None, voltage_v=last.voltage_v if last else None, current_a=last.current_a if last else None,
        frequency_hz=last.frequency_hz if last else None, power_factor=last.power_factor if last else None, temperature_c=last.temperature_c if last else None, last_reading=last.ts if last else None, source_type=last.source_type if last else None,
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
    import numpy as np
    db.add(Reading(device_id=d.id, **sim.reading(now().replace(microsecond=0), 2.4, np.random.default_rng()))); db.commit()
    audit(db, u, "simulated_anomaly"); return {"injected": True}

@app.get("/export/readings.csv")
def export(u=Depends(current_user), db=Depends(get_db)):
    rows = readings(24 * 14, 2000, u, db); buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["timestamp", "voltage_v", "current_a", "power_w", "energy_kwh", "frequency_hz", "source_type"])
    for r in rows: w.writerow([r["ts"], r["voltage_v"], r["current_a"], r["power_w"], r["energy_kwh"], r["frequency_hz"], r["source_type"]])
    buf.seek(0); return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=readings.csv"})

@app.get("/simulator/state")
def sim_state(u=Depends(current_user)):
    return dict(live=os.getenv("SIM_LIVE", "1") == "1", loads=[dict(key=k, name=n, watts=w, on=bool(load_state[u.org_id].get(k))) for k, (n, w) in LOADS.items()])

@app.post("/simulator/load")
def sim_load(b: LoadIn, u=Depends(current_user)):
    if b.key not in LOADS: raise HTTPException(404, "Unknown virtual load")
    load_state[u.org_id][b.key] = b.on; return sim_state(u)

@app.get("/cost/tod")  # Time-of-Day estimate. Band hours and the rebate are assumptions the user can change; verify against the MERC tariff order.
def cost_tod(rebate: float = Query(0.8, ge=0, le=5), u=Depends(current_user), db=Depends(get_db)):
    h = hourly_df(db, u, 24 * 7); t = db.get(Org, u.org_id).tariff; out = []
    for name, hrs, f, rb in [("Solar hours", "09:00-17:00", lambda x: 9 <= x < 17, rebate), ("Other hours", "17:00-09:00", lambda x: not 9 <= x < 17, 0.0)]:
        k = float(h[h.ts.dt.hour.map(f)].kwh.sum()) if len(h) else 0.0
        out.append(dict(band=name, hours=hrs, kwh=round(k, 2), rebate_per_kwh=rb, rebate_inr=round(k * rb, 2)))
    kwh = sum(b["kwh"] for b in out); flat = kwh * t; reb = sum(b["rebate_inr"] for b in out)
    return dict(days=7, bands=out, total_kwh=round(kwh, 2), flat_cost_inr=round(flat, 2), rebate_total_inr=round(reb, 2), net_inr=round(flat - reb, 2), tariff=t,
                note="Illustrative. Real ToD bands, rebates, fixed charges and duty depend on your category and the current MERC tariff order.")

app.include_router(datasets_mod.make(get_db, current_user))
app.include_router(alerts_mod.make(get_db, current_user))