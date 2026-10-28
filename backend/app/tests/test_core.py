import os
os.environ["DATABASE_URL"] = "sqlite:///./test_gridwise.db"
import pandas as pd, numpy as np
from fastapi.testclient import TestClient
from app.main import app
from app import analytics as an, simulator as sim
from datetime import datetime

c = TestClient(app)
def signup(email):
    r = c.post("/auth/signup", json=dict(email=email, password="password123", name="T", org_name="Org " + email)); assert r.status_code == 201
    return {"Authorization": "Bearer " + r.json()["access_token"]}

def test_requires_auth():
    assert c.get("/dashboard/summary").status_code == 401
    assert c.get("/devices", headers={"Authorization": "Bearer junk"}).status_code == 401

def test_tenant_isolation_and_summary():
    a, b = signup("a@test.io"), signup("b@test.io")
    assert c.get("/dashboard/summary", headers=a).json()["today_kwh"] >= 0
    assert {d["id"] for d in c.get("/devices", headers=a).json()}.isdisjoint({d["id"] for d in c.get("/devices", headers=b).json()})

def test_injected_anomaly_detected():
    h = an.hourly(pd.DataFrame([dict(ts=r["ts"], kw=r["power_w"] / 1000, kwh=r["energy_kwh"]) for r in sim.generate(datetime(2025, 1, 1), 24 * 10, anomaly_ts={datetime(2025, 1, 8, 2)})]))
    assert any("02:00" in x["explanation"] for x in an.detect_anomalies(h))

def test_insufficient_data_safeguard():
    assert an.detect_anomalies(pd.DataFrame(columns=["ts", "kw", "kwh"])) == []
    assert an.forecast(pd.DataFrame({"ts": pd.date_range("2025-01-01", periods=10, freq="h"), "kw": 1.0, "kwh": 1.0}))["sufficient"] is False

def test_forecast_metrics_and_savings():
    h = an.hourly(pd.DataFrame([dict(ts=r["ts"], kw=r["power_w"] / 1000, kwh=r["energy_kwh"]) for r in sim.generate(datetime(2025, 1, 1), 24 * 10)]))
    f = an.forecast(h); assert f["sufficient"] and len(f["points"]) == 24 and f["metrics"]["model"]["mae"] >= 0
    assert an.savings(1000, 10)["annual_inr"] == 1200
