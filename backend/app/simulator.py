"""Reproducible demo data. Every row is tagged source_type='simulated'."""
from datetime import timedelta
import numpy as np

def profile_kw(h):
    """Typical household load: morning bump, midday, evening peak, low night baseload."""
    g = lambda c, w: np.exp(-((h - c) / w) ** 2)
    return 0.25 + 0.35 * g(7, 1.5) + 0.15 * g(13, 2) + 0.7 * g(20, 2)

def reading(ts, kw, rng, source="simulated"):
    v = float(rng.normal(231, 1.2))
    return dict(ts=ts, voltage_v=round(v, 1), current_a=round(kw * 1000 / (v * 0.9), 3),  # assumes PF 0.9
                power_w=round(kw * 1000, 1), energy_kwh=round(kw, 4),  # hourly interval: kW x 1 h
                frequency_hz=round(float(rng.normal(50, 0.03)), 2), source_type=source)

def generate(start, hours, seed=42, anomaly_ts=()):
    rng = np.random.default_rng(seed)
    out = []
    for i in range(hours):
        ts = start + timedelta(hours=i)
        kw = profile_kw(ts.hour) * (1.1 if ts.weekday() >= 5 else 1) * float(rng.normal(1, 0.06))
        if ts in anomaly_ts:
            kw = 1.5  # injected test anomaly (night-time)
        out.append(reading(ts, max(kw, 0.05), rng))
    return out
