"""Explainable analytics. Inputs are hourly DataFrames with columns: ts (datetime), kw (mean kW), kwh."""
import numpy as np
import pandas as pd

def hourly(df):
    if df.empty: return pd.DataFrame(columns=["ts", "kw", "kwh"])
    return df.groupby(df.ts.dt.floor("h")).agg(kw=("kw", "mean"), kwh=("kwh", "sum")).reset_index()

def detect_anomalies(h, z_thr=3.5, min_rows=72):
    """Robust z-score against the median/MAD of the same hour-of-day. Needs >= 3 days of data."""
    if len(h) < min_rows: return []
    h = h.copy(); hr = h.ts.dt.hour; g = h.groupby(hr).kw
    h["exp"] = g.transform("median")
    mad = g.transform(lambda s: (s - s.median()).abs().median())
    h["z"] = (h.kw - h.exp) / (1.4826 * mad).clip(lower=0.05)
    out = []
    for r in h[(h.z > z_thr) & (h.kw > h.exp * 1.5)].itertuples():
        sev = "high" if r.z > 8 else "medium" if r.z > 5 else "low"
        out.append(dict(ts=r.ts.isoformat(), observed_kw=round(r.kw, 3), expected_kw=round(r.exp, 3),
            diff_kw=round(r.kw - r.exp, 3), diff_pct=round((r.kw / r.exp - 1) * 100, 1), severity=sev, score=round(r.z, 1),
            method="Robust z-score (median/MAD by hour of day)",
            explanation=f"Consumption reached {r.kw:.2f} kW at {r.ts:%H:%M}, compared with a typical {r.exp:.2f} kW for that hour.",
            next_steps="Check what was running at that time. GridWise cannot identify a specific appliance from aggregate meter data."))
    return sorted(out, key=lambda a: a["ts"], reverse=True)

def _m(a, b):
    e = np.asarray(a) - np.asarray(b)
    return dict(mae=round(float(np.mean(np.abs(e))), 4), rmse=round(float(np.sqrt(np.mean(e ** 2))), 4))

def forecast(h, horizon=24, min_rows=96):
    """Hour-of-day median profile. Evaluated on a held-out final 24 h (train/test split) vs a seasonal-naive baseline."""
    if len(h) < min_rows: return dict(sufficient=False, message="Need at least 4 days of readings to forecast.")
    train, test = h.iloc[:-24], h.iloc[-24:]
    prof = train.groupby(train.ts.dt.hour).kw.median()
    metrics = dict(model=_m(test.kw, test.ts.dt.hour.map(prof)), seasonal_naive=_m(test.kw, h.kw.shift(24).iloc[-24:]),
                   note="Evaluated on the last 24 h, which were excluded from training.")
    prof = h.groupby(h.ts.dt.hour).kw.median(); sd = h.groupby(h.ts.dt.hour).kw.std().fillna(0)
    pts = []
    for i in range(1, horizon + 1):
        ts = h.ts.max() + pd.Timedelta(hours=i); k = float(prof[ts.hour]); s = float(sd[ts.hour])
        pts.append(dict(ts=ts.isoformat(), kw=round(k, 3), lo=round(max(0, k - 1.28 * s), 3), hi=round(k + 1.28 * s, 3)))
    daily = float(prof.sum())
    return dict(sufficient=True, points=pts, metrics=metrics, daily_kwh=round(daily, 2), projected_month_kwh=round(daily * 30, 1),
                uncertainty="Band shows roughly an 80% range of past values for that hour. Forecasts are estimates, not guarantees.")

def recommendations(h, tariff, anomalies):
    recs = []
    if len(h) < 72: return recs
    night = h[h.ts.dt.hour < 5].kw.mean(); eve = h[(h.ts.dt.hour >= 18) & (h.ts.dt.hour <= 22)].kwh.sum() / h.kwh.sum()
    days = max(len(h) / 24, 1)
    if night > 0.3:
        sav = (night - 0.2) * 5 * 30 * tariff
        recs.append(dict(title="Reduce night-time standby load", priority="high", evidence=f"Average 00:00-05:00 load is {night:.2f} kW.",
            explanation="High overnight load often comes from always-on devices.", action="Switch off idle devices at night.",
            estimated_monthly_savings_inr=round(sav), assumptions="Assumes load can fall to 0.2 kW for 5 h/night at your flat tariff.", status="open"))
    if eve > 0.35:
        recs.append(dict(title="Shift flexible loads out of the evening peak", priority="medium", evidence=f"{eve*100:.0f}% of energy falls between 18:00 and 22:00.",
            explanation="Under a time-of-day tariff, peak-hour use costs more. Your current tariff is flat, so this saves money only if you move to a time-of-day plan.",
            action="Run washing and water heating earlier in the day.", estimated_monthly_savings_inr=None, assumptions="Needs a time-of-day tariff to quantify.", status="open"))
    if anomalies:
        ex = sum(a["diff_kw"] for a in anomalies)
        recs.append(dict(title="Investigate unusual consumption events", priority="high" if any(a["severity"] == "high" for a in anomalies) else "medium",
            evidence=f"{len(anomalies)} anomalous hour(s) in the recorded period, about {ex:.1f} kWh above baseline.", explanation="Repeated spikes can indicate faulty or forgotten equipment.",
            action="Review the Anomalies page and check what was running.", estimated_monthly_savings_inr=round(ex / days * 30 * tariff),
            assumptions="Assumes similar events recur at the observed rate. Hypothetical, not verified.", status="open"))
    return recs

def savings(bill, pct):
    m = bill * pct / 100
    return dict(monthly_inr=round(m, 2), annual_inr=round(m * 12, 2), formula="monthly = bill x reduction% / 100; annual = monthly x 12",
                disclaimer="Estimate only, not guaranteed. Verified savings need before/after data adjusted for weather and occupancy.")
