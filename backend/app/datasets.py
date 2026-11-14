"""Customer dataset upload: CSV in, hourly insights out. CSV text is posted as JSON (no extra dependencies)."""
import io, json
from typing import Literal
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from importlib import import_module

select = import_module("sqlalchemy").select
from . import analytics as an
from .models import Dataset, Org

MAXC = 5_000_000
class InspectIn(BaseModel): csv_text: str = Field(max_length=MAXC)
class CreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120); csv_text: str = Field(max_length=MAXC); time_col: str; value_col: str; unit: Literal["kwh", "kw", "w"]

def read(txt):
    try: df = pd.read_csv(io.StringIO(txt), sep=None, engine="python")
    except Exception: raise HTTPException(422, "Could not read this file as CSV.")
    if len(df.columns) < 2 or df.empty: raise HTTPException(422, "The file needs a time column and a value column.")
    if len(df) > 300_000: raise HTTPException(422, "Too many rows (limit 300,000).")
    df.columns = [str(c).strip() for c in df.columns]; return df

def guess(df):
    cols = list(df.columns); low = [c.lower() for c in cols]
    tc = next((c for c, l in zip(cols, low) if any(k in l for k in ("time", "date", "stamp"))), cols[0])
    num = [c for c in cols if c != tc and pd.to_numeric(df[c], errors="coerce").notna().mean() > 0.8]
    vc = next((c for c in num if any(k in c.lower() for k in ("kwh", "energy", "consum", "power", "load", "kw", "watt", "usage"))), num[0] if num else cols[-1])
    l = vc.lower(); unit = "kwh" if "kwh" in l else "kw" if "kw" in l else "w" if ("watt" in l or l.endswith("_w") or l == "w") else "kwh"
    return tc, vc, unit

def to_hourly(df, tc, vc, unit):
    if tc not in df.columns or vc not in df.columns: raise HTTPException(422, "Selected column not found.")
    t = pd.to_datetime(df[tc], errors="coerce"); v = pd.to_numeric(df[vc], errors="coerce")
    if getattr(t.dt, "tz", None) is not None: t = t.dt.tz_localize(None)
    ok = t.notna() & v.notna() & (v >= 0); dropped = int((~ok).sum()); d = pd.DataFrame({"ts": t[ok], "v": v[ok]})
    if len(d) < 24: raise HTTPException(422, "Fewer than 24 valid rows. Check the column choices.")
    d["h"] = d.ts.dt.floor("h")
    if unit == "kwh": kwh = d.groupby("h").v.sum(); kw = kwh
    else: kw = d.groupby("h").v.mean() / (1000 if unit == "w" else 1); kwh = kw
    h = pd.DataFrame({"ts": kw.index, "kwh": kwh.values, "kw": kw.values}).sort_values("ts")
    return h.tail(20000), dropped

