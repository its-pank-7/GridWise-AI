# GridWise AI (prototype, simulation mode)

React + Vite frontend, FastAPI backend, SQLAlchemy. Runs on SQLite by default (zero setup) or PostgreSQL.
**Status: written but not yet executed or tested.** Run the checks below before relying on it.

## Windows setup
Prerequisites: Python 3.10+, Node 18+. (Optional: Docker Desktop for PostgreSQL.)

### Backend (PowerShell)
```
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# the backend reads real environment variables (it does not auto-load .env), see .env.example for the names
$env:SECRET_KEY="a-long-random-string"; $env:CORS_ORIGINS="http://localhost:5173"
uvicorn app.main:app --reload
```
Tables are created on startup. API docs: http://localhost:8000/docs. Health: http://localhost:8000/health.
For PostgreSQL: `pip install -r requirements-postgres.txt`, then `docker compose up -d db` (needs a `.env` in the project root with `SECRET_KEY`), then `$env:DATABASE_URL="postgresql+psycopg2://gridwise:gridwise@localhost:5432/gridwise"` before starting uvicorn.

### Frontend (second terminal)
```
cd frontend
npm install
copy .env.example .env
npm run dev
```
Open http://localhost:5173 and use **Get started**. Signing up creates your organization, a site, a simulated device and 14 days of labeled demo readings (with one seeded night-time anomaly). There is no shared admin password.

### Tests
```
cd backend
pytest
```

## Verify
1. Homepage loads, nav anchors scroll, resize to phone width.
2. `/app` redirects to login when signed out.
3. Sign up, then see Overview numbers (they come from the API, see the browser Network tab).
4. Anomalies page lists the seeded 02:00 event; click **Inject demo anomaly** to add another.
5. Forecasts shows MAE/RMSE; Cost, Recommendations, Savings Simulator respond.
6. Sign up a second account: its Devices and Readings never include the first account's data.
7. Reports: **Download readings (CSV)**.

## Future ESP32 + PZEM-004T
Create a hardware device in **Devices** to get a one-time key. The firmware posts JSON to `POST /ingest` with header `X-Device-Key`:
`{"voltage_v":231.2,"current_a":1.2,"power_w":270,"energy_kwh":0.0045,"frequency_hz":50,"timestamp":"2025-01-01T10:00:00+05:30"}`
`energy_kwh` is the energy since the previous reading. Rows are stored with `source_type="hardware"`, so they never mix silently with demo data. The frontend needs no change.
**Safety:** mains wiring and the CT clamp must be installed and checked by a qualified electrician or authorized college electrical staff.

## Limits (not production-ready)
In-memory rate limiter, no migrations (tables auto-created; add Alembic before real deployments), no email verification or password reset, single-role users, HTTPS must come from your hosting layer, no security audit or certification, analytics assume one meter per site and hourly data. Hourly aggregation sums energy across devices.