def build(ds, tariff):
    h = pd.DataFrame(json.loads(ds.data), columns=["ts", "kwh", "kw"]); h["ts"] = pd.to_datetime(h.ts)
    total = float(h.kwh.sum()); daily = h.groupby(h.ts.dt.date).kwh.sum(); avg = total / max(len(daily), 1)
    pk = h.loc[h.kw.idxmax()]; prof = h.groupby(h.ts.dt.hour).kw.mean().reindex(range(24)).fillna(0)
    wd = h[h.ts.dt.weekday < 5].kwh.sum() / max(h[h.ts.dt.weekday < 5].ts.dt.date.nunique(), 1); we = h[h.ts.dt.weekday >= 5].kwh.sum() / max(h[h.ts.dt.weekday >= 5].ts.dt.date.nunique(), 1)
    exp_h = int((h.ts.max() - h.ts.min()).total_seconds() // 3600) + 1; cov = len(h) / exp_h
    step = float(h.ts.diff().dt.total_seconds().median() / 3600) if len(h) > 1 else 1.0
    warn = []
    if cov < 0.9: warn.append(f"{round((1 - cov) * 100)}% of hours between the first and last timestamp are missing. Forecasts and baselines are less reliable.")
    if step > 1.5: warn.append("Your data is coarser than hourly, so hourly patterns and forecasts are limited.")
    if ds.rows_dropped: warn.append(f"{ds.rows_dropped} rows were ignored (bad timestamp, non-numeric or negative value).")
    an_ = an.detect_anomalies(h[["ts", "kw", "kwh"]]); f = an.forecast(h[["ts", "kw", "kwh"]])
    if f.get("sufficient"): f["daily_cost_inr"] = round(f["daily_kwh"] * tariff); f["projected_month_cost_inr"] = round(f["projected_month_kwh"] * tariff)
    return dict(name=ds.name, tariff=tariff, start=h.ts.min().isoformat(), end=h.ts.max().isoformat(), total_kwh=round(total, 1), avg_daily_kwh=round(avg, 2),
        peak_kw=round(float(pk.kw), 3), peak_at=pk.ts.isoformat(), est_cost_inr=round(total * tariff), projected_month_inr=round(avg * 30 * tariff),
        weekday_daily_kwh=round(float(wd), 2), weekend_daily_kwh=round(float(we), 2),
        daily=[dict(date=str(k), kwh=round(float(x), 2)) for k, x in daily.items()][-90:], hourly_profile=[dict(hour=i, avg_kw=round(float(x), 3)) for i, x in prof.items()],
        forecast=f, anomalies=an_[:20], anomaly_count=len(an_), recommendations=an.recommendations(h[["ts", "kw", "kwh"]], tariff, an_),
        quality=dict(rows_used=ds.rows_used, rows_dropped=ds.rows_dropped, hours=len(h), coverage_pct=round(cov * 100, 1), warnings=warn))

def make(get_db, current_user):
    r = APIRouter(prefix="/datasets", tags=["datasets"])
    @r.post("/inspect")
    def inspect(b: InspectIn, u=Depends(current_user)):
        df = read(b.csv_text); tc, vc, unit = guess(df)
        return dict(columns=list(df.columns), time_guess=tc, value_guess=vc, unit_guess=unit, rows=len(df), preview=df.head(5).astype(str).values.tolist())
    @r.post("", status_code=201)
    def create(b: CreateIn, u=Depends(current_user), db=Depends(get_db)):
        if len(db.scalars(select(Dataset).where(Dataset.org_id == u.org_id)).all()) >= 5: raise HTTPException(409, "At most 5 datasets. Delete one first.")
        df = read(b.csv_text); h, dropped = to_hourly(df, b.time_col, b.value_col, b.unit)
        ds = Dataset(org_id=u.org_id, name=b.name.strip(), unit=b.unit, rows_used=len(df) - dropped, rows_dropped=dropped, data=json.dumps([[t.isoformat(), round(a, 4), round(k, 4)] for t, a, k in zip(h.ts, h.kwh, h.kw)]))
        db.add(ds); db.commit(); return dict(id=ds.id)
    @r.get("")
    def lst(u=Depends(current_user), db=Depends(get_db)):
        return [dict(id=d.id, name=d.name, unit=d.unit, rows_used=d.rows_used, created_at=d.created_at) for d in db.scalars(select(Dataset).where(Dataset.org_id == u.org_id).order_by(Dataset.id.desc())).all()]
    def mine(db, u, i):
        d = db.get(Dataset, i)
        if not d or d.org_id != u.org_id: raise HTTPException(404, "Dataset not found")
        return d
    @r.get("/{i}/insights")
    def insights(i: int, u=Depends(current_user), db=Depends(get_db)): return build(mine(db, u, i), db.get(Org, u.org_id).tariff)
    @r.delete("/{i}")
    def delete(i: int, u=Depends(current_user), db=Depends(get_db)):
        db.delete(mine(db, u, i)); db.commit(); return {"deleted": True}
    return r
