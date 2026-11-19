import { useState, useEffect } from "react";
import { Zap, Gauge, IndianRupee, AlertTriangle } from "lucide-react";
import { Kpi, Ring, Donut, Seg } from "./ui.jsx";
import { AlertsPanel } from "./Alerts.jsx";
import { Link } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useGet, api, getJson, inr, hh } from "./api.js";

const State = ({ r, children }) => r.loading && !r.data ? <p className="muted">Loading...</p> : r.err ? <div className="err" role="alert">{r.err} <button className="btn ghost" onClick={r.reload}>Retry</button></div> : children(r.data);
const Head = ({ t, s }) => <div style={{ marginBottom: 16 }}><h1>{t}</h1>{s && <p className="muted">{s}</p>}</div>;
const Stat = ({ l, v, u }) => <div className="card stat"><div className="v">{v ?? "n/a"}{u && <small className="muted"> {u}</small>}</div><div className="l">{l}</div></div>;
const Chart = ({ children, small }) => <div className={"ch" + (small ? " small" : "")}><ResponsiveContainer>{children}</ResponsiveContainer></div>;
const axis = { stroke: "var(--mute)", fontSize: 12 };
const Empty = ({ m }) => <p className="muted">{m}</p>;
const Sev = ({ s }) => <span className={"tag " + (s === "high" ? "bad" : "warn")}>{s}</span>;

function PowerChart({ hours = 72, dataKey = "power_w", name = "Power (W)", poll = 0 }) {
  const r = useGet(`/readings?hours=${hours}&limit_=2000`);
  useEffect(() => { if (!poll) return; const id = setInterval(r.reload, poll); return () => clearInterval(id); }, [poll, r.reload]);
  return <State r={r}>{(d) => !d.length ? <Empty m="No readings yet." /> : <Chart><AreaChart data={d.map((x) => ({ t: hh(x.ts), v: x[dataKey] }))}><CartesianGrid stroke="var(--line)" /><XAxis dataKey="t" {...axis} minTickGap={50} /><YAxis {...axis} width={50} /><Tooltip /><Area dataKey="v" name={name} stroke="var(--acc)" fill="var(--accsoft)" /></AreaChart></Chart>}</State>;
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function healthScore(sm, an) {
  if (!sm || !an || !an.hourly.length) return null;
  const night = avg(an.hourly.filter((h) => h.hour < 5).map((h) => h.avg_kw)), tot = an.hourly.reduce((x, h) => x + h.avg_kw, 0) || 1;
  const eve = an.hourly.filter((h) => h.hour >= 18 && h.hour <= 22).reduce((x, h) => x + h.avg_kw, 0) / tot;
  const parts = [["Unusual events", Math.min(40, sm.recent_anomalies * 10)], ["Night-time standby load", night > 0.3 ? Math.min(30, Math.round((night - 0.3) * 60)) : 0], ["Evening peak concentration", eve > 0.35 ? Math.min(30, Math.round((eve - 0.35) * 100)) : 0]];
  return { score: 100 - parts.reduce((x, p) => x + p[1], 0), parts };
}
function periods(an) {
  const t = an.hourly.reduce((x, h) => x + h.avg_kw, 0) || 1, sum = (f) => an.hourly.filter((h) => f(h.hour)).reduce((x, h) => x + h.avg_kw, 0);
  return [["Night", (h) => h < 6], ["Morning", (h) => h >= 6 && h < 12], ["Afternoon", (h) => h >= 12 && h < 18], ["Evening", (h) => h >= 18]].map(([name, f]) => ({ name, value: Math.round((sum(f) / t) * 100) }));
}

export function Overview() {
  const [range, setRange] = useState(72);
  const me = useGet("/me"), s = useGet("/dashboard/summary"), an = useGet("/analytics"), f = useGet("/forecast"), a = useGet("/anomalies"), rc = useGet("/recommendations");
  const rd = useGet(`/readings?hours=${range}&limit_=2000`), sp = useGet("/readings?hours=24&limit_=100");
  const h = new Date().getHours(), hi = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const sm = s.data, hs = healthScore(sm, an.data), spark = (sp.data || []).map((x) => x.power_w);
  const peaks = an.data ? [...an.data.hourly].sort((x, y) => y.avg_kw - x.avg_kw).slice(0, 3) : [];
  return <><div className="pagehead"><div><h1>{hi}{me.data ? ", " + me.data.name.split(" ")[0] : ""}</h1><p className="muted">Here is your energy picture. {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p></div>
    <Seg value={range} onChange={setRange} options={[[24, "24 h"], [72, "3 days"], [168, "7 days"], [336, "14 days"]]} /></div>
    {s.err ? <div className="err" role="alert">{s.err}</div> : <div className="grid kpis">
      <Kpi icon={Zap} label="Current power" value={sm?.current_power_w} unit=" W" sub="Latest simulated reading" data={spark} />
      <Kpi icon={Gauge} label="Energy today" value={sm?.today_kwh} unit=" kWh" sub={sm ? `${sm.month_to_date_kwh} kWh this month` : ""} tone="var(--blue)" />
      <Kpi icon={IndianRupee} label="Projected month cost" value={sm ? inr(sm.projected_month_cost) : null} sub={sm ? `${inr(sm.month_to_date_cost)} so far at ₹${sm.tariff}/kWh` : ""} tone="#7c5cc4" />
      <Kpi icon={AlertTriangle} label="Anomalies found" value={sm?.recent_anomalies} sub="Over the recorded period" tone="var(--warn)" /></div>}
    <div className="two"><div className="card"><div className="hd"><h2>Power over time</h2><span className="tag warn">Simulated</span></div>
      <State r={rd}>{(d) => !d.length ? <Empty m="No readings yet." /> : <Chart><AreaChart data={d.map((x) => ({ t: hh(x.ts), v: x.power_w }))}><defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--acc)" stopOpacity=".35" /><stop offset="100%" stopColor="var(--acc)" stopOpacity="0" /></linearGradient></defs>
        <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="t" {...axis} minTickGap={60} /><YAxis {...axis} width={46} unit=" W" /><Tooltip /><Area dataKey="v" name="Power (W)" stroke="var(--acc)" strokeWidth={2.5} fill="url(#gA)" /></AreaChart></Chart>}</State></div>
      <div className="card"><h2>Energy health score</h2>{hs ? <><Ring value={hs.score} label="Energy health score" /><ul className="plain">{hs.parts.map(([n, p]) => <li key={n}><span>{n}</span><b className={p ? "bad" : "ok"}>{p ? "-" + p : "OK"}</b></li>)}</ul>
        <p className="muted small">A simple heuristic: 100 minus penalties for anomalies, high night-time load and evening concentration. It is not a certified rating.</p></> : <Empty m="Needs more data." />}</div></div>
    <div className="three"><div className="card"><h2>When you use energy</h2>{an.data && an.data.hourly.length ? <Donut data={periods(an.data)} /> : <Empty m="No data." />}</div>
      <div className="card"><h2>Your peak hours</h2>{peaks.length ? <ul className="plain">{peaks.map((p, i) => <li key={p.hour}><span><b>#{i + 1}</b> {String(p.hour).padStart(2, "0")}:00 to {String(p.hour + 1).padStart(2, "0")}:00</span><b>{p.avg_kw} kW</b></li>)}</ul> : <Empty m="No data." />}<p className="muted small">Average load by hour of day across your recorded days.</p></div>
      <div className="card"><h2>Next 24 hours</h2><State r={f}>{(d) => !d.sufficient ? <Empty m={d.message} /> : <><Chart small><LineChart data={d.points.map((p) => ({ t: hh(p.ts), kw: p.kw }))}><XAxis dataKey="t" hide /><YAxis hide domain={[0, "auto"]} /><Tooltip /><Line dataKey="kw" name="kW" stroke="var(--blue)" strokeWidth={2.5} dot={false} /></LineChart></Chart>
        <p><b>{d.daily_kwh} kWh</b> expected, about <b>{inr(d.daily_cost_inr)}</b></p></>}</State><Link to="/app/forecasts">Forecast details</Link></div></div>
    <div className="two even"><div className="card"><div className="hd"><h2>Recent anomalies</h2><Link to="/app/anomalies">View all</Link></div><State r={a}>{(d) => d.items.length ? d.items.slice(0, 3).map((x) => <div key={x.ts} className={"item " + x.severity}><b>{hh(x.ts)}</b> <Sev s={x.severity} /><br />{x.explanation}</div>) : <Empty m={d.sufficient ? "Nothing unusual found." : "Need at least 3 days of data."} />}</State></div>
      <div className="card"><div className="hd"><h2>Top recommendations</h2><Link to="/app/recommendations">View all</Link></div><State r={rc}>{(d) => d.length ? d.slice(0, 3).map((x) => <div key={x.title} className="item rec"><b>{x.title}</b> <span className="tag">{x.priority}</span><br /><span className="muted">{x.evidence}</span>{x.estimated_monthly_savings_inr != null && <div className="ok">Up to {inr(x.estimated_monthly_savings_inr)}/month (hypothetical)</div>}</div>) : <Empty m="No recommendations yet." />}</State></div></div></>;
}


export function Live() {
  const s = useGet("/dashboard/summary");
  const st = useGet("/simulator/state");

  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState({});
  const [actionMsg, setActionMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!auto) return;

    const id = setInterval(() => {
      s.reload();
      st.reload();
      setLastUpdated(new Date());
    }, 3000);

    return () => clearInterval(id);
  }, [auto, s.reload, st.reload]);

  const d = s.data;
  const loads = st.data?.loads || [];

  const totalLoad = loads
    .filter(x => x.on)
    .reduce((sum, x) => sum + Number(x.watts || 0), 0);

  const power = Number(d?.current_power_w || 0);
  const voltage = Number(d?.voltage_v || 0);
  const current = Number(d?.current_a || 0);
  const frequency = Number(d?.frequency_hz || 0);
  const factor = Number(d?.power_factor || 0);
  const temperature = Number(d?.temperature_c || 0);

  const powerStatus =
    power > 1500 ? "High load" :
    power > 800 ? "Elevated load" :
    "Normal load";

  const powerStatusClass =
    power > 1500 ? "bad" :
    power > 800 ? "warn" :
    "ok";

  const estimatedKw = power / 1000;
  const estimatedHourlyCost = estimatedKw * Number(d?.tariff || 8);

  async function toggle(key, on) {
    setBusy(prev => ({ ...prev, [key]: true }));
    setActionMsg("");

    try {
      await api("/simulator/load", {
        method: "POST",
        body: { key, on }
      });

      await Promise.all([st.reload(), s.reload()]);
      setLastUpdated(new Date());
      setActionMsg(`${on ? "Load switched on" : "Load switched off"} successfully.`);
    } catch (e) {
      setActionMsg(e.message || "Unable to update virtual load.");
    } finally {
      setBusy(prev => ({ ...prev, [key]: false }));
    }
  }

  const activeLoads = loads.filter(x => x.on);

  return (
    <div className="gw-live">

      <style>{`
        .gw-live {
          display:flex;
          flex-direction:column;
          gap:18px;
          min-width:0;
        }

        .gw-live * { box-sizing:border-box; }

        .gw-live-hero {
          position:relative;
          overflow:hidden;
          padding:23px;
          border:1px solid var(--line);
          border-radius:18px;
          background:
            radial-gradient(circle at 85% 15%,rgba(35,190,155,.15),transparent 34%),
            var(--card);
        }

        .gw-live-hero-content {
          position:relative;
          z-index:1;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:18px;
          flex-wrap:wrap;
        }

        .gw-live-eyebrow {
          color:var(--acc);
          font-size:11px;
          font-weight:850;
          letter-spacing:1.3px;
          margin-bottom:9px;
        }

        .gw-live-hero h1 {
          margin:0 0 7px;
          font-size:clamp(24px,3vw,32px);
          font-weight:850;
          letter-spacing:-.9px;
        }

        .gw-live-hero p {
          color:var(--mute);
          font-size:12px;
          line-height:1.6;
          margin:0;
          max-width:650px;
        }

        .gw-live-actions {
          display:flex;
          gap:9px;
          align-items:center;
          flex-wrap:wrap;
        }

        .gw-live-status {
          display:flex;
          align-items:center;
          gap:8px;
          padding:9px 12px;
          border:1px solid var(--line);
          background:var(--card);
          border-radius:30px;
          font-size:11px;
          font-weight:750;
        }

        .gw-live-pulse {
          width:8px;
          height:8px;
          background:#d49b35;
          border-radius:50%;
          box-shadow:0 0 0 4px rgba(212,155,53,.13);
        }

        .gw-live-pulse.active {
          background:#22b88b;
          box-shadow:0 0 0 4px rgba(34,184,139,.13);
        }

        .gw-live-button {
          padding:9px 13px;
          border:1px solid var(--line);
          background:var(--card);
          color:inherit;
          border-radius:9px;
          font-size:11px;
          font-weight:750;
          cursor:pointer;
        }

        .gw-live-button:hover { border-color:var(--acc); }

        .gw-live-main {
          display:grid;
          grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);
          gap:14px;
        }

        .gw-live-power {
          position:relative;
          overflow:hidden;
          padding:22px;
          border:1px solid var(--line);
          border-radius:16px;
          background:var(--card);
        }

        .gw-live-power-top {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
        }

        .gw-live-power-top h2 {
          margin:0;
          font-size:15px;
          font-weight:800;
        }

        .gw-live-power-number {
          margin:22px 0 4px;
          font-size:clamp(40px,6vw,61px);
          font-weight:900;
          letter-spacing:-2.5px;
          line-height:1.1;
          overflow-wrap:anywhere;
        }

        .gw-live-power-number span {
          font-size:19px;
          letter-spacing:0;
          color:var(--mute);
          font-weight:650;
        }

        .gw-live-power-description {
          color:var(--mute);
          font-size:12px;
        }

        .gw-live-meter {
          position:relative;
          height:9px;
          overflow:hidden;
          margin:24px 0 10px;
          border-radius:20px;
          background:var(--line);
        }

        .gw-live-meter-fill {
          height:100%;
          border-radius:20px;
          background:linear-gradient(90deg,var(--acc),var(--blue));
          transition:width .5s ease;
        }

        .gw-live-meter-labels {
          display:flex;
          justify-content:space-between;
          color:var(--mute);
          font-size:10px;
        }

        .gw-live-power-bottom {
          display:flex;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          padding-top:17px;
          margin-top:17px;
          border-top:1px solid var(--line);
        }

        .gw-live-power-bottom span {
          display:block;
          color:var(--mute);
          font-size:10px;
          margin-bottom:5px;
        }

        .gw-live-power-bottom strong {
          font-size:14px;
        }

        .gw-live-params {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:11px;
        }

        .gw-live-param {
          padding:15px;
          border:1px solid var(--line);
          border-radius:14px;
          background:var(--card);
          min-width:0;
        }

        .gw-live-param-label {
          color:var(--mute);
          font-size:11px;
          font-weight:650;
        }

        .gw-live-param-value {
          margin-top:12px;
          font-size:22px;
          font-weight:850;
          letter-spacing:-.6px;
          overflow-wrap:anywhere;
        }

        .gw-live-param-unit {
          font-size:11px;
          color:var(--mute);
          font-weight:600;
        }

        .gw-live-param-icon {
          display:grid;
          place-items:center;
          width:30px;
          height:30px;
          margin-bottom:11px;
          border-radius:9px;
          background:var(--accsoft);
          color:var(--acc);
          font-weight:850;
        }

        .gw-live-section-head {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          flex-wrap:wrap;
          margin-bottom:13px;
        }

        .gw-live-section-head h2 {
          font-size:16px;
          font-weight:850;
          margin:0;
        }

        .gw-live-section-head p {
          color:var(--mute);
          font-size:11px;
          margin:4px 0 0;
        }

        .gw-live-loads {
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:11px;
        }

        .gw-load {
          padding:15px;
          border:1px solid var(--line);
          border-radius:14px;
          background:var(--card);
          min-width:0;
        }

        .gw-load.active {
          border-color:var(--acc);
          background:var(--accsoft);
        }

        .gw-load-icon {
          display:grid;
          place-items:center;
          width:37px;
          height:37px;
          border-radius:11px;
          background:var(--accsoft);
          font-size:18px;
          margin-bottom:12px;
        }

        .gw-load strong {
          display:block;
          font-size:13px;
          margin-bottom:5px;
        }

        .gw-load small {
          display:block;
          color:var(--mute);
          font-size:11px;
          margin-bottom:12px;
        }

        .gw-load button {
          width:100%;
          padding:9px 10px;
          border:1px solid var(--line);
          border-radius:9px;
          background:var(--card);
          color:inherit;
          font-size:11px;
          font-weight:800;
          cursor:pointer;
        }

        .gw-load.active button {
          background:var(--acc);
          color:white;
          border-color:var(--acc);
        }

        .gw-load button:disabled {
          opacity:.55;
          cursor:wait;
        }

        .gw-live-bottom {
          display:grid;
          grid-template-columns:minmax(0,1.5fr) minmax(250px,.7fr);
          gap:14px;
        }

        .gw-live-insight {
          padding:13px;
          border:1px solid var(--line);
          border-radius:12px;
          margin-bottom:10px;
          font-size:12px;
          line-height:1.55;
        }

        .gw-live-insight:last-child { margin-bottom:0; }

        .gw-live-insight strong {
          display:block;
          margin-bottom:4px;
        }

        .gw-live-alert {
          padding:18px;
          border:1px solid rgba(35,190,155,.32);
          border-radius:15px;
          background:
            radial-gradient(circle at 100% 0%,rgba(35,190,155,.14),transparent 50%),
            var(--card);
        }

        .gw-live-alert-icon {
          display:grid;
          place-items:center;
          width:41px;
          height:41px;
          border-radius:12px;
          background:var(--accsoft);
          color:var(--acc);
          font-size:19px;
          margin-bottom:13px;
        }

        .gw-live-alert h3 {
          font-size:15px;
          margin:0 0 7px;
          font-weight:850;
        }

        .gw-live-alert p {
          color:var(--mute);
          font-size:12px;
          line-height:1.6;
          margin:0 0 14px;
        }

        .gw-live-alert a {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:8px;
          padding:11px 12px;
          border-radius:10px;
          background:var(--acc);
          color:white;
          text-decoration:none;
          font-size:12px;
          font-weight:800;
        }

        .gw-live-note {
          padding:12px 14px;
          border:1px solid var(--line);
          border-radius:11px;
          color:var(--mute);
          font-size:11px;
          line-height:1.6;
        }

        @media(max-width:950px) {
          .gw-live-main { grid-template-columns:1fr; }
          .gw-live-loads { grid-template-columns:repeat(2,minmax(0,1fr)); }
        }

        @media(max-width:700px) {
          .gw-live-bottom { grid-template-columns:1fr; }
          .gw-live-params { grid-template-columns:repeat(2,minmax(0,1fr)); }
        }

        @media(max-width:420px) {
          .gw-live-params { gap:8px; }
          .gw-live-param { padding:11px; }
          .gw-live-param-value { font-size:19px; }
          .gw-live-loads { gap:8px; }
          .gw-load { padding:11px; }
        }
      `}</style>

      {/* HERO */}
      <section className="gw-live-hero">
        <div className="gw-live-hero-content">
          <div>
            <div className="gw-live-eyebrow">ϟ GRIDWISE · LIVE MONITORING</div>
            <h1>Live Energy</h1>
            <p>
              Monitor electrical parameters, experiment with virtual loads and
              observe how your energy profile changes.
            </p>
          </div>

          <div className="gw-live-actions">
            <div className="gw-live-status">
              <span className={`gw-live-pulse ${auto ? "active" : ""}`} />
              {auto ? "Auto-refresh enabled" : "Refresh paused"}
            </div>

            <button
              className="gw-live-button"
              onClick={() => {
                s.reload();
                st.reload();
                setLastUpdated(new Date());
              }}
            >
              ↻ Refresh now
            </button>

            <button
              className="gw-live-button"
              onClick={() => setAuto(v => !v)}
            >
              {auto ? "Ⅱ Pause" : "▶ Resume"}
            </button>
          </div>
        </div>
      </section>

      {s.err && <div className="err" role="alert">{s.err}</div>}

      {d && (
        <>
          {/* LIVE POWER AND ELECTRICAL PARAMETERS */}
          <section className="gw-live-main">

            <div className="gw-live-power">
              <div className="gw-live-power-top">
                <h2>Instantaneous power</h2>
                <span className={`tag ${powerStatusClass}`}>{powerStatus}</span>
              </div>

              <div className="gw-live-power-number">
                {power.toFixed(1)} <span>W</span>
              </div>

              <div className="gw-live-power-description">
                Current simulated electrical load
              </div>

              <div className="gw-live-meter">
                <div
                  className="gw-live-meter-fill"
                  style={{width:`${Math.min(100,Math.max(0,power / 2400 * 100))}%`}}
                />
              </div>

              <div className="gw-live-meter-labels">
                <span>0 W</span>
                <span>1,200 W</span>
                <span>2,400 W</span>
              </div>

              <div className="gw-live-power-bottom">
                <div>
                  <span>Estimated hourly cost</span>
                  <strong>{inr(estimatedHourlyCost)}</strong>
                </div>
                <div>
                  <span>Active virtual loads</span>
                  <strong>{activeLoads.length}</strong>
                </div>
                <div>
                  <span>Last reading</span>
                  <strong>{d.last_reading ? hh(d.last_reading) : "—"}</strong>
                </div>
              </div>
            </div>

            <div className="gw-live-params">
              {[
                ["Voltage",voltage.toFixed(1),"V","V"],
                ["Current",current.toFixed(3),"A","A"],
                ["Frequency",frequency.toFixed(2),"Hz","Hz"],
                ["Power factor",factor.toFixed(2),"Virtual","PF"],
                ["Temperature",temperature.toFixed(1),"°C","T"],
                ["Energy today",Number(d.today_kwh || 0).toFixed(2),"kWh","E"]
              ].map(([label,value,unit,icon]) => (
                <div className="gw-live-param" key={label}>
                  <div className="gw-live-param-icon">{icon}</div>
                  <div className="gw-live-param-label">{label}</div>
                  <div className="gw-live-param-value">
                    {value} <span className="gw-live-param-unit">{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* VIRTUAL LOAD CONTROL */}
          <section className="card">
            <div className="gw-live-section-head">
              <div>
                <h2>Virtual load control</h2>
                <p>Switch simulated appliances on or off to change the demo load.</p>
              </div>
              <span className="tag warn">Simulation</span>
            </div>

            {st.loading ? (
              <p className="muted">Loading virtual loads...</p>
            ) : loads.length ? (
              <div className="gw-live-loads">
                {loads.map((l, index) => (
                  <div className={`gw-load ${l.on ? "active" : ""}`} key={l.key}>
                    <div className="gw-load-icon">
                      {index === 0 ? "☼" : index === 1 ? "◉" : index === 2 ? "⚙" : "ϟ"}
                    </div>
                    <strong>{l.name}</strong>
                    <small>{l.watts} W rated simulated load</small>
                    <button
                      disabled={!!busy[l.key]}
                      onClick={() => toggle(l.key,!l.on)}
                    >
                      {busy[l.key] ? "Updating..." : l.on ? "● Turn off" : "＋ Turn on"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No virtual loads are configured.</p>
            )}

            {actionMsg && (
              <p className="muted small" role="status" style={{marginTop:12}}>
                {actionMsg}
              </p>
            )}

            <div className="gw-live-insight" style={{marginTop:14}}>
              <strong>Virtual load summary</strong>
              {activeLoads.length
                ? `${activeLoads.length} simulated appliance(s) are active, with ${totalLoad} W of configured rated load.`
                : "All configured virtual appliances are currently switched off."}
              <div className="muted small" style={{marginTop:5}}>
                Rated appliance wattage is not guaranteed to equal the total meter reading.
              </div>
            </div>
          </section>

          {/* LIVE TREND */}
          <section className="card">
            <div className="gw-live-section-head">
              <div>
                <h2>Live power trend</h2>
                <p>Recent power readings over the last hour</p>
              </div>
              <span className="tag">{auto ? "Auto-refresh on" : "Paused"}</span>
            </div>

            <PowerChart hours={1} poll={auto ? 3000 : 0} />
          </section>

          {/* INSIGHTS AND EMAIL ALERTS */}
          <section className="gw-live-bottom">
            <div className="card">
              <div className="gw-live-section-head">
                <div>
                  <h2>Live energy insights</h2>
                  <p>Quick interpretation of the current virtual readings</p>
                </div>
              </div>

              <div className="gw-live-insight">
                <strong>Power demand</strong>
                {power > 1500
                  ? "The current simulated load is relatively high. Review which virtual appliances are active."
                  : power > 800
                  ? "The simulated demand is elevated. Monitor the load as appliances are switched."
                  : "The current simulated demand is within the lower-load range of this demo."}
              </div>

              <div className="gw-live-insight">
                <strong>Voltage reading</strong>
                {voltage
                  ? `The virtual sensor currently reports ${voltage.toFixed(1)} V. This is a simulated value, not a verified electrical measurement.`
                  : "Waiting for a voltage reading."}
              </div>

              <div className="gw-live-insight">
                <strong>Energy cost estimate</strong>
                {`At the configured tariff of ₹${d.tariff || 8}/kWh, the current power level represents approximately ${inr(estimatedHourlyCost)} per hour if sustained.`}
              </div>

              <button
                className="gw-live-button"
                style={{marginTop:5}}
                onClick={() => setShowDetails(v => !v)}
              >
                {showDetails ? "Hide monitoring details" : "Show monitoring details"}
              </button>

              {showDetails && (
                <div className="gw-live-insight" style={{marginTop:12}}>
                  <strong>Monitoring information</strong>
                  <div>Refresh interval: 3 seconds when enabled</div>
                  <div>Last UI refresh: {lastUpdated.toLocaleTimeString("en-IN")}</div>
                  <div>Sensor type: Virtual simulator</div>
                  <div>Data source: GridWise demo backend</div>
                  <div>Hardware connection: Not connected</div>
                </div>
              )}
            </div>

            <div className="gw-live-alert">
              <div className="gw-live-alert-icon">✉</div>
              <h3>Email alert center</h3>
              <p>
                Manage anomaly notifications, recipient details and escalation
                preferences from the central alert workspace.
              </p>
              <Link to="/app/anomalies">
                <span>Configure email alerts</span>
                <span>→</span>
              </Link>
              <p className="muted small" style={{marginTop:12,marginBottom:0}}>
                Email delivery depends on your configured backend notification service.
              </p>
            </div>
          </section>

          {/* TRANSPARENCY */}
          <div className="gw-live-note">
            <b>Virtual sensor notice:</b> Power, voltage, current, frequency,
            power factor and temperature are simulated demo readings. They do not
            represent measurements from a connected physical meter. The live
            interface is designed to support future hardware integration.
          </div>
        </>
      )}
    </div>
  );
}



export function Analytics() {
  const r = useGet("/analytics");
  const [range, setRange] = useState("all");
  const [metric, setMetric] = useState("kwh");
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState(() => localStorage.getItem("gw_analytics_email") || "");
  const [emailAlerts, setEmailAlerts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("gw_analytics_alerts")) ||
        { peak: true, unusual: true, weekly: true, report: false };
    } catch {
      return { peak: true, unusual: true, weekly: true, report: false };
    }
  });
  const [message, setMessage] = useState("");

  const d = r.data || {};
  const daily = Array.isArray(d.daily) ? d.daily : [];
  const hourly = Array.isArray(d.hourly) ? d.hourly : [];

  const filteredDaily = range === "all"
    ? daily
    : daily.slice(-Number(range));

  const totalKwh = filteredDaily.reduce((sum, x) => sum + (Number(x.kwh) || 0), 0);
  const averageDaily = filteredDaily.length ? totalKwh / filteredDaily.length : 0;
  const peakHour = [...hourly].sort((a, b) => (Number(b.avg_kw) || 0) - (Number(a.avg_kw) || 0))[0];
  const lowestHour = [...hourly].sort((a, b) => (Number(a.avg_kw) || 0) - (Number(b.avg_kw) || 0))[0];
  const peakDay = [...filteredDaily].sort((a, b) => (Number(b.kwh) || 0) - (Number(a.kwh) || 0))[0];
  const previousDaily = range === "all" ? [] : daily.slice(-Number(range) * 2, -Number(range));
  const previousAverage = previousDaily.length
    ? previousDaily.reduce((sum, x) => sum + (Number(x.kwh) || 0), 0) / previousDaily.length
    : 0;
  const change = previousAverage > 0
    ? ((averageDaily - previousAverage) / previousAverage) * 100
    : null;

  const format = (v, digits = 2) => Number(v || 0).toFixed(digits);
  const saveAlerts = () => {
    localStorage.setItem("gw_analytics_email", email);
    localStorage.setItem("gw_analytics_alerts", JSON.stringify(emailAlerts));
    setMessage("Preferences saved on this browser.");
  };

  const exportCsv = () => {
    const rows = [
      ["Date", "Energy (kWh)"],
      ...filteredDaily.map(x => [x.date, x.kwh])
    ];
    const csv = rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gridwise-analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHourly = () => {
    const rows = [
      ["Hour", "Average load (kW)"],
      ...hourly.map(x => [x.hour, x.avg_kw])
    ];
    const csv = rows.map(row => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gridwise-hourly-patterns.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const chartTooltip = {
    contentStyle: {
      background: "var(--card)",
      border: "1px solid var(--line)",
      borderRadius: 12,
      color: "var(--text)"
    },
    labelStyle: { color: "var(--text)" }
  };

  return (
    <div className="gw-analytics">
      <style>{`
        .gw-analytics{display:grid;gap:18px;color:var(--text)}
        .gw-analytics *{box-sizing:border-box}
        .gw-an-hero{position:relative;overflow:hidden;padding:25px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(120deg,var(--card),var(--accsoft))}
        .gw-an-hero:after{content:"";position:absolute;width:230px;height:230px;border-radius:50%;right:-65px;top:-100px;background:var(--acc);opacity:.08}
        .gw-an-eyebrow{font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--acc)}
        .gw-an-hero h1{font-size:27px;margin:9px 0 7px;letter-spacing:-.7px}
        .gw-an-hero p{margin:0;color:var(--mute);max-width:650px;line-height:1.6}
        .gw-an-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}
        .gw-an-btn{border:1px solid var(--line);background:var(--card);color:var(--text);padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer}
        .gw-an-btn.primary{background:var(--acc);color:white;border-color:var(--acc)}
        .gw-an-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
        .gw-an-pills{display:flex;gap:6px;flex-wrap:wrap}
        .gw-an-pills button{border:1px solid var(--line);background:var(--card);color:var(--mute);padding:8px 13px;border-radius:9px;cursor:pointer;font-weight:700}
        .gw-an-pills button.active{background:var(--accsoft);border-color:var(--acc);color:var(--acc)}
        .gw-an-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .gw-an-stat{padding:17px;border:1px solid var(--line);border-radius:15px;background:var(--card);min-width:0}
        .gw-an-stat-label{font-size:12px;color:var(--mute);font-weight:700}
        .gw-an-stat-value{font-size:25px;font-weight:850;letter-spacing:-.7px;margin-top:9px;overflow-wrap:anywhere}
        .gw-an-stat-foot{font-size:11px;color:var(--mute);margin-top:7px}
        .gw-an-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--accsoft);color:var(--acc);font-size:17px;margin-bottom:12px}
        .gw-an-two{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}
        .gw-an-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .gw-an-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0}
        .gw-an-card h3{font-size:15px;margin:0 0 5px}
        .gw-an-sub{font-size:12px;color:var(--mute);margin:0 0 15px;line-height:1.5}
        .gw-an-insight{padding:14px;border:1px solid var(--line);border-radius:13px;background:var(--card)}
        .gw-an-insight strong{display:block;font-size:14px;margin-bottom:6px}
        .gw-an-insight p{font-size:12px;color:var(--mute);line-height:1.55;margin:0}
        .gw-an-bar{height:7px;background:var(--line);border-radius:20px;overflow:hidden;margin-top:10px}
        .gw-an-bar span{height:100%;display:block;background:var(--acc);border-radius:20px}
        .gw-an-mail{border:1px solid var(--line);border-radius:17px;padding:20px;background:linear-gradient(120deg,var(--card),var(--accsoft))}
        .gw-an-mail-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .gw-an-mail h3{margin:0 0 5px;font-size:16px}
        .gw-an-mail p{margin:0;color:var(--mute);font-size:12px;line-height:1.5}
        .gw-an-mail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
        .gw-an-mail-option{display:flex;align-items:flex-start;gap:10px;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:11px;font-size:12px}
        .gw-an-mail-option input{margin-top:2px;accent-color:var(--acc)}
        .gw-an-mail-option b{display:block;margin-bottom:3px}
        .gw-an-input{width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);margin-top:12px}
        .gw-an-note{font-size:11px;color:var(--mute);line-height:1.55}
        .gw-an-empty{padding:28px;text-align:center;color:var(--mute);border:1px dashed var(--line);border-radius:13px}
        @media(max-width:850px){.gw-an-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gw-an-two{grid-template-columns:1fr}}
        @media(max-width:560px){.gw-an-three{grid-template-columns:1fr}.gw-an-mail-grid{grid-template-columns:1fr}.gw-an-hero{padding:19px}.gw-an-hero h1{font-size:23px}}
      `}</style>

      <div className="gw-an-hero">
        <div className="gw-an-eyebrow">GridWise Intelligence / Energy Analytics</div>
        <h1>Understand every unit of energy.</h1>
        <p>Explore consumption patterns, identify demand peaks, compare daily usage and turn recorded meter data into clearer operational decisions.</p>
        <div className="gw-an-actions">
          <button className="gw-an-btn primary" onClick={exportCsv}>↓ Export daily data</button>
          <button className="gw-an-btn" onClick={downloadHourly}>↓ Export hourly profile</button>
          <button className="gw-an-btn" onClick={() => window.print()}>Print analytics</button>
        </div>
      </div>

      <div className="gw-an-toolbar">
        <div>
          <b>Consumption overview</b>
          <div className="gw-an-sub" style={{ margin: "4px 0 0" }}>Choose the period for your daily energy analysis</div>
        </div>
        <div className="gw-an-pills">
          {[["7","7 days"],["14","14 days"],["30","30 days"],["all","All data"]].map(([v,label]) =>
            <button key={v} className={range === v ? "active" : ""} onClick={() => setRange(v)}>{label}</button>
          )}
        </div>
      </div>

      <State r={r}>
        {() => (
          <>
            <div className="gw-an-grid">
              <div className="gw-an-stat">
                <div className="gw-an-icon">ϟ</div>
                <div className="gw-an-stat-label">Peak hourly demand</div>
                <div className="gw-an-stat-value">{format(d.peak_kw, 2)} <small style={{fontSize:12}}>kW</small></div>
                <div className="gw-an-stat-foot">Highest recorded hourly demand</div>
              </div>
              <div className="gw-an-stat">
                <div className="gw-an-icon">▥</div>
                <div className="gw-an-stat-label">Energy in selected period</div>
                <div className="gw-an-stat-value">{format(totalKwh, 1)} <small style={{fontSize:12}}>kWh</small></div>
                <div className="gw-an-stat-foot">{filteredDaily.length} daily records included</div>
              </div>
              <div className="gw-an-stat">
                <div className="gw-an-icon">◷</div>
                <div className="gw-an-stat-label">Average daily energy</div>
                <div className="gw-an-stat-value">{format(averageDaily, 2)} <small style={{fontSize:12}}>kWh</small></div>
                <div className="gw-an-stat-foot">Average across selected records</div>
              </div>
              <div className="gw-an-stat">
                <div className="gw-an-icon">↗</div>
                <div className="gw-an-stat-label">Period comparison</div>
                <div className="gw-an-stat-value" style={{color:change === null ? "var(--text)" : change > 0 ? "var(--warn)" : "var(--acc)"}}>
                  {change === null ? "—" : `${change > 0 ? "+" : ""}${format(change, 1)}%`}
                </div>
                <div className="gw-an-stat-foot">{change === null ? "Previous period unavailable" : "Average daily energy vs previous period"}</div>
              </div>
            </div>

            <div className="gw-an-two">
              <div className="gw-an-card">
                <h3>Daily energy trend</h3>
                <p className="gw-an-sub">Recorded consumption over the selected period</p>
                {filteredDaily.length ? (
                  <Chart>
                    <AreaChart data={filteredDaily}>
                      <defs>
                        <linearGradient id="gwAnalyticsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--blue)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--blue)" stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--line)" strokeDasharray="3 3"/>
                      <XAxis dataKey="date" {...axis} minTickGap={25}/>
                      <YAxis {...axis} width={42}/>
                      <Tooltip {...chartTooltip}/>
                      <Area type="monotone" dataKey="kwh" name="Energy (kWh)" stroke="var(--blue)" strokeWidth={2.5} fill="url(#gwAnalyticsFill)" activeDot={{r:5}}/>
                    </AreaChart>
                  </Chart>
                ) : <div className="gw-an-empty">No daily readings available for this period.</div>}
              </div>

              <div className="gw-an-card">
                <h3>Hourly demand fingerprint</h3>
                <p className="gw-an-sub">Average load across the 24 hours of a day</p>
                {hourly.length ? (
                  <Chart>
                    <BarChart data={hourly}>
                      <CartesianGrid stroke="var(--line)" strokeDasharray="3 3"/>
                      <XAxis dataKey="hour" {...axis}/>
                      <YAxis {...axis} width={38}/>
                      <Tooltip {...chartTooltip}/>
                      <Bar dataKey="avg_kw" name="Average load (kW)" fill="var(--acc)" radius={[4,4,0,0]}/>
                    </BarChart>
                  </Chart>
                ) : <div className="gw-an-empty">Hourly profile is not available yet.</div>}
              </div>
            </div>

            <div className="gw-an-three">
              <div className="gw-an-insight">
                <div className="gw-an-icon">⚡</div>
                <strong>Highest demand hour</strong>
                <div style={{fontSize:22,fontWeight:850}}>{peakHour ? `${peakHour.hour}:00` : "—"}</div>
                <p>{peakHour ? `${format(peakHour.avg_kw, 2)} kW average load during this hour.` : "Hourly demand data unavailable."}</p>
                {peakHour && <div className="gw-an-bar"><span style={{width:`${Math.min(100, Number(peakHour.avg_kw) / Math.max(Number(d.peak_kw) || 1, Number(peakHour.avg_kw) || 1) * 100)}%`}}/></div>}
              </div>
              <div className="gw-an-insight">
                <div className="gw-an-icon">◌</div>
                <strong>Lowest demand hour</strong>
                <div style={{fontSize:22,fontWeight:850}}>{lowestHour ? `${lowestHour.hour}:00` : "—"}</div>
                <p>{lowestHour ? `${format(lowestHour.avg_kw, 2)} kW average load during this hour.` : "Hourly demand data unavailable."}</p>
              </div>
              <div className="gw-an-insight">
                <div className="gw-an-icon">▤</div>
                <strong>Highest energy day</strong>
                <div style={{fontSize:22,fontWeight:850}}>{peakDay ? format(peakDay.kwh, 2) : "—"} <small style={{fontSize:12}}>kWh</small></div>
                <p>{peakDay ? `Peak daily consumption recorded on ${peakDay.date}.` : "Daily energy data unavailable."}</p>
              </div>
            </div>

            <div className="gw-an-card">
              <div className="gw-an-toolbar">
                <div>
                  <h3>Daily consumption breakdown</h3>
                  <p className="gw-an-sub" style={{margin:"4px 0 0"}}>Review each recorded day in the selected period</p>
                </div>
                <div className="gw-an-pills">
                  <button className={metric === "kwh" ? "active" : ""} onClick={() => setMetric("kwh")}>Energy</button>
                  <button className={metric === "kw" ? "active" : ""} onClick={() => setMetric("kw")}>Daily ranking</button>
                </div>
              </div>
              {filteredDaily.length ? (
                <div style={{display:"grid",gap:12,marginTop:16}}>
                  {[...filteredDaily]
                    .sort((a,b) => metric === "kw" ? (Number(b.kwh)||0) - (Number(a.kwh)||0) : String(a.date).localeCompare(String(b.date)))
                    .map((x,i) => {
                      const max = Math.max(...filteredDaily.map(v => Number(v.kwh)||0), 1);
                      return <div key={`${x.date}-${i}`} style={{display:"grid",gridTemplateColumns:"90px 1fr 75px",alignItems:"center",gap:12}}>
                        <span style={{fontSize:12,color:"var(--mute)"}}>{x.date}</span>
                        <div className="gw-an-bar" style={{margin:0,height:9}}><span style={{width:`${Math.max(1,(Number(x.kwh)||0)/max*100)}%`}}/></div>
                        <b style={{fontSize:12,textAlign:"right"}}>{format(x.kwh,2)} kWh</b>
                      </div>;
                    })}
                </div>
              ) : <div className="gw-an-empty">No daily data to display.</div>}
            </div>
          </>
        )}
      </State>

      <div className="gw-an-mail">
        <div className="gw-an-mail-head">
          <div>
            <h3>✉ Analytics email preferences</h3>
            <p>Choose the analytical events you would like to receive updates about.</p>
          </div>
          <button className="gw-an-btn primary" onClick={() => setShowEmail(!showEmail)}>
            {showEmail ? "Close preferences" : "Configure email alerts"}
          </button>
        </div>
        {showEmail && (
          <div style={{marginTop:16}}>
            <label style={{fontSize:12,fontWeight:700}}>Notification email address</label>
            <input className="gw-an-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}/>
            <div className="gw-an-mail-grid">
              {[
                ["peak","Peak demand insights","When recorded demand reaches a notable peak."],
                ["unusual","Unusual usage patterns","When analytics identifies a pattern worth reviewing."],
                ["weekly","Weekly energy summary","A weekly overview of recorded energy consumption."],
                ["report","Monthly analytics report","A monthly report preference."]
              ].map(([key,title,desc]) => (
                <label className="gw-an-mail-option" key={key}>
                  <input type="checkbox" checked={!!emailAlerts[key]} onChange={e => setEmailAlerts(old => ({...old,[key]:e.target.checked}))}/>
                  <span><b>{title}</b><span style={{color:"var(--mute)"}}>{desc}</span></span>
                </label>
              ))}
            </div>
            <div className="gw-an-actions">
              <button className="gw-an-btn primary" onClick={saveAlerts}>Save preferences</button>
              {message && <span className="gw-an-note" role="status">{message}</span>}
            </div>
            <p className="gw-an-note" style={{marginTop:12}}>Demo mode: these preferences are stored in this browser only. Actual email delivery and scheduled reports require a configured backend email service.</p>
          </div>
        )}
      </div>

      <div className="gw-an-note">
        <b>Data methodology:</b> Analytics is based on recorded readings returned by the current analytics API. Hourly averages and daily energy totals describe the available data; comparisons are shown only when a previous period exists. Demo-mode readings may be simulated.
      </div>
    </div>
  );
}



export function Anomalies() {
  const r = useGet("/anomalies");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [acknowledged, setAcknowledged] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [notes, setNotes] = useState({});

  const items = r.data?.items || [];

  const counts = {
    total: items.length,
    critical: items.filter(x => x.severity === "critical").length,
    high: items.filter(x => x.severity === "high").length,
    medium: items.filter(x => x.severity === "medium").length,
    low: items.filter(x => x.severity === "low").length
  };

  const active = items.filter(x => !resolved.includes(String(x.ts)));
  const unresolved = active.filter(x => !acknowledged.includes(String(x.ts)));
  const acknowledgedCount = acknowledged.filter(id =>
      items.some(x => String(x.ts) === id) && !resolved.includes(id)
    ).length;

  const averageScore = items.length
    ? items.reduce((sum, x) => sum + Number(x.score || 0), 0) / items.length
    : 0;

  const visible = items.filter(x => {
    const id = String(x.ts);
    const severityMatch =
      filter === "all" ||
      (filter === "unresolved" && !acknowledged.includes(id) && !resolved.includes(id)) ||
      x.severity === filter;

    const searchMatch =
      `${x.explanation || ""} ${x.next_steps || ""} ${x.method || ""} ${hh(x.ts)}`
        .toLowerCase().includes(search.toLowerCase());

    return severityMatch && searchMatch;
  });

  async function inject() {
    try {
      await api("/simulator/anomaly", { method: "POST" });
      setMessage("Demo anomaly injected successfully.");
      r.reload();
    } catch {
      setMessage("Could not inject anomaly. Check backend connection.");
    }
  }

  function exportCSV() {
    const rows = [
      ["Timestamp", "Severity", "Score", "Observed kW", "Expected kW", "Difference %", "Explanation"],
      ...items.map(x => [
        x.ts, x.severity, x.score, x.observed_kw,
        x.expected_kw, x.diff_pct, x.explanation
      ])
    ];

    const csv = rows.map(row =>
      row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gridwise-anomaly-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const severityColor = {
    critical: "#dc5555",
    high: "#e58a38",
    medium: "#d2a63b",
    low: "#299e83"
  };

  return (
    <>
      <Head
        t="Anomaly Intelligence Center"
        s="Detect unusual energy behaviour, investigate incidents and coordinate alert response."
      />

      <div className="card" style={{
        marginBottom: 18,
        background: "linear-gradient(120deg,var(--card),var(--accsoft))",
        border: "1px solid var(--line)"
      }}>
        <div className="hd">
          <div>
            <span className="tag warn">INTELLIGENT MONITORING</span>
            <h2 style={{ marginTop: 12 }}>Energy anomaly command center</h2>
            <p className="muted small">Your energy monitoring and incident response overview.</p>
          </div>
          <div style={{ fontSize: 32 }}>⚡</div>
        </div>

        <div className="grid" style={{ marginTop: 18 }}>
          <Stat l="Total detected" v={counts.total} />
          <Stat l="Unacknowledged" v={unresolved.length} />
          <Stat l="High + critical" v={counts.high + counts.critical} />
          <Stat l="Average risk score" v={averageScore.toFixed(1)} />
          </div>

        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 18 }}>
          <span className="tag plan">Demo mode: simulated</span>
          <button className="btn ghost" onClick={() => r.reload()}>↻ Refresh detections</button>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 18 }}>
        {[
          ["Critical", counts.critical, "critical"],
          ["High", counts.high, "high"],
          ["Medium", counts.medium, "medium"],
          ["Low", counts.low, "low"]
        ].map(([label, value, key]) => (
          <div className="card" key={key}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{label}</b>
              <span style={{ color: severityColor[key], fontWeight: 800 }}>●</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 10 }}>{value}</div>
            <div style={{ height: 7, background: "var(--line)", borderRadius: 20, marginTop: 12, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${counts.total ? value / counts.total * 100 : 0}%`,
                background: severityColor[key]
              }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Smart alert center</h2>
            <p className="muted small">Recipient management, email notifications and escalation settings.</p>
          </div>
          <span className="tag plan">Notifications</span>
        </div>
        <AlertsPanel />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Incident investigation workspace</h2>
            <p className="muted small">Search, filter, review and investigate detected anomalies.</p>
          </div>
          <span className="tag">{active.length} active</span>
        </div>

        <div className="row" style={{ flexWrap: "wrap", marginTop: 14 }}>
          <button className="btn" onClick={inject}>+ Inject demo anomaly</button>
          <button className="btn ghost" onClick={exportCSV} disabled={!items.length}>↓ Export CSV</button>
        </div>

        {message && <p className="muted small" role="status" style={{ marginTop: 12 }}>{message}</p>}

        <input
          type="text"
          placeholder="Search anomaly, explanation or detection method..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", marginTop: 16 }}
        />

        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {[
            ["all", "All"],
            ["unresolved", "Unacknowledged"],
            ["critical", "Critical"],
            ["high", "High"],
            ["medium", "Medium"],
            ["low", "Low"]
          ].map(([value, label]) => (
            <button
              key={value}
              className={`btn ${filter === value ? "" : "ghost"}`}
              style={{ padding: "7px 12px" }}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <State r={r}>
        {d => {
          if (!d.sufficient) {
            return <div className="card"><Empty m="At least 3 days of data are required for reliable anomaly analysis." /></div>;
          }

          if (!visible.length) {
            return <div className="card"><Empty m={items.length ? "No anomalies match your filters." : "No unusual consumption detected."} /></div>;
          }

          return (
            <div style={{ display: "grid", gap: 14 }}>
              {visible.map((x, index) => {
                const id = String(x.ts);
                const isAcknowledged = acknowledged.includes(id);
                const isResolved = resolved.includes(id);
                const isExpanded = expanded === id;

                return (
                  <div
                    key={id}
                    className={`item ${x.severity}`}
                    style={{
                      padding: 18,
                      border: "1px solid var(--line)",
                      borderLeft: `4px solid ${severityColor[x.severity] || "var(--acc)"}`,
                      borderRadius: 14,
                      opacity: isResolved ? 0.7 : 1
                    }}
                  >
                    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                      <div>
                        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                          <Sev s={x.severity} />
                          <span className="tag plan">Score {x.score}</span>
                          <span className="tag">
                            {isResolved ? "Resolved locally" : isAcknowledged ? "Acknowledged locally" : "Unacknowledged"}
                          </span>
                        </div>
                        <h3 style={{ marginTop: 12 }}>{x.severity?.toUpperCase()} consumption deviation</h3>
                        <p className="muted small">Incident #{index + 1} · {hh(x.ts)}</p>
                      </div>
                      <button className="btn ghost" onClick={() => setExpanded(isExpanded ? null : id)}>
                        {isExpanded ? "Close details ↑" : "Investigate →"}
                      </button>
                    </div>

                    <p style={{ marginTop: 14 }}>{x.explanation}</p>

                    <div className="grid" style={{ marginTop: 16 }}>
                      <Stat l="Observed power" v={x.observed_kw} u="kW" />
                      <Stat l="Expected power" v={x.expected_kw} u="kW" />
                      <Stat l="Deviation" v={`${x.diff_pct > 0 ? "+" : ""}${x.diff_pct}%`} />
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: 18, padding: 16, background: "var(--accsoft)", borderRadius: 12 }}>
                        <h3>Investigation details</h3>
                        <p className="muted small" style={{ marginTop: 10 }}><b>Detection method:</b> {x.method}</p>
                        <p className="muted small"><b>Recommended action:</b> {x.next_steps}</p>
                        <p className="muted small">
                          Compare observed power with the historical baseline and check equipment operation and schedules.
                        </p>

                        <label className="f" style={{ marginTop: 16 }}>
                          Investigation notes
                          <textarea
                            rows={3}
                            placeholder="Record investigation findings..."
                            value={notes[id] || ""}
                            onChange={e => setNotes(old => ({ ...old, [id]: e.target.value }))}
                          />
                        </label>

                        <div className="row" style={{ flexWrap: "wrap", marginTop: 14 }}>
                          {!isAcknowledged && !isResolved && (
                            <button className="btn" onClick={() => setAcknowledged(old => [...old, id])}>
                              ✓ Acknowledge
                            </button>
                          )}
                          {!isResolved && (
                            <button className="btn ghost" onClick={() => setResolved(old => [...old, id])}>
                              Mark resolved
                            </button>
                          )}
                          <button
                            className="btn ghost"
                            onClick={() => {
                              const text = `GridWise AI anomaly\nSeverity: ${x.severity}\nTime: ${hh(x.ts)}\nObserved: ${x.observed_kw} kW\nExpected: ${x.expected_kw} kW\nDeviation: ${x.diff_pct}%\nExplanation: ${x.explanation}\nNotes: ${notes[id] || "None"}`;
                              if (navigator.clipboard?.writeText) {
                                navigator.clipboard.writeText(text);
                                setMessage("Incident details copied.");
                              } else {
                                setMessage("Clipboard is not available in this browser.");
                              }
                            }}
                          >
                            Copy incident
                          </button>
                        </div>

                        <p className="muted small" style={{ marginTop: 12 }}>
                          Incident status and notes are temporary page-session data; they are not saved to the backend.
                        </p>
                      </div>
                    )}

                    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 16 }}>
                      <span className="muted small">Hourly baseline · Aggregate meter data</span>
                      <button className="btn ghost" onClick={() => setExpanded(isExpanded ? null : id)}>
                        {isExpanded ? "Hide details" : "View incident"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }}
      </State>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="hd">
          <h2>Detection methodology</h2>
          <span className="tag plan">Explainable analytics</span>
        </div>
        <div className="grid">
          <Stat l="Detection approach" v="Robust Z-score" />
          <Stat l="Baseline grouping" v="Hour of day" />
          <Stat l="Comparison" v="Median / MAD" />
        </div>
        <p className="muted small" style={{ marginTop: 14 }}>
          Unusual deviations are flagged for human investigation. An anomaly is not proof of equipment failure or confirmed energy waste.
        </p>
      </div>
    </>
  );
}




export function Forecasts() {
  const r = useGet("/forecast");

  const [view, setView] = useState("all");
  const [showScenario, setShowScenario] = useState(false);
  const [reduction, setReduction] = useState(10);
  const [showConfidence, setShowConfidence] = useState(true);
  const [message, setMessage] = useState("");

  const [alertSettings, setAlertSettings] = useState({
    peak: true,
    high: true,
    cost: false
  });

  function exportCSV(data) {
    const rows = [
      ["Timestamp", "Forecast kW", "Lower range kW", "Upper range kW"],
      ...data.points.map(p => [p.ts, p.kw, p.lo, p.hi])
    ];

    const csv = rows.map(row =>
      row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gridwise-energy-forecast.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Forecast report exported successfully.");
  }

  return (
    <>
      <Head
        t="Predictive Energy Intelligence"
        s="Anticipate demand, understand forecast uncertainty and prepare for tomorrow's energy requirements."
      />

      <State r={r}>
        {d => {
          if (!d.sufficient) {
            return <div className="card"><Empty m={d.message || "More energy data is required to generate a reliable forecast."} /></div>;
          }

          const points = d.points || [];
          const chartData = points.map(p => ({
            t: hh(p.ts),
            kw: Number(p.kw || 0),
            lo: Number(p.lo ?? p.kw ?? 0),
            hi: Number(p.hi ?? p.kw ?? 0),
            scenario: Number(p.kw || 0) * (1 - reduction / 100)
          }));

          const peak = points.length
            ? points.reduce((a, b) => Number(a.kw) > Number(b.kw) ? a : b)
            : null;

          const average = points.length
            ? points.reduce((sum, p) => sum + Number(p.kw || 0), 0) / points.length
            : 0;

          const peakValue = peak ? Number(peak.kw || 0) : 0;
          const uncertaintyWidth = points.length
            ? points.reduce((sum, p) =>
                sum + Math.max(0, Number(p.hi ?? p.kw) - Number(p.lo ?? p.kw)), 0
              ) / points.length
            : 0;

          const scenarioDaily = Number(d.daily_kwh || 0) * (1 - reduction / 100);
          const scenarioMonthly = Number(d.projected_month_kwh || 0) * (1 - reduction / 100);
          const scenarioCost = Number(d.projected_month_cost_inr || 0) * (1 - reduction / 100);

          const filteredData = chartData.filter((p, i) => {
            if (view === "first12") return i < 12;
            if (view === "last12") return i >= 12;
            return true;
          });

          const metrics = d.metrics || {};
          const model = metrics.model || {};
          const seasonal = metrics.seasonal_naive || {};

          const peakTime = peak ? hh(peak.ts) : "N/A";

          return (
            <>
              {/* HERO */}
              <div className="card" style={{
                marginBottom: 18,
                background: "linear-gradient(120deg,var(--card),var(--accsoft))",
                border: "1px solid var(--line)"
              }}>
                <div className="hd">
                  <div>
                    <span className="tag plan">PREDICTIVE INTELLIGENCE</span>
                    <h2 style={{ fontSize: 25, marginTop: 12 }}>See what's coming next.</h2>
                    <p className="muted small">
                      Forecast-driven visibility into future consumption and operating demand.
                    </p>
                  </div>
                  <div style={{ fontSize: 38 }}>◈</div>
                </div>

                <div className="grid" style={{ marginTop: 20 }}>
                  <Stat l="Expected daily energy" v={Number(d.daily_kwh).toFixed(2)} u="kWh" />
                  <Stat l="Projected monthly energy" v={Number(d.projected_month_kwh).toFixed(2)} u="kWh" />
                  <Stat l="Projected monthly cost" v={inr(d.projected_month_cost_inr)} />
                  <Stat l="Average forecast power" v={average.toFixed(3)} u="kW" />
                </div>

                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 18 }}>
                  <span className="tag">24-hour forecast horizon</span>
                  <button className="btn ghost" onClick={() => r.reload()}>
                    ↻ Refresh forecast
                  </button>
                </div>
              </div>

              {/* FORECAST HIGHLIGHTS */}
              <div className="grid" style={{ marginBottom: 18 }}>
                <div className="card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="muted small">Predicted peak demand</span>
                    <span style={{ fontSize: 22 }}>⚡</span>
                  </div>
                  <h2 style={{ fontSize: 26, marginTop: 10 }}>{peakValue.toFixed(3)} kW</h2>
                  <p className="muted small">Expected around {peakTime}</p>
                </div>

                <div className="card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="muted small">Average uncertainty width</span>
                    <span style={{ fontSize: 22 }}>⌁</span>
                  </div>
                  <h2 style={{ fontSize: 26, marginTop: 10 }}>{uncertaintyWidth.toFixed(3)} kW</h2>
                  <p className="muted small">Average upper-to-lower forecast range</p>
                </div>

                <div className="card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="muted small">Forecast observations</span>
                    <span style={{ fontSize: 22 }}>◷</span>
                  </div>
                  <h2 style={{ fontSize: 26, marginTop: 10 }}>{points.length}</h2>
                  <p className="muted small">Available forecast intervals</p>
                </div>
              </div>

              {/* PEAK DEMAND INSIGHT */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="hd">
                  <div>
                    <h2>Peak demand intelligence</h2>
                    <p className="muted small">Identify the highest forecast load in the current horizon.</p>
                  </div>
                  <span className="tag warn">Peak insight</span>
                </div>

                {peak ? (
                  <div className="grid" style={{ marginTop: 14 }}>
                    <div>
                      <p className="muted small">Expected peak time</p>
                      <h2>{peakTime}</h2>
                    </div>
                    <div>
                      <p className="muted small">Expected peak power</p>
                      <h2>{peakValue.toFixed(3)} kW</h2>
                    </div>
                    <div>
                      <p className="muted small">Forecast average</p>
                      <h2>{average.toFixed(3)} kW</h2>
                    </div>
                  </div>
                ) : (
                  <p className="muted">No peak-demand information available.</p>
                )}

                <p className="muted small" style={{ marginTop: 14 }}>
                  Planning suggestion: review flexible loads around the predicted peak.
                  Only reschedule equipment when operational and safety requirements permit.
                </p>
              </div>

              {/* MAIN FORECAST CHART */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="hd">
                  <div>
                    <h2>Hourly consumption forecast</h2>
                    <p className="muted small">Predicted power demand with an estimated uncertainty range.</p>
                  </div>
                  <span className="tag plan">Forecast model</span>
                </div>

                <div className="row" style={{ flexWrap: "wrap", marginTop: 14 }}>
                  {[
                    ["all", "24 hours"],
                    ["first12", "First 12 hours"],
                    ["last12", "Last 12 hours"]
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`btn ${view === value ? "" : "ghost"}`}
                      style={{ padding: "7px 12px" }}
                      onClick={() => setView(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="row" style={{ marginTop: 16, gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={showConfidence}
                    onChange={e => setShowConfidence(e.target.checked)}
                  />
                  <span className="muted small">Show forecast uncertainty boundaries</span>
                </label>

                <Chart>
                  <LineChart data={filteredData}>
                    <CartesianGrid stroke="var(--line)" />
                    <XAxis dataKey="t" {...axis} minTickGap={35} />
                    <YAxis {...axis} width={48} />
                    <Tooltip />
                    {showConfidence && (
                      <>
                        <Line
                          dataKey="hi"
                          stroke="#d59a43"
                          strokeDasharray="5 5"
                          dot={false}
                          name="Upper estimate"
                        />
                        <Line
                          dataKey="lo"
                          stroke="#7d94a5"
                          strokeDasharray="5 5"
                          dot={false}
                          name="Lower estimate"
                        />
                      </>
                    )}
                    <Line
                      dataKey="kw"
                      stroke="var(--acc)"
                      strokeWidth={3}
                      dot={false}
                      name="Expected power"
                    />
                    {showScenario && (
                      <Line
                        dataKey="scenario"
                        stroke="#299e83"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                        name="What-if scenario"
                      />
                    )}
                  </LineChart>
                </Chart>

                <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 10 }}>
                  <span className="tag">━ Expected demand</span>
                  {showConfidence && <span className="tag">┄ Upper / lower range</span>}
                  {showScenario && <span className="tag">┄ Scenario estimate</span>}
                </div>

                <p className="muted small" style={{ marginTop: 12 }}>{d.uncertainty}</p>
              </div>

              {/* WHAT IF SIMULATOR */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="hd">
                  <div>
                    <h2>What-if energy scenario</h2>
                    <p className="muted small">Explore how a hypothetical reduction could change forecast totals.</p>
                  </div>
                  <span className="tag plan">Simulation</span>
                </div>

                <label className="muted small" style={{ display: "block", marginTop: 16 }}>
                  Hypothetical consumption reduction: <b>{reduction}%</b>
                </label>

                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={reduction}
                  onChange={e => setReduction(Number(e.target.value))}
                  style={{ width: "100%", marginTop: 12 }}
                />

                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="muted small">0%</span>
                  <span className="muted small">30%</span>
                </div>

                <div className="grid" style={{ marginTop: 18 }}>
                  <Stat l="Scenario daily energy" v={scenarioDaily.toFixed(2)} u="kWh" />
                  <Stat l="Scenario monthly energy" v={scenarioMonthly.toFixed(2)} u="kWh" />
                  <Stat l="Scenario monthly cost" v={inr(scenarioCost)} />
                  <Stat l="Hypothetical monthly difference" v={inr(Number(d.projected_month_cost_inr || 0) - scenarioCost)} />
                </div>

                <p className="muted small" style={{ marginTop: 12 }}>
                  This is a mathematical scenario, not a prediction of achievable savings.
                  It assumes the same reduction applies uniformly to forecast consumption and cost.
                </p>

                <button
                  className="btn"
                  style={{ marginTop: 14 }}
                  onClick={() => setShowScenario(!showScenario)}
                >
                  {showScenario ? "Hide scenario on chart" : "Compare scenario on chart"}
                </button>
              </div>

              {/* MODEL PERFORMANCE */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="hd">
                  <div>
                    <h2>Forecast model performance</h2>
                    <p className="muted small">Evaluation against the held-out last 24 hours.</p>
                  </div>
                  <span className="tag plan">Model evaluation</span>
                </div>

                <div className="tw" style={{ marginTop: 14 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>MAE (kW)</th>
                        <th>RMSE (kW)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Hour-of-day median</td>
                        <td>{model.mae ?? "N/A"}</td>
                        <td>{model.rmse ?? "N/A"}</td>
                      </tr>
                      <tr>
                        <td>Seasonal naive (yesterday)</td>
                        <td>{seasonal.mae ?? "N/A"}</td>
                        <td>{seasonal.rmse ?? "N/A"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="muted small" style={{ marginTop: 14 }}>{metrics.note}</p>

                <div className="grid" style={{ marginTop: 16 }}>
                  <div>
                    <h3>MAE</h3>
                    <p className="muted small">Mean absolute error. Lower values indicate smaller average absolute prediction errors.</p>
                  </div>
                  <div>
                    <h3>RMSE</h3>
                    <p className="muted small">Root mean squared error. Larger errors receive greater influence.</p>
                  </div>
                </div>
              </div>

              {/* FORECAST ALERTS */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="hd">
                  <div>
                    <h2>Forecast alert center</h2>
                    <p className="muted small">Choose the forecast events you want to monitor.</p>
                  </div>
                  <span className="tag plan">Alert preferences</span>
                </div>

                <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                  {[
                    ["peak", "Peak demand warning", "Review unusually high forecast power demand."],
                    ["high", "High consumption warning", "Monitor forecast consumption increases."],
                    ["cost", "Projected cost warning", "Review estimated monthly energy costs."]
                  ].map(([key, title, description]) => (
                    <label className="row" key={key} style={{
                      justifyContent: "space-between",
                      padding: 12,
                      border: "1px solid var(--line)",
                      borderRadius: 10
                    }}>
                      <div style={{ flex: 1 }}>
                        <b>{title}</b>
                        <p className="muted small">{description}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={alertSettings[key]}
                        onChange={e => setAlertSettings(old => ({
                          ...old,
                          [key]: e.target.checked
                        }))}
                      />
                    </label>
                  ))}
                </div>

                <p className="muted small" style={{ marginTop: 12 }}>
                  These are local display preferences only. They do not configure or send backend email notifications.
                  Use the notification settings below for available email alert functionality.
                </p>

                <div style={{ marginTop: 18 }}>
                  <h3>Email notification settings</h3>
                  <p className="muted small" style={{ marginTop: 5 }}>
                    Manage your existing notification delivery configuration.
                  </p>
                </div>
              </div>

              {/* EXPORT */}
              <div className="card">
                <div className="hd">
                  <div>
                    <h2>Forecast report</h2>
                    <p className="muted small">Export the current forecast intervals for further analysis.</p>
                  </div>
                  <span style={{ fontSize: 25 }}>↓</span>
                </div>

                <button className="btn" style={{ marginTop: 14 }} onClick={() => exportCSV(d)}>
                  Download forecast CSV
                </button>

                {message && (
                  <p className="ok small" role="status" style={{ marginTop: 12 }}>
                    {message}
                  </p>
                )}

                <p className="muted small" style={{ marginTop: 12 }}>
                  Forecast values are estimates based on available historical data.
                  Actual consumption may differ due to operating schedules, equipment changes and external conditions.
                </p>
              </div>
            </>
          );
        }}
      </State>
    </>
  );
}



export function Cost() {
  const r = useGet("/cost");
  const analytics = useGet("/analytics");
  const forecast = useGet("/forecast");

  const [budget, setBudget] = useState(3000);
  const [reduction, setReduction] = useState(10);
  const [tariffOverride, setTariffOverride] = useState("");
  const [showBudget, setShowBudget] = useState(false);

  const money = (n) => inr(Number.isFinite(Number(n)) ? Number(n) : 0);
  const currentTariff = Number(r.data?.tariff || 0);
  const tariff = tariffOverride === "" ? currentTariff : Math.max(0, Number(tariffOverride) || 0);

  const measured = Number(r.data?.measured_month_kwh || 0);
  const actualCost = Number(r.data?.estimated_month_cost_inr || 0);
  const projectedCost = Number(r.data?.projected_month_cost_inr || 0);
  const excess = Number(r.data?.excess_kwh_vs_baseline || 0);
  const excessCost = Number(r.data?.excess_cost_inr || 0);

  const estimatedSaving = projectedCost * reduction / 100;
  const adjustedBill = Math.max(0, projectedCost - estimatedSaving);
  const budgetUsed = budget > 0 ? (projectedCost / budget) * 100 : 0;
  const remaining = budget - projectedCost;

  const hourly = analytics.data?.hourly || [];
  const daily = analytics.data?.daily || [];
  const forecastData = forecast.data?.points || [];

  const peakHour = hourly.length
    ? [...hourly].sort((a, b) => b.avg_kw - a.avg_kw)[0]
    : null;

  const peakDay = daily.length
    ? [...daily].sort((a, b) => b.kwh - a.kwh)[0]
    : null;

  const periodData = [
    { name: "Night", start: 0, end: 6 },
    { name: "Morning", start: 6, end: 12 },
    { name: "Afternoon", start: 12, end: 18 },
    { name: "Evening", start: 18, end: 24 }
  ].map((period) => {
    const values = hourly.filter(
      (x) => x.hour >= period.start && x.hour < period.end
    );
    const avgPower = values.length
      ? values.reduce((sum, x) => sum + x.avg_kw, 0) / values.length
      : 0;

    return {
      name: period.name,
      kw: Number(avgPower.toFixed(3)),
      estimatedCost: Number((avgPower * 6 * tariff).toFixed(2))
    };
  });

  const maxPeriod = Math.max(...periodData.map((x) => x.estimatedCost), 1);

  const chartData = daily.map((x) => ({
    date: x.date,
    cost: Number((x.kwh * tariff).toFixed(2)),
    energy: x.kwh
  }));

  const forecastCost = forecast.data?.sufficient
    ? Number(forecast.data.projected_month_cost_inr || 0)
    : projectedCost;

  const fmtHour = (hour) =>
    `${String(hour).padStart(2, "0")}:00`;

  return (
    <>
      <Head
        t="Cost Intelligence"
        s="Understand your electricity spending, identify expensive usage patterns and simulate smarter energy decisions."
      />

      <State r={r}>
        {(d) => (
          <>
            <div className="card" style={{
              marginBottom: 18,
              background: "linear-gradient(125deg, var(--card), var(--accsoft))",
              border: "1px solid var(--line)",
              overflow: "hidden"
            }}>
              <div className="hd">
                <div>
                  <span className="tag warn">SIMULATED DATA</span>
                  <h2 style={{ marginTop: 12 }}>Your energy spending overview</h2>
                  <p className="muted small">
                    Based on recorded consumption and your configured flat tariff.
                  </p>
                </div>
                <IndianRupee size={32} color="var(--acc)" />
              </div>

              <div className="grid kpis" style={{ marginTop: 16 }}>
                <Kpi
                  icon={Zap}
                  label="Energy this month"
                  value={measured}
                  unit=" kWh"
                  sub="Measured consumption"
                />
                <Kpi
                  icon={IndianRupee}
                  label="Estimated spending"
                  value={money(actualCost)}
                  sub="Month-to-date"
                  tone="var(--blue)"
                />
                <Kpi
                  icon={Gauge}
                  label="Month-end projection"
                  value={money(projectedCost)}
                  sub="Estimated bill"
                  tone="#7c5cc4"
                />
                <Kpi
                  icon={AlertTriangle}
                  label="Anomaly impact"
                  value={money(excessCost)}
                  sub={`${excess.toFixed(2)} kWh hypothetical excess`}
                  tone="var(--warn)"
                />
              </div>

              <div className="row" style={{
                justifyContent: "space-between",
                flexWrap: "wrap",
                marginTop: 18
              }}>
                <div>
                  <div className="muted small">Current configured tariff</div>
                  <div style={{ fontSize: 25, fontWeight: 800 }}>
                    ₹{currentTariff.toFixed(2)}
                    <span className="muted small"> / kWh</span>
                  </div>
                </div>
                <Link className="btn ghost" to="/app/settings">
                  Manage tariff →
                </Link>
              </div>
            </div>

            <div className="two" style={{ marginBottom: 18 }}>
              <div className="card">
                <div className="hd">
                  <h2>Monthly budget tracker</h2>
                  <span className="tag">Planning</span>
                </div>

                <p className="muted small">
                  Compare your projected electricity bill with your spending target.
                </p>

                <label className="f">
                  Monthly budget (₹)
                  <input
                    type="number"
                    min="1"
                    max="10000000"
                    value={budget}
                    onChange={(e) => setBudget(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>

                <div style={{ marginTop: 18 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="muted small">Projected budget usage</span>
                    <b>{budgetUsed.toFixed(1)}%</b>
                  </div>

                  <div style={{
                    height: 12,
                    borderRadius: 20,
                    background: "var(--line)",
                    overflow: "hidden",
                    marginTop: 8
                  }}>
                    <div style={{
                      width: `${Math.min(100, budgetUsed)}%`,
                      height: "100%",
                      borderRadius: 20,
                      background: budgetUsed > 100 ? "var(--bad, #dc5555)" : "var(--acc)",
                      transition: "width .3s"
                    }} />
                  </div>
                </div>

                <div className="grid" style={{ marginTop: 18 }}>
                  <Stat l="Monthly budget" v={money(budget)} />
                  <Stat l="Projected bill" v={money(projectedCost)} />
                  <Stat
                    l={remaining >= 0 ? "Budget remaining" : "Over budget"}
                    v={money(Math.abs(remaining))}
                  />
                </div>

                <p className={remaining >= 0 ? "ok" : "bad"} style={{ marginTop: 12 }}>
                  {remaining >= 0
                    ? `You are projected to stay ${money(remaining)} within budget.`
                    : `Your projected bill exceeds the budget by ${money(Math.abs(remaining))}.`}
                </p>
              </div>

              <div className="card">
                <div className="hd">
                  <h2>Cost-saving simulator</h2>
                  <span className="tag plan">What-if analysis</span>
                </div>

                <p className="muted small">
                  Test how a reduction in consumption could affect your estimated bill.
                </p>

                <div style={{ marginTop: 22 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <label>Consumption reduction</label>
                    <b style={{ fontSize: 22, color: "var(--acc)" }}>
                      {reduction}%
                    </b>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={reduction}
                    onChange={(e) => setReduction(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--acc)", marginTop: 12 }}
                  />

                  <div className="row muted small" style={{ justifyContent: "space-between" }}>
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                  </div>
                </div>

                <div style={{
                  padding: 16,
                  background: "var(--accsoft)",
                  borderRadius: 12,
                  marginTop: 20
                }}>
                  <div className="muted small">Estimated new monthly bill</div>
                  <div style={{ fontSize: 30, fontWeight: 800 }}>
                    {money(adjustedBill)}
                  </div>
                  <div className="ok" style={{ marginTop: 8 }}>
                    Potential saving: {money(estimatedSaving)} / month
                  </div>
                  <div className="muted small">
                    Annualized estimate: {money(estimatedSaving * 12)}
                  </div>
                </div>

                <p className="muted small" style={{ marginTop: 12 }}>
                  Hypothetical scenario only. Actual savings depend on consumption,
                  occupancy and tariff changes.
                </p>
              </div>
            </div>

            <div className="two" style={{ marginBottom: 18 }}>
              <div className="card">
                <div className="hd">
                  <h2>Daily electricity cost</h2>
                  <span className="tag">Estimated</span>
                </div>
                <p className="muted small">
                  Daily energy multiplied by your configured flat tariff.
                </p>

                {chartData.length ? (
                  <Chart>
                    <AreaChart data={chartData}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="date" {...axis} minTickGap={25} />
                      <YAxis {...axis} width={55} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Area
                        type="monotone"
                        dataKey="cost"
                        name="Estimated cost (₹)"
                        stroke="var(--acc)"
                        strokeWidth={2.5}
                        fill="var(--accsoft)"
                      />
                    </AreaChart>
                  </Chart>
                ) : (
                  <Empty m="Daily cost data is not available yet." />
                )}
              </div>

              <div className="card">
                <div className="hd">
                  <h2>Cost by time of day</h2>
                  <span className="tag plan">Pattern analysis</span>
                </div>
                <p className="muted small">
                  Approximate cost distribution using average hourly power.
                  Not a time-of-day tariff.
                </p>

                {hourly.length ? (
                  <>
                    {periodData.map((p) => (
                      <div key={p.name} style={{ marginTop: 18 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <b>{p.name}</b>
                          <span>{money(p.estimatedCost)}</span>
                        </div>
                        <div style={{
                          height: 9,
                          borderRadius: 20,
                          background: "var(--line)",
                          overflow: "hidden",
                          marginTop: 7
                        }}>
                          <div style={{
                            width: `${(p.estimatedCost / maxPeriod) * 100}%`,
                            height: "100%",
                            background: "var(--blue)",
                            borderRadius: 20
                          }} />
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <Empty m="Hourly data is not available yet." />
                )}
              </div>
            </div>

            <div className="two" style={{ marginBottom: 18 }}>
              <div className="card">
                <div className="hd">
                  <h2>Highest consumption period</h2>
                  <Gauge color="var(--acc)" />
                </div>

                {peakHour ? (
                  <>
                    <div style={{ fontSize: 32, fontWeight: 800, marginTop: 18 }}>
                      {fmtHour(peakHour.hour)}
                    </div>
                    <p className="muted">Highest average hourly demand</p>
                    <div className="grid" style={{ marginTop: 18 }}>
                      <Stat l="Average power" v={peakHour.avg_kw} u="kW" />
                      <Stat l="Peak power" v={peakHour.peak_kw} u="kW" />
                    </div>
                    <p className="muted small" style={{ marginTop: 12 }}>
                      This is an average pattern across recorded days, not necessarily
                      today's highest-cost hour.
                    </p>
                  </>
                ) : (
                  <Empty m="More readings are needed to identify peak hours." />
                )}
              </div>

              <div className="card">
                <div className="hd">
                  <h2>Highest energy day</h2>
                  <Zap color="var(--warn)" />
                </div>

                {peakDay ? (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 800, marginTop: 18 }}>
                      {peakDay.date}
                    </div>
                    <p className="muted">Highest recorded daily energy consumption</p>
                    <div style={{ fontSize: 30, fontWeight: 800, marginTop: 18 }}>
                      {peakDay.kwh.toFixed(2)} kWh
                    </div>
                    <div className="muted small">
                      Estimated daily cost: {money(peakDay.kwh * tariff)}
                    </div>
                  </>
                ) : (
                  <Empty m="Daily energy data is not available yet." />
                )}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div className="hd">
                <h2>Tariff impact calculator</h2>
                <span className="tag">Interactive</span>
              </div>

              <p className="muted small">
                Explore how changing your flat electricity rate affects the
                projected monthly bill. This does not change your saved tariff.
              </p>

              <div className="two">
                <div>
                  <label className="f">
                    Test tariff (₹/kWh)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={tariffOverride === "" ? currentTariff : tariffOverride}
                      onChange={(e) => setTariffOverride(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn ghost"
                    type="button"
                    style={{ marginTop: 12 }}
                    onClick={() => setTariffOverride("")}
                  >
                    Reset to saved tariff
                  </button>
                </div>

                <div style={{
                  padding: 16,
                  background: "var(--accsoft)",
                  borderRadius: 12
                }}>
                  <div className="muted small">Projected cost at test tariff</div>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>
                    {money((currentTariff > 0 ? projectedCost / currentTariff : 0) * tariff)}
                  </div>
                  <div className="muted small">
                    Estimated monthly consumption held constant.
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 18 }}>
              <div className="hd">
                <h2>Cost impact of unusual consumption</h2>
                <AlertTriangle color="var(--warn)" />
              </div>

              <div className="grid">
                <Stat l="Excess energy estimate" v={excess.toFixed(2)} u="kWh" />
                <Stat l="Potential excess cost" v={money(excessCost)} />
              </div>

              <p className="muted small" style={{ marginTop: 14 }}>
                This is a hypothetical baseline comparison based on detected
                anomalies. It is not a separate meter measurement, a confirmed
                financial loss or verified recoverable savings.
              </p>

              <Link to="/app/anomalies">Investigate unusual consumption →</Link>
            </div>

            <div className="card">
              <div className="hd">
                <h2>Cost intelligence insights</h2>
                <span className="tag plan">Automatic</span>
              </div>

              <ul className="plain">
                <li>
                  <span>Configured electricity rate</span>
                  <b>₹{currentTariff.toFixed(2)}/kWh</b>
                </li>
                <li>
                  <span>Projected bill</span>
                  <b>{money(forecastCost)}</b>
                </li>
                <li>
                  <span>Highest average demand hour</span>
                  <b>{peakHour ? fmtHour(peakHour.hour) : "Insufficient data"}</b>
                </li>
                <li>
                  <span>Highest energy day</span>
                  <b>{peakDay ? peakDay.date : "Insufficient data"}</b>
                </li>
              </ul>

              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <Link className="btn ghost" to="/app/analytics">
                  View analytics
                </Link>
                <Link className="btn ghost" to="/app/forecasts">
                  View forecasts
                </Link>
                <Link className="btn ghost" to="/app/recommendations">
                  View recommendations
                </Link>
              </div>
            </div>

            <p className="muted small" style={{ marginTop: 16 }}>
              {d.note} All cost calculations use your configured flat tariff.
              They exclude taxes, fixed charges, provider-specific adjustments
              and time-of-day rates. Data shown in demo mode is simulated.
              No appliance-level breakdown is inferred from aggregate meter readings.
            </p>
          </>
        )}
      </State>
    </>
  );
}



export function Recs() {
  const r = useGet("/recommendations");

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [completed, setCompleted] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [saved, setSaved] = useState([]);
  const [message, setMessage] = useState("");

  const items = Array.isArray(r.data) ? r.data : [];

  const getPriority = x => String(x.priority || "medium").toLowerCase();

  const getSavings = x => Number(x.estimated_monthly_savings_inr || 0);

  const visible = items.filter(x => {
    const id = x.title;
    const priority = getPriority(x);
    const text = `${x.title} ${x.evidence} ${x.explanation} ${x.action}`.toLowerCase();

    if (dismissed.includes(id)) return false;

    const matchesSearch = text.includes(search.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "high" && ["high", "critical"].includes(priority)) ||
      (filter === "savings" && getSavings(x) > 0) ||
      (filter === "efficiency" && /energy|consumption|power|efficien|usage/i.test(text)) ||
      (filter === "completed" && completed.includes(id)) ||
      (filter === "saved" && saved.includes(id));

    return matchesSearch && matchesFilter;
  });

  const totalSavings = items.reduce((sum, x) => sum + getSavings(x), 0);
  const annualSavings = totalSavings * 12;
  const highPriority = items.filter(x => ["high", "critical"].includes(getPriority(x))).length;
  const completedCount = completed.filter(id => items.some(x => x.title === id)).length;
  const completionRate = items.length ? Math.round(completedCount / items.length * 100) : 0;

  function exportCSV() {
    const rows = [
      ["Recommendation", "Priority", "Status", "Evidence", "Action", "Monthly estimated savings INR", "Assumptions"],
      ...items.map(x => [
        x.title, x.priority, x.status, x.evidence,
        x.action, x.estimated_monthly_savings_inr, x.assumptions
      ])
    ];

    const csv = rows.map(row =>
      row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gridwise-recommendations.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Recommendation report exported.");
  }

  function copyRecommendation(x) {
    const text = [
      "GRIDWISE AI — ENERGY OPTIMIZATION RECOMMENDATION",
      "",
      `Recommendation: ${x.title}`,
      `Priority: ${x.priority}`,
      `Evidence: ${x.evidence}`,
      `Explanation: ${x.explanation}`,
      `Recommended action: ${x.action}`,
      `Estimated monthly savings: ${x.estimated_monthly_savings_inr != null ? inr(x.estimated_monthly_savings_inr) + " (hypothetical)" : "Not calculable"}`,
      `Assumptions: ${x.assumptions}`
    ].join("\n");

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setMessage("Recommendation copied.");
    } else {
      setMessage("Clipboard is unavailable in this browser.");
    }
  }

  function getActionSteps(x) {
    const text = `${x.title} ${x.action} ${x.explanation}`.toLowerCase();

    if (/anomal|spike|unusual|baseline/.test(text)) {
      return [
        "Open the Anomalies page and locate the relevant event.",
        "Check the time, observed load and expected baseline.",
        "Inspect equipment operating during that period.",
        "Record the cause and monitor the next operating cycle."
      ];
    }

    if (/peak|demand|load/.test(text)) {
      return [
        "Identify the highest-consumption operating period.",
        "Review equipment that can safely operate at another time.",
        "Avoid running flexible high-load equipment simultaneously.",
        "Compare the next period against the previous baseline."
      ];
    }

    if (/standby|idle|switch|off/.test(text)) {
      return [
        "Identify equipment operating while not required.",
        "Confirm shutdown requirements with the equipment operator.",
        "Create an appropriate shutdown schedule.",
        "Monitor consumption to evaluate the change."
      ];
    }

    return [
      "Review the recommendation evidence and assumptions.",
      "Identify the equipment or operating process involved.",
      "Implement the suggested change where appropriate.",
      "Compare subsequent meter readings against the baseline."
    ];
  }

  const priorityColor = {
    critical: "#d9534f",
    high: "#e58a38",
    medium: "#c99b35",
    low: "#299e83"
  };

  return (
    <>
      <Head
        t="Energy Optimization Center"
        s="Turn energy intelligence into practical actions, measurable opportunities and informed decisions."
      />

      {/* HERO */}
      <div className="card" style={{
        marginBottom: 18,
        background: "linear-gradient(120deg,var(--card),var(--accsoft))",
        border: "1px solid var(--line)"
      }}>
        <div className="hd">
          <div>
            <span className="tag plan">AI-ASSISTED OPTIMIZATION</span>
            <h2 style={{ marginTop: 12, fontSize: 24 }}>Make every kilowatt-hour count.</h2>
            <p className="muted small">
              Evidence-based recommendations generated from your energy data.
            </p>
          </div>
          <div style={{ fontSize: 38 }}>✦</div>
        </div>

        <div className="grid" style={{ marginTop: 20 }}>
          <Stat l="Recommendations" v={items.length} />
          <Stat l="High priority" v={highPriority} />
          <Stat l="Potential monthly savings" v={inr(totalSavings)} />
          <Stat l="Potential annual savings" v={inr(annualSavings)} />
        </div>

        <p className="muted small" style={{ marginTop: 14 }}>
          Savings figures are hypothetical estimates from recommendation assumptions,
          not verified or achieved savings.
        </p>
      </div>

      {/* OPTIMIZATION PROGRESS */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Optimization progress</h2>
            <p className="muted small">Your locally tracked recommendation workflow.</p>
          </div>
          <span className="tag">{completionRate}% completed</span>
        </div>

        <div style={{
          height: 10,
          background: "var(--line)",
          borderRadius: 20,
          overflow: "hidden",
          marginTop: 16
        }}>
          <div style={{
            width: `${completionRate}%`,
            height: "100%",
            background: "var(--acc)",
            borderRadius: 20,
            transition: "width .3s"
          }} />
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <span className="muted small">{completedCount} completed</span>
          <span className="muted small">{items.length - completedCount} remaining</span>
        </div>

        <div className="grid" style={{ marginTop: 16 }}>
          <Stat l="Saved for review" v={saved.length} />
          <Stat l="Dismissed this session" v={dismissed.length} />
          <Stat l="Completed this session" v={completedCount} />
        </div>
      </div>

      {/* EMAIL ALERTS */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Recommendation notification center</h2>
            <p className="muted small">
              Manage your existing email notification settings and alert preferences.
            </p>
          </div>
          <span className="tag plan">Email alerts</span>
        </div>
      </div>

      {/* SAVINGS OPPORTUNITY */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Opportunity overview</h2>
            <p className="muted small">Estimated savings potential across current recommendations.</p>
          </div>
          <span style={{ fontSize: 25 }}>₹</span>
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <div>
            <p className="muted small">Monthly opportunity</p>
            <h2 style={{ fontSize: 27 }}>{inr(totalSavings)}</h2>
          </div>
          <div>
            <p className="muted small">Annualized opportunity</p>
            <h2 style={{ fontSize: 27 }}>{inr(annualSavings)}</h2>
          </div>
        </div>

        <p className="muted small" style={{ marginTop: 12 }}>
          Annualized estimate assumes the same monthly opportunity continues for 12 months.
          Actual savings require implementation and verification.
        </p>
      </div>

      {/* FILTERS */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Recommendation explorer</h2>
            <p className="muted small">Prioritize actions and investigate the supporting evidence.</p>
          </div>
          <span className="tag">{visible.length} shown</span>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recommendations, evidence or actions..."
          style={{ width: "100%", marginTop: 14 }}
        />

        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {[
            ["all", "All"],
            ["high", "High priority"],
            ["savings", "Cost saving"],
            ["efficiency", "Energy efficiency"],
            ["saved", "Saved"],
            ["completed", "Completed"]
          ].map(([value, label]) => (
            <button
              key={value}
              className={`btn ${filter === value ? "" : "ghost"}`}
              style={{ padding: "7px 12px" }}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="row" style={{ flexWrap: "wrap", marginTop: 16 }}>
          <button className="btn ghost" onClick={exportCSV} disabled={!items.length}>
            ↓ Export report
          </button>
          <button className="btn ghost" onClick={() => r.reload()}>
            ↻ Refresh recommendations
          </button>
        </div>

        {message && <p className="ok small" role="status" style={{ marginTop: 12 }}>{message}</p>}
      </div>

      {/* RECOMMENDATION CARDS */}
      <State r={r}>
        {d => {
          const data = Array.isArray(d) ? d : [];

          if (!data.length) {
            return <div className="card"><Empty m="No recommendations yet. More energy data is needed to generate optimization opportunities." /></div>;
          }

          if (!visible.length) {
            return <div className="card"><Empty m="No recommendations match this filter. Try another category." /></div>;
          }

          return (
            <div style={{ display: "grid", gap: 14 }}>
              {visible.map((x, index) => {
                const id = x.title;
                const priority = getPriority(x);
                const isExpanded = expanded === id;
                const isCompleted = completed.includes(id);
                const isSaved = saved.includes(id);
                const savings = getSavings(x);
                const steps = getActionSteps(x);

                return (
                  <div
                    className="card"
                    key={`${id}-${index}`}
                    style={{
                      border: "1px solid var(--line)",
                      borderLeft: `4px solid ${priorityColor[priority] || "var(--acc)"}`,
                      opacity: isCompleted ? 0.8 : 1
                    }}
                  >
                    <div className="hd" style={{ alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                          <span className="tag" style={{
                            color: priorityColor[priority] || "var(--acc)",
                            borderColor: priorityColor[priority] || "var(--line)"
                          }}>
                            {priority.toUpperCase()} PRIORITY
                          </span>
                          <span className="tag plan">{x.status || "Suggested"}</span>
                          {isCompleted && <span className="tag">Completed locally</span>}
                          {isSaved && <span className="tag">★ Saved</span>}
                        </div>

                        <h2 style={{ marginTop: 12 }}>{x.title}</h2>
                      </div>
                      <div style={{ fontSize: 27 }}>✦</div>
                    </div>

                    <div style={{
                      padding: 14,
                      background: "var(--accsoft)",
                      borderRadius: 12,
                      marginTop: 12
                    }}>
                      <p className="muted small">WHY THIS MATTERS</p>
                      <p style={{ marginTop: 6 }}>{x.evidence}</p>
                      <p className="muted small" style={{ marginTop: 10 }}>{x.explanation}</p>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <p className="muted small">RECOMMENDED ACTION</p>
                      <p style={{ marginTop: 5 }}>{x.action}</p>
                    </div>

                    <div className="grid" style={{ marginTop: 16 }}>
                      <Stat
                        l="Estimated monthly savings"
                        v={x.estimated_monthly_savings_inr != null ? inr(savings) : "N/A"}
                      />
                      <Stat
                        l="Annualized estimate"
                        v={x.estimated_monthly_savings_inr != null ? inr(savings * 12) : "N/A"}
                      />
                    </div>

                    <p className="muted small" style={{ marginTop: 12 }}>
                      <b>Assumptions:</b> {x.assumptions}
                    </p>

                    <div className="row" style={{ flexWrap: "wrap", marginTop: 18 }}>
                      <button
                        className="btn"
                        onClick={() => setExpanded(isExpanded ? null : id)}
                      >
                        {isExpanded ? "Hide action plan ↑" : "Explore action plan →"}
                      </button>

                      <button
                        className="btn ghost"
                        onClick={() => setSaved(old =>
                          old.includes(id) ? old.filter(v => v !== id) : [...old, id]
                        )}
                      >
                        {isSaved ? "★ Unsave" : "☆ Save"}
                      </button>

                      <button className="btn ghost" onClick={() => copyRecommendation(x)}>
                        Copy
                      </button>
                    </div>

                    {isExpanded && (
                      <div style={{
                        marginTop: 18,
                        padding: 16,
                        background: "var(--accsoft)",
                        borderRadius: 12
                      }}>
                        <h3>Recommended implementation plan</h3>
                        <p className="muted small" style={{ marginTop: 6 }}>
                          Suggested steps for investigating and implementing this opportunity.
                        </p>

                        <div style={{ marginTop: 16 }}>
                          {steps.map((step, i) => (
                            <div className="row" key={i} style={{
                              alignItems: "flex-start",
                              marginBottom: 14
                            }}>
                              <span style={{
                                minWidth: 28,
                                height: 28,
                                display: "grid",
                                placeItems: "center",
                                borderRadius: 50,
                                background: "var(--card)",
                                border: "1px solid var(--line)",
                                fontWeight: 700
                              }}>
                                {i + 1}
                              </span>
                              <p style={{ flex: 1 }}>{step}</p>
                            </div>
                          ))}
                        </div>

                        <div style={{
                          padding: 12,
                          background: "var(--card)",
                          border: "1px solid var(--line)",
                          borderRadius: 10,
                          marginTop: 10
                        }}>
                          <b>Verification checklist</b>
                          <p className="muted small" style={{ marginTop: 6 }}>
                            Compare post-action readings with a suitable baseline under similar
                            operating conditions. Record actual measured changes before claiming savings.
                          </p>
                        </div>

                        <div className="row" style={{ flexWrap: "wrap", marginTop: 16 }}>
                          {!isCompleted ? (
                            <button
                              className="btn"
                              onClick={() => setCompleted(old => [...old, id])}
                            >
                              ✓ Mark completed
                            </button>
                          ) : (
                            <button
                              className="btn ghost"
                              onClick={() => setCompleted(old => old.filter(v => v !== id))}
                            >
                              Undo completion
                            </button>
                          )}

                          <button
                            className="btn ghost"
                            onClick={() => setDismissed(old => [...old, id])}
                          >
                            Dismiss recommendation
                          </button>
                        </div>

                        <p className="muted small" style={{ marginTop: 12 }}>
                          Completion, saved items and dismissal are temporary browser-session
                          actions. They do not update backend records or verify actual savings.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }}
      </State>

      {/* FOOTER */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="hd">
          <h2>Optimization principles</h2>
          <span className="tag plan">GridWise intelligence</span>
        </div>

        <div className="grid">
          <div>
            <h3>01 · Evidence first</h3>
            <p className="muted small">Every recommendation should have a supporting observation or data signal.</p>
          </div>
          <div>
            <h3>02 · Human decision</h3>
            <p className="muted small">Review operational requirements and safety before changing equipment behaviour.</p>
          </div>
          <div>
            <h3>03 · Verify outcomes</h3>
            <p className="muted small">Use subsequent meter readings to evaluate whether an action produced measurable improvement.</p>
          </div>
        </div>
      </div>
    </>
  );
}


export function Savings() {
  const [bill, setBill] = useState(1420);
  const [pct, setPct] = useState(10);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState([]);
  const [activeScenario, setActiveScenario] = useState("custom");

  const monthlySaving = bill * pct / 100;
  const annualSaving = monthlySaving * 12;
  const quarterlySaving = monthlySaving * 3;
  const dailySaving = monthlySaving / 30;
  const remainingBill = bill - monthlySaving;

  const scenarios = [
    { id: "conservative", name: "Conservative", pct: 5, desc: "Small operational improvements", color: "#64748b" },
    { id: "balanced", name: "Balanced", pct: 10, desc: "Practical energy optimization", color: "#0d9488" },
    { id: "aggressive", name: "High impact", pct: 20, desc: "Multiple optimization measures", color: "#8b5cf6" }
  ];

  async function calculate(e) {
    if (e) e.preventDefault();
    setErr("");

    if (!bill || bill <= 0 || pct < 0 || pct > 100) {
      setErr("Enter a valid monthly bill and reduction percentage.");
      return;
    }

    setLoading(true);
    try {
      const response = await api("/savings/simulate", {
        method: "POST",
        body: {
          monthly_bill: Number(bill),
          reduction_pct: Number(pct)
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to calculate savings.");
      }

      setRes(data);
    } catch (x) {
      setErr(x.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function applyScenario(s) {
    setPct(s.pct);
    setActiveScenario(s.id);
    setRes(null);
    setErr("");
  }

  function saveScenario() {
    const item = {
      id: Date.now(),
      bill: Number(bill),
      pct: Number(pct),
      monthly: monthlySaving,
      annual: annualSaving,
      date: new Date().toLocaleDateString()
    };

    setSaved(old => [item, ...old].slice(0, 5));
  }

  function exportReport() {
    const rows = [
      ["GRIDWISE AI - SAVINGS SIMULATION"],
      ["Monthly bill (INR)", bill],
      ["Assumed reduction (%)", pct],
      ["Estimated monthly savings (INR)", monthlySaving.toFixed(2)],
      ["Estimated quarterly savings (INR)", quarterlySaving.toFixed(2)],
      ["Estimated annual savings (INR)", annualSaving.toFixed(2)],
      ["Estimated remaining monthly bill (INR)", remainingBill.toFixed(2)],
      ["Disclaimer", "Illustrative estimate based on user-provided assumptions. Not verified savings."]
    ];

    const csv = rows.map(row =>
      row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "GridWise-Savings-Simulation.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const money = value => inr(Math.round(value));

  return (
    <>
      <Head
        t="Savings Simulator"
        s="Model energy-saving opportunities, compare scenarios and estimate financial impact."
      />

      {/* TOP SUMMARY */}
      <div className="grid" style={{ marginBottom: 18 }}>
        <Stat l="Current monthly bill" v={money(bill)} />
        <Stat l="Potential monthly saving" v={money(monthlySaving)} />
        <Stat l="Potential annual saving" v={money(annualSaving)} />
        <Stat l="Estimated reduction" v={pct + "%"} />
      </div>

      {/* MAIN SIMULATOR */}
      <div className="two" style={{ alignItems: "start", marginBottom: 18 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ marginBottom: 5 }}>Build your simulation</h2>
              <p className="muted">Adjust the assumptions to explore possible savings.</p>
            </div>
            <span className="tag plan">Interactive model</span>
          </div>

          <form className="f" onSubmit={calculate}>
            <label>
              Current monthly electricity bill
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: 11, fontWeight: 700 }}>₹</span>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={bill}
                  onChange={e => {
                    setBill(Math.max(0, Number(e.target.value)));
                    setRes(null);
                  }}
                  style={{ paddingLeft: 30 }}
                  required
                />
              </div>
            </label>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <label>Expected energy reduction</label>
                <strong style={{ color: "var(--acc)" }}>{pct}%</strong>
              </div>

              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={pct}
                onChange={e => {
                  setPct(Number(e.target.value));
                  setActiveScenario("custom");
                  setRes(null);
                }}
                style={{ width: "100%", accentColor: "var(--acc)", marginTop: 12 }}
              />

              <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>0% · No reduction</span>
                <span>50% · High reduction</span>
              </div>
            </div>

            <div style={{ background: "var(--accsoft)", padding: 14, borderRadius: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>Estimated new monthly bill</div>
              <div style={{ fontSize: 27, fontWeight: 800, marginTop: 4 }}>
                {money(remainingBill)}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Potential reduction of {money(monthlySaving)} per month
              </div>
            </div>

            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Calculating..." : "Calculate savings →"}
            </button>
          </form>

          {err && <p className="err" role="alert">{err}</p>}

          {res && (
            <div className="card" style={{ marginTop: 15, borderColor: "var(--acc)" }} role="status">
              <span className="tag plan">Calculation complete</span>
              <h2 style={{ marginTop: 12 }}>Simulation results</h2>
              <div className="grid">
                <Stat l="Monthly saving" v={money(res.monthly_inr)} />
                <Stat l="Annual saving" v={money(res.annual_inr)} />
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                Formula: {res.formula}
              </p>
              <p className="muted">{res.disclaimer}</p>
            </div>
          )}
        </div>

        {/* LIVE FINANCIAL IMPACT */}
        <div className="card">
          <h2>Financial impact overview</h2>
          <p className="muted">Illustrative projections from your current assumptions.</p>

          <div style={{ marginTop: 20 }}>
            <div className="muted" style={{ fontSize: 12 }}>Potential daily saving</div>
            <div style={{ fontSize: 25, fontWeight: 800 }}>{money(dailySaving)}</div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="muted" style={{ fontSize: 12 }}>Potential quarterly saving</div>
            <div style={{ fontSize: 25, fontWeight: 800 }}>{money(quarterlySaving)}</div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="muted" style={{ fontSize: 12 }}>Potential annual saving</div>
            <div style={{ fontSize: 25, fontWeight: 800, color: "var(--acc)" }}>{money(annualSaving)}</div>
          </div>

          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
              <span>Estimated bill reduction</span>
              <strong>{pct}%</strong>
            </div>
            <div style={{ height: 12, background: "var(--line)", borderRadius: 20, overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--acc)",
                borderRadius: 20,
                transition: "width .2s"
              }} />
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--line)", marginTop: 22, paddingTop: 16 }}>
            <div className="muted" style={{ fontSize: 12 }}>Estimated annual bill after reduction</div>
            <div style={{ fontSize: 22, fontWeight: 750 }}>{money(remainingBill * 12)}</div>
          </div>

          <p className="muted" style={{ fontSize: 12, marginTop: 15 }}>
            These figures assume the selected reduction remains consistent throughout the period.
          </p>
        </div>
      </div>

      {/* SCENARIO PLANNER */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Optimization scenario planner</h2>
            <p className="muted">Compare different energy-reduction assumptions.</p>
          </div>
          <span className="tag">Scenario lab</span>
        </div>

        <div className="three" style={{ marginTop: 14 }}>
          {scenarios.map(s => {
            const saving = bill * s.pct / 100;
            const selected = activeScenario === s.id;

            return (
              <div
                key={s.id}
                className="card"
                style={{
                  border: selected ? `2px solid ${s.color}` : "1px solid var(--line)",
                  cursor: "pointer"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{s.name}</strong>
                  {selected && <span className="tag plan">Selected</span>}
                </div>

                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 14 }}>
                  {s.pct}%
                </div>

                <p className="muted" style={{ fontSize: 12 }}>{s.desc}</p>

                <div style={{ marginTop: 14 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Monthly saving</div>
                  <strong style={{ fontSize: 19 }}>{money(saving)}</strong>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ fontSize: 12 }}>Annual saving</div>
                  <strong>{money(saving * 12)}</strong>
                </div>

                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 15, width: "100%" }}
                  onClick={() => applyScenario(s)}
                >
                  Apply scenario
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* BEFORE AND AFTER */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Before vs after comparison</h2>
        <p className="muted">Compare the assumed current bill with the projected bill.</p>

        <div className="two" style={{ marginTop: 18 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Current monthly bill</div>
            <div style={{ fontSize: 25, fontWeight: 800 }}>{money(bill)}</div>
            <div style={{ height: 15, background: "var(--line)", borderRadius: 10, marginTop: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: "100%", background: "var(--blue)", borderRadius: 10 }} />
            </div>
          </div>

          <div>
            <div className="muted" style={{ fontSize: 12 }}>Projected monthly bill</div>
            <div style={{ fontSize: 25, fontWeight: 800, color: "var(--acc)" }}>{money(remainingBill)}</div>
            <div style={{ height: 15, background: "var(--line)", borderRadius: 10, marginTop: 10, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${100 - pct}%`,
                background: "var(--acc)",
                borderRadius: 10
              }} />
            </div>
          </div>
        </div>

        <div style={{ background: "var(--accsoft)", borderRadius: 12, padding: 15, marginTop: 20 }}>
          <div className="muted" style={{ fontSize: 12 }}>Potential annual financial benefit</div>
          <div style={{ fontSize: 30, fontWeight: 850 }}>{money(annualSaving)}</div>
          <p className="muted" style={{ fontSize: 12 }}>
            This is a modeled outcome, not verified or guaranteed savings.
          </p>
        </div>
      </div>

      {/* SAVED SIMULATIONS */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Saved simulations</h2>
            <p className="muted">Keep up to five scenarios during this browser session.</p>
          </div>
          <button type="button" className="btn" onClick={saveScenario}>
            + Save current
          </button>
        </div>

        {!saved.length ? (
          <p className="muted" style={{ marginTop: 15 }}>No saved simulations yet. Save your current assumptions to compare them later.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Monthly bill</th>
                  <th>Reduction</th>
                  <th>Monthly saving</th>
                  <th>Annual saving</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {saved.map(s => (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{money(s.bill)}</td>
                    <td>{s.pct}%</td>
                    <td>{money(s.monthly)}</td>
                    <td>{money(s.annual)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setBill(s.bill);
                          setPct(s.pct);
                          setRes(null);
                        }}
                      >
                        Load
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* REPORT EXPORT */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Simulation report</h2>
            <p className="muted">Export your current assumptions and estimated financial impact.</p>
          </div>
          <button type="button" className="btn" onClick={exportReport}>
            ↓ Export CSV
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          The report contains illustrative estimates based on your selected monthly bill and reduction percentage.
        </p>
      </div>

      {/* EMAIL ALERTS */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Energy intelligence notifications</h2>
            <p className="muted">Manage your GridWise AI email alerts and notification preferences.</p>
          </div>
          <span className="tag plan">Email alerts</span>
        </div>

        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: 14,
          background: "var(--accsoft)",
          borderRadius: 12,
          margin: "14px 0"
        }}>
          <div style={{ fontSize: 25 }}>✉</div>
          <div>
            <strong>Stay informed about your energy usage</strong>
            <p className="muted" style={{ fontSize: 12, marginTop: 3 }}>
              Review the available notification settings and email alert controls below.
            </p>
          </div>
        </div>

      </div>

      {/* DISCLAIMER */}
      <div className="card">
        <h2>Methodology & assumptions</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          Savings are estimated by applying the selected reduction percentage to the user-provided monthly electricity bill.
          The simulator assumes a consistent reduction across the selected projection period.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Actual savings depend on consumption patterns, tariff structure, appliance usage, operating conditions and successful implementation of energy-saving actions.
          These projections are not measured, verified or guaranteed savings.
        </p>
      </div>
    </>
  );
}


export function Devices() {
  const r = useGet("/devices");
  const [key, setKey] = useState(null);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [alerts, setAlerts] = useState({
    offline: true,
    connection: true,
    telemetry: false
  });

  const devices = Array.isArray(r.data) ? r.data : [];

  function statusOf(device) {
    return String(device.status || "unknown").toLowerCase();
  }

  function isOnline(device) {
    return ["online", "active", "connected"].includes(statusOf(device));
  }

  function isOffline(device) {
    return ["offline", "disconnected", "inactive"].includes(statusOf(device));
  }

  const online = devices.filter(isOnline).length;
  const offline = devices.filter(isOffline).length;
  const simulated = devices.filter(d => d.is_simulated).length;
  const hardware = devices.length - simulated;

  const filtered = devices.filter(d => {
    const matchesSearch = String(d.name || "")
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "online" && isOnline(d)) ||
      (filter === "offline" && isOffline(d)) ||
      (filter === "simulated" && d.is_simulated) ||
      (filter === "hardware" && !d.is_simulated);

    return matchesSearch && matchesFilter;
  });

  async function add(e) {
    e.preventDefault();
    setErr("");
    const form = e.target;
    const name = new FormData(form).get("name");

    try {
      const response = await api("/devices", {
        method: "POST",
        body: { name }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to register device.");
      }

      setKey(data.api_key);
      form.reset();
      await r.reload();
      setShowRegister(false);
    } catch (x) {
      setErr(x.message || "Device registration failed.");
    }
  }

  function exportDevices() {
    const rows = [
      ["Device name", "Source", "Status", "Last seen"],
      ...devices.map(d => [
        d.name,
        d.is_simulated ? "Simulated" : "Hardware",
        d.status || "Unknown",
        d.last_seen || "Never"
      ])
    ];

    const csv = rows.map(row =>
      row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "GridWise-Device-Registry.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyKey() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setErr("");
    } catch {
      setErr("Clipboard access failed. Select and copy the device key manually.");
    }
  }

  return (
    <>
      <Head
        t="Device Command Center"
        s="Manage registered energy meters, monitor connection status and prepare your IoT infrastructure."
      />

      {/* OVERVIEW */}
      <div className="grid" style={{ marginBottom: 18 }}>
        <Stat l="Registered devices" v={devices.length} />
        <Stat l="Online devices" v={online} />
        <Stat l="Offline devices" v={offline} />
        <Stat l="Hardware devices" v={hardware} />
      </div>

      {/* DEVICE HEALTH */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Infrastructure health</h2>
            <p className="muted">
              Overview of registered device connectivity.
            </p>
          </div>
          <span className="tag plan">Device registry</span>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 8
          }}>
            <strong>Online device ratio</strong>
            <strong>{devices.length ? Math.round(online / devices.length * 100) : 0}%</strong>
          </div>

          <div style={{
            height: 12,
            background: "var(--line)",
            borderRadius: 20,
            overflow: "hidden"
          }}>
            <div style={{
              width: `${devices.length ? online / devices.length * 100 : 0}%`,
              height: "100%",
              background: "var(--acc)",
              borderRadius: 20,
              transition: "width .2s"
            }} />
          </div>

          <div className="muted small" style={{ marginTop: 8 }}>
            {online} online · {offline} offline · {devices.length - online - offline} unknown
          </div>
        </div>

        <div className="three" style={{ marginTop: 18 }}>
          <div className="card">
            <div className="muted small">Simulated sources</div>
            <div style={{ fontSize: 25, fontWeight: 800, marginTop: 5 }}>{simulated}</div>
            <p className="muted small">Demo or simulated devices</p>
          </div>
          <div className="card">
            <div className="muted small">Hardware sources</div>
            <div style={{ fontSize: 25, fontWeight: 800, marginTop: 5 }}>{hardware}</div>
            <p className="muted small">Registered hardware devices</p>
          </div>
          <div className="card">
            <div className="muted small">Connectivity unknown</div>
            <div style={{ fontSize: 25, fontWeight: 800, marginTop: 5 }}>
              {devices.length - online - offline}
            </div>
            <p className="muted small">Status not classified</p>
          </div>
        </div>
      </div>

      {/* DEVICE REGISTRY */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Device registry</h2>
            <p className="muted">
              Search, filter and inspect registered devices.
            </p>
          </div>
          <button
            className="btn"
            onClick={() => setShowRegister(!showRegister)}
          >
            {showRegister ? "Close registration" : "+ Register device"}
          </button>
        </div>

        <div className="two" style={{ marginTop: 15 }}>
          <input
            placeholder="Search device name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All devices</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="simulated">Simulated</option>
            <option value="hardware">Hardware</option>
          </select>
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 14
        }}>
          <span className="muted small">
            Showing {filtered.length} of {devices.length} devices
          </span>
          <button
            className="btn ghost"
            onClick={exportDevices}
            disabled={!devices.length}
          >
            Export device registry
          </button>
        </div>

        <div className="tw" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Source</th>
                <th>Status</th>
                <th>Last seen</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.name}</strong>
                    <div className="muted small">ID: {d.id}</div>
                  </td>
                  <td>
                    <span className={"tag " + (d.is_simulated ? "warn" : "plan")}>
                      {d.is_simulated ? "Simulated" : "Hardware"}
                    </span>
                  </td>
                  <td>
                    <span className={"tag " + (
                      isOnline(d) ? "plan" : isOffline(d) ? "warn" : ""
                    )}>
                      {d.status || "Unknown"}
                    </span>
                  </td>
                  <td>{d.last_seen ? hh(d.last_seen) : "Never"}</td>
                  <td>
                    <button
                      className="btn ghost"
                      onClick={() => setSelected(selected === d.id ? null : d.id)}
                    >
                      {selected === d.id ? "Close" : "Inspect"}
                    </button>
                  </td>
                </tr>
              ))}

              {!filtered.length && (
                <tr>
                  <td colSpan="5" className="muted">
                    No devices match your search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected !== null && (() => {
          const d = devices.find(x => x.id === selected);
          if (!d) return null;

          return (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="hd">
                <div>
                  <h2>{d.name}</h2>
                  <p className="muted small">Device inspection</p>
                </div>
                <span className="tag">{d.status || "Unknown"}</span>
              </div>

              <div className="grid" style={{ marginTop: 14 }}>
                <Stat l="Device ID" v={d.id} />
                <Stat l="Source type" v={d.is_simulated ? "Simulated" : "Hardware"} />
                <Stat l="Connection status" v={d.status || "Unknown"} />
                <Stat l="Last seen" v={d.last_seen ? hh(d.last_seen) : "Never"} />
              </div>

              <p className="muted small" style={{ marginTop: 12 }}>
                Device telemetry and diagnostics depend on the data currently provided by the backend.
              </p>
            </div>
          );
        })()}
      </div>

      {/* REGISTRATION */}
      {showRegister && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Register a new device</h2>
          <p className="muted">
            Create a device identity and API key for future meter integration.
          </p>

          <form className="f" onSubmit={add} style={{ marginTop: 15 }}>
            <label>
              Device name
              <input
                name="name"
                required
                maxLength={120}
                placeholder="Example: Main Building ESP32"
              />
            </label>
            <button className="btn" type="submit">
              Create device key
            </button>
          </form>

          {err && <p className="err" role="alert">{err}</p>}

          <p className="muted small" style={{ marginTop: 12 }}>
            Hardware devices post readings to POST /ingest using their device key.
          </p>
        </div>
      )}

      {/* KEY DISPLAY */}
      {key && (
        <div className="card" style={{
          marginBottom: 18,
          borderColor: "var(--acc)"
        }}>
          <span className="tag plan">Device created</span>
          <h2 style={{ marginTop: 12 }}>Your device API key</h2>
          <p className="muted small">
            This key is shown only once here. Copy it and store it securely.
          </p>

          <div style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 14
          }}>
            <code style={{
              flex: 1,
              minWidth: 180,
              padding: 12,
              background: "var(--accsoft)",
              borderRadius: 8,
              overflowWrap: "anywhere"
            }}>
              {key}
            </code>
            <button className="btn" onClick={copyKey}>
              Copy API key
            </button>
            <button className="btn ghost" onClick={() => setKey(null)}>
              Hide key
            </button>
          </div>
        </div>
      )}

      {/* DEVICE EMAIL PREFERENCES */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="hd">
          <div>
            <h2>Device notification preferences</h2>
            <p className="muted">
              Choose which device events you want to monitor through email notifications.
            </p>
          </div>
          <span className="tag plan">Email preferences</span>
        </div>

        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: 15,
          background: "var(--accsoft)",
          borderRadius: 12,
          marginTop: 15
        }}>
          <div style={{ fontSize: 25 }}>✉</div>
          <div>
            <strong>Keep your device infrastructure informed</strong>
            <p className="muted small">
              Select the events that matter to your operations.
            </p>
          </div>
        </div>

        {[
          ["offline", "Device goes offline", "Get notified when a device is reported offline."],
          ["connection", "Connection interruptions", "Monitor communication and connection issues."],
          ["telemetry", "Unusual device readings", "Track unusual telemetry events when supported."]
        ].map(([id, title, description]) => (
          <label
            key={id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "14px 0",
              borderBottom: "1px solid var(--line)",
              cursor: "pointer"
            }}
          >
            <input
              type="checkbox"
              checked={alerts[id]}
              onChange={e => setAlerts(old => ({
                ...old,
                [id]: e.target.checked
              }))}
              style={{ marginTop: 4 }}
            />
            <span>
              <strong>{title}</strong>
              <span className="muted small" style={{ display: "block", marginTop: 4 }}>
                {description}
              </span>
            </span>
          </label>
        ))}

        <p className="muted small" style={{ marginTop: 12 }}>
          These notification selections are currently local UI preferences. They do not send emails or change backend alert rules. Actual alert management remains on the Anomalies page.
        </p>
      </div>

      {/* HARDWARE ROADMAP */}
      <div className="card">
        <h2>Hardware integration readiness</h2>
        <p className="muted" style={{ marginTop: 7 }}>
          GridWise AI is designed to support future ESP32 and PZEM-004T energy-meter integration.
        </p>

        <div className="three" style={{ marginTop: 15 }}>
          <div className="card">
            <strong>ESP32</strong>
            <p className="muted small" style={{ marginTop: 5 }}>
              Microcontroller and Wi-Fi communication.
            </p>
          </div>
          <div className="card">
            <strong>PZEM-004T</strong>
            <p className="muted small" style={{ marginTop: 5 }}>
              Voltage, current, power and energy measurements.
            </p>
          </div>
          <div className="card">
            <strong>FastAPI ingestion</strong>
            <p className="muted small" style={{ marginTop: 5 }}>
              Send readings through the authenticated /ingest endpoint.
            </p>
          </div>
        </div>

        <p className="muted small" style={{ marginTop: 14 }}>
          Registration does not mean a physical device is connected. Hardware installation and mains wiring must be handled by a qualified electrician.
        </p>
      </div>
    </>
  );
}



export function Reports() {
  const s = useGet("/dashboard/summary");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportName, setReportName] = useState("Monthly Energy Performance");
  const [period, setPeriod] = useState("Month to date");
  const [sections, setSections] = useState({
    summary: true,
    costs: true,
    projection: true,
    readings: true
  });

  const d = s.data || {};
  const ready = !!s.data && !s.loading;
  const kwh = Number(d.month_to_date_kwh || 0);
  const cost = Number(d.month_to_date_cost || 0);
  const projected = Number(d.projected_month_cost || 0);
  const tariff = Number(d.tariff || 0);

  const money = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

  const date = new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });

  const toggle = (key) =>
    setSections((old) => ({ ...old, [key]: !old[key] }));

  async function downloadCsv() {
    setBusy(true);
    setMsg("");
    try {
      const response = await api("/export/readings.csv");
      if (!response.ok) throw new Error("CSV export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gridwise-energy-readings.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg("CSV export started successfully.");
    } catch (e) {
      setMsg(e.message || "Unable to export readings.");
    } finally {
      setBusy(false);
    }
  }

  function emailReport() {
    if (!ready) return setMsg("Report data is not ready.");
    const body = [
      "GRIDWISE AI — ENERGY PERFORMANCE REPORT",
      "Report: " + reportName,
      "Period: " + period,
      "Generated: " + date,
      "",
      "Energy consumed: " + kwh.toFixed(2) + " kWh",
      "Estimated cost: " + money(cost),
      "Tariff: " + money(tariff) + " per kWh",
      "Projected monthly cost: " + money(projected),
      "Projection basis: " + (d.projection_basis || "Recorded readings"),
      "",
      "Note: Costs and projections are estimates, not verified savings."
    ].join("\n");

    window.location.href =
      "mailto:?subject=" + encodeURIComponent(reportName) +
      "&body=" + encodeURIComponent(body);

    setMsg("Email draft prepared in your email application.");
  }

  function copySummary() {
    const text = [
      "GRIDWISE AI — ENERGY REPORT",
      "Period: " + period,
      "Generated: " + date,
      "Energy: " + kwh.toFixed(2) + " kWh",
      "Estimated cost: " + money(cost),
      "Projected monthly cost: " + money(projected),
      "Tariff: " + money(tariff) + "/kWh"
    ].join("\n");

    navigator.clipboard?.writeText(text)
      .then(() => setMsg("Report summary copied."))
      .catch(() => setMsg("Clipboard unavailable."));
  }

  const selectedCount = Object.values(sections).filter(Boolean).length;

  return (
    <>
      <Head
        t="Reports"
        s="Energy performance, cost intelligence and data exports."
      />

      <style>{`
        .gw-report { display:grid; gap:18px; }
        .gw-report * { box-sizing:border-box; }
        .gw-report-hero {
          position:relative; overflow:hidden;
          padding:25px; border-radius:17px;
          border:1px solid var(--line);
          background:linear-gradient(115deg,var(--card),var(--accsoft));
        }
        .gw-report-hero:after {
          content:""; position:absolute; width:230px;height:230px;
          border-radius:50%; right:-75px;top:-115px;
          border:1px solid var(--line);
          box-shadow:0 0 0 25px var(--accsoft),0 0 0 50px var(--line);
          opacity:.45; pointer-events:none;
        }
        .gw-eyebrow {
          font-size:11px; font-weight:800; letter-spacing:1.5px;
          color:var(--acc); text-transform:uppercase;
        }
        .gw-report-hero h2 {
          font-size:25px; letter-spacing:-.7px;
          margin:11px 0 7px;
        }
        .gw-report-hero p { max-width:570px; line-height:1.65; }
        .gw-report-actions {
          display:flex; flex-wrap:wrap; gap:9px;
          margin-top:20px; position:relative; z-index:1;
        }
        .gw-report-kpis {
          display:grid; grid-template-columns:repeat(4,minmax(0,1fr));
          gap:12px;
        }
        .gw-report-kpi {
          padding:17px; border:1px solid var(--line);
          border-radius:13px; background:var(--card);
          min-width:0;
        }
        .gw-report-kpi .klabel {
          font-size:12px; color:var(--mute); margin-bottom:11px;
        }
        .gw-report-kpi .kvalue {
          font-size:clamp(19px,2vw,25px); font-weight:800;
          letter-spacing:-.7px; overflow-wrap:anywhere;
        }
        .gw-report-kpi .ksub {
          font-size:11px; color:var(--mute); margin-top:7px;
        }
        .gw-report-panel {
          border:1px solid var(--line); border-radius:15px;
          background:var(--card); padding:19px;
          min-width:0;
        }
        .gw-report-panelhead {
          display:flex; justify-content:space-between;
          align-items:flex-start; gap:12px; flex-wrap:wrap;
          margin-bottom:17px;
        }
        .gw-report-panelhead h2 { font-size:17px; margin:0 0 5px; }
        .gw-report-panelhead p { margin:0; font-size:12px; color:var(--mute); }
        .gw-report-form {
          display:grid; grid-template-columns:1.5fr 1fr;
          gap:13px;
        }
        .gw-report-form label {
          display:grid; gap:7px; font-size:12px;
          font-weight:650; color:var(--mute);
        }
        .gw-report-form input,.gw-report-form select {
          width:100%; min-width:0; padding:11px 12px;
          border:1px solid var(--line); border-radius:9px;
          background:var(--card); color:inherit; font:inherit;
        }
        .gw-report-layout {
          display:grid; grid-template-columns:minmax(0,1.5fr) minmax(240px,.8fr);
          gap:16px; align-items:start;
        }
        .gw-report-preview {
          border:1px solid var(--line); border-radius:12px;
          padding:19px; background:var(--card);
        }
        .gw-report-previewtop {
          display:flex; justify-content:space-between;
          gap:12px; flex-wrap:wrap; align-items:flex-start;
          padding-bottom:15px; border-bottom:1px solid var(--line);
        }
        .gw-report-preview h3 { font-size:15px; margin:0 0 5px; }
        .gw-report-preview .report-section {
          padding:16px 0; border-bottom:1px solid var(--line);
        }
        .gw-report-preview .report-section:last-child { border:0; }
        .gw-report-preview .report-section h4 {
          margin:0 0 12px; font-size:12px;
          text-transform:uppercase; letter-spacing:.6px;
          color:var(--mute);
        }
        .gw-report-pair {
          display:flex; justify-content:space-between;
          gap:12px; padding:8px 0; font-size:13px;
        }
        .gw-report-pair span { color:var(--mute); }
        .gw-report-highlight {
          background:var(--accsoft); border:1px solid var(--line);
          border-radius:10px; padding:15px;
        }
        .gw-report-highlight strong {
          display:block; font-size:26px; margin-top:5px;
          letter-spacing:-.8px;
        }
        .gw-report-checks { display:grid; gap:10px; }
        .gw-report-check {
          display:flex; gap:11px; align-items:center;
          padding:12px; border:1px solid var(--line);
          border-radius:10px; font-size:13px;
        }
        .gw-report-check input { accent-color:var(--acc); width:16px;height:16px; }
        .gw-report-tools {
          display:grid; grid-template-columns:repeat(4,minmax(0,1fr));
          gap:11px;
        }
        .gw-report-tool {
          border:1px solid var(--line); border-radius:12px;
          padding:15px; display:flex; flex-direction:column;
          align-items:flex-start; gap:9px; min-width:0;
        }
        .gw-report-tool .tool-icon {
          width:37px;height:37px;border-radius:10px;
          display:grid;place-items:center;
          background:var(--accsoft);font-size:18px;
        }
        .gw-report-tool b { font-size:13px; }
        .gw-report-tool p {
          font-size:11px; color:var(--mute); line-height:1.5;
          margin:0; flex:1;
        }
        .gw-report-tool .btn { width:100%; justify-content:center; }
        .gw-report-note {
          padding:13px 15px; border-radius:10px;
          background:var(--accsoft); border:1px solid var(--line);
          font-size:12px; line-height:1.6;
        }
        .gw-report-status {
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; padding:11px 0; border-bottom:1px solid var(--line);
          font-size:13px;
        }
        .gw-report-status:last-child { border:0; }
        @media(max-width:850px) {
          .gw-report-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .gw-report-tools { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .gw-report-layout { grid-template-columns:1fr; }
        }
        @media(max-width:520px) {
          .gw-report-hero { padding:18px; }
          .gw-report-hero h2 { font-size:21px; }
          .gw-report-panel { padding:14px; }
          .gw-report-form { grid-template-columns:1fr; }
          .gw-report-tools { grid-template-columns:1fr 1fr; }
          .gw-report-tool { padding:11px; }
        }
        @media print {
          body * { visibility:hidden !important; }
          #gridwise-print-report,#gridwise-print-report * {
            visibility:visible !important;
          }
          #gridwise-print-report {
            position:absolute; left:0;top:0;width:100%;
            background:white !important;color:black !important;
            border:0 !important;
          }
          #gridwise-print-report .no-print { display:none !important; }
        }
      `}</style>

      <div className="gw-report">

        <section className="gw-report-hero">
          <div className="gw-eyebrow">GRIDWISE AI / INTELLIGENCE REPORTS</div>
          <h2>Energy performance, at a glance.</h2>
          <p className="muted">
            Understand your consumption, monitor estimated expenditure,
            and create a clear report for your energy operations.
          </p>
          <div className="gw-report-actions">
            <button className="btn" onClick={() => window.print()}>
              Print / Save PDF
            </button>
            <button className="btn ghost" onClick={downloadCsv} disabled={busy}>
              {busy ? "Preparing..." : "↓ Export readings"}
            </button>
            <button className="btn ghost" onClick={emailReport}>
              ✉ Prepare email
            </button>
          </div>
          <div className="muted small" style={{ marginTop:15 }}>
            Reporting date: {date} · {period} · Demo workspace
          </div>
        </section>

        <section className="gw-report-kpis">
          <div className="gw-report-kpi">
            <div className="klabel">Energy consumed</div>
            <div className="kvalue">{ready ? kwh.toFixed(2) : "—"}</div>
            <div className="ksub">kWh · Month to date</div>
          </div>
          <div className="gw-report-kpi">
            <div className="klabel">Estimated cost</div>
            <div className="kvalue">{ready ? money(cost) : "—"}</div>
            <div className="ksub">Based on current tariff</div>
          </div>
          <div className="gw-report-kpi">
            <div className="klabel">Projected monthly cost</div>
            <div className="kvalue">{ready ? money(projected) : "—"}</div>
            <div className="ksub">Estimated projection</div>
          </div>
          <div className="gw-report-kpi">
            <div className="klabel">Applied tariff</div>
            <div className="kvalue">{ready ? money(tariff) : "—"}</div>
            <div className="ksub">Per kWh</div>
          </div>
        </section>

        <section className="gw-report-panel">
          <div className="gw-report-panelhead">
            <div>
              <h2>Report settings</h2>
              <p>Configure the title and reporting period.</p>
            </div>
            <span className="tag">CONFIGURATION</span>
          </div>
          <div className="gw-report-form">
            <label>
              Report name
              <input
                value={reportName}
                maxLength={100}
                onChange={(e) => setReportName(e.target.value)}
              />
            </label>
            <label>
              Reporting period
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option>Month to date</option>
                <option>Current dashboard summary</option>
              </select>
            </label>
          </div>
          <p className="muted small" style={{ marginTop:10 }}>
            The current summary endpoint supplies month-to-date figures.
            Changing the label does not change the underlying data range.
          </p>
        </section>

        <div className="gw-report-layout">

          <section className="gw-report-panel" id="gridwise-print-report">
            <div className="gw-report-panelhead">
              <div>
                <h2>Report preview</h2>
                <p>Your selected report content.</p>
              </div>
              <span className="tag">PREVIEW</span>
            </div>

            {s.loading ? (
              <p className="muted">Loading report data...</p>
            ) : s.error ? (
              <p className="err">{String(s.error)}</p>
            ) : !ready ? (
              <p className="muted">No report data available.</p>
            ) : (
              <div className="gw-report-preview">
                <div className="gw-report-previewtop">
                  <div>
                    <div className="gw-eyebrow">GRIDWISE AI</div>
                    <h3 style={{ marginTop:8 }}>{reportName}</h3>
                    <div className="muted small">{period} · {date}</div>
                  </div>
                  <span className="tag">ENERGY REPORT</span>
                </div>

                {sections.summary && (
                  <div className="report-section">
                    <h4>01 / Energy performance</h4>
                    <div className="gw-report-pair">
                      <span>Month-to-date energy</span>
                      <b>{kwh.toFixed(2)} kWh</b>
                    </div>
                    <div className="gw-report-pair">
                      <span>Estimated energy cost</span>
                      <b>{money(cost)}</b>
                    </div>
                  </div>
                )}

                {sections.costs && (
                  <div className="report-section">
                    <h4>02 / Cost analysis</h4>
                    <div className="gw-report-pair">
                      <span>Applied tariff</span>
                      <b>{money(tariff)} / kWh</b>
                    </div>
                    <div className="gw-report-pair">
                      <span>Estimated expenditure</span>
                      <b>{money(cost)}</b>
                    </div>
                  </div>
                )}

                {sections.projection && (
                  <div className="report-section">
                    <h4>03 / Monthly projection</h4>
                    <div className="gw-report-highlight">
                      <span className="muted small">Projected monthly cost</span>
                      <strong>{money(projected)}</strong>
                      <span className="muted small">
                        {d.projection_basis || "Based on recorded readings"}
                      </span>
                    </div>
                  </div>
                )}

                {sections.readings && (
                  <div className="report-section">
                    <h4>04 / Detailed readings</h4>
                    <p className="muted small">
                      The detailed readings file can be downloaded separately
                      using the CSV export option.
                    </p>
                  </div>
                )}

                <div className="gw-report-note" style={{ marginTop:14 }}>
                  Figures are based on available readings. Costs and
                  projections are estimates and may differ from the actual
                  electricity bill. This report does not represent verified
                  savings.
                </div>
              </div>
            )}
          </section>

          <section className="gw-report-panel">
            <div className="gw-report-panelhead">
              <div>
                <h2>Report contents</h2>
                <p>Choose what appears in the preview.</p>
              </div>
              <span className="tag">{selectedCount}/4</span>
            </div>

            <div className="gw-report-checks">
              <label className="gw-report-check">
                <input type="checkbox" checked={sections.summary}
                  onChange={() => toggle("summary")} />
                <span><b>Energy performance</b><br />
                  <span className="muted small">Consumption summary</span></span>
              </label>
              <label className="gw-report-check">
                <input type="checkbox" checked={sections.costs}
                  onChange={() => toggle("costs")} />
                <span><b>Cost analysis</b><br />
                  <span className="muted small">Tariff and expenditure</span></span>
              </label>
              <label className="gw-report-check">
                <input type="checkbox" checked={sections.projection}
                  onChange={() => toggle("projection")} />
                <span><b>Monthly projection</b><br />
                  <span className="muted small">Estimated month-end cost</span></span>
              </label>
              <label className="gw-report-check">
                <input type="checkbox" checked={sections.readings}
                  onChange={() => toggle("readings")} />
                <span><b>Readings reference</b><br />
                  <span className="muted small">CSV data export reference</span></span>
              </label>
            </div>

            <div className="gw-report-note" style={{ marginTop:16 }}>
              <b>Report integrity</b>
              <p style={{ margin:"6px 0 0" }}>
                GridWise AI separates measured readings from estimated
                costs and projections.
              </p>
            </div>
          </section>
        </div>

        <section className="gw-report-panel">
          <div className="gw-report-panelhead">
            <div>
              <h2>Export & distribution</h2>
              <p>Choose a format or prepare a report for sharing.</p>
            </div>
            <span className="tag">EXPORT CENTER</span>
          </div>

          <div className="gw-report-tools">
            <div className="gw-report-tool">
              <div className="tool-icon">▤</div>
              <b>CSV readings</b>
              <p>Download the available readings for spreadsheet analysis.</p>
              <button className="btn" onClick={downloadCsv} disabled={busy}>
                {busy ? "Preparing..." : "Export CSV"}
              </button>
            </div>
            <div className="gw-report-tool">
              <div className="tool-icon">▧</div>
              <b>PDF report</b>
              <p>Print the report preview or save it as a PDF.</p>
              <button className="btn" onClick={() => window.print()}>
                Save / Print
              </button>
            </div>
            <div className="gw-report-tool">
              <div className="tool-icon">✉</div>
              <b>Email summary</b>
              <p>Prepare an email with the key report figures.</p>
              <button className="btn" onClick={emailReport}>
                Prepare email
              </button>
            </div>
            <div className="gw-report-tool">
              <div className="tool-icon">⧉</div>
              <b>Copy summary</b>
              <p>Copy the report figures for quick sharing.</p>
              <button className="btn" onClick={copySummary}>
                Copy summary
              </button>
            </div>
          </div>

          {msg && <p className="ok" role="status" style={{ marginTop:14 }}>{msg}</p>}
        </section>

        <section className="gw-report-panel">
          <div className="gw-report-panelhead">
            <div>
              <h2>Delivery & report status</h2>
              <p>Transparency about available sharing features.</p>
            </div>
            <span className="tag">SYSTEM STATUS</span>
          </div>

          <div className="gw-report-status">
            <span>Dashboard summary</span>
            <span className={ready ? "ok" : "muted"}>
              {ready ? "● Ready" : "● Loading"}
            </span>
          </div>
          <div className="gw-report-status">
            <span>CSV export endpoint</span>
            <span className="tag">Configured</span>
          </div>
          <div className="gw-report-status">
            <span>Email draft preparation</span>
            <span className="tag">Available</span>
          </div>
          <div className="gw-report-status">
            <span>Automated scheduled email delivery</span>
            <span className="tag warn">Not configured</span>
          </div>

          <p className="muted small" style={{ marginTop:13 }}>
            Email preparation opens your configured email application.
            Automatic sending and scheduled report delivery require a
            backend mail service. Anomaly email alerts remain available
            on the Anomalies page.
          </p>
        </section>

      </div>
    </>
  );
}



export function SettingsPage() {
  const me = useGet("/me");
  const [tab, setTab] = useState("account");
  const [msg, setMsg] = useState("");
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme || "light"
  );

  const [notifications, setNotifications] = useState(() => {
    try {
      return {
        email: true,
        anomaly: true,
        critical: true,
        forecast: false,
        weekly: true,
        browser: false,
        recipient: "",
        ...(JSON.parse(localStorage.getItem("gw_notification_preferences") || "{}"))
      };
    } catch {
      return {
        email: true,
        anomaly: true,
        critical: true,
        forecast: false,
        weekly: true,
        browser: false,
        recipient: ""
      };
    }
  });

  const [preferences, setPreferences] = useState(() => {
    try {
      return {
        compact: false,
        confirmActions: true,
        showDemoLabels: true,
        ...(JSON.parse(localStorage.getItem("gw_workspace_preferences") || "{}"))
      };
    } catch {
      return {
        compact: false,
        confirmActions: true,
        showDemoLabels: true
      };
    }
  });

  const [saving, setSaving] = useState(false);

  const tabs = [
    ["account", "Account", "user-round"],
    ["org", "Workspace", "building-2"],
    ["tariffs", "Energy tariff", "zap"],
    ["notifications", "Notifications", "bell"],
    ["appearance", "Appearance", "palette"],
    ["preferences", "Preferences", "sliders-horizontal"],
    ["security", "Security", "shield-check"]
  ];

  function pickTheme(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem("gw_theme", t);
    setTheme(t);
    setMsg("Appearance updated.");
  }

  function updateNotification(key, value) {
    setNotifications(old => ({ ...old, [key]: value }));
  }

  function updatePreference(key, value) {
    setPreferences(old => ({ ...old, [key]: value }));
  }

  function saveNotifications(e) {
    e.preventDefault();
    try {
      localStorage.setItem(
        "gw_notification_preferences",
        JSON.stringify(notifications)
      );
      setMsg("Notification preferences saved in this browser.");
    } catch {
      setMsg("Unable to save preferences in this browser.");
    }
  }

  function savePreferences(e) {
    e.preventDefault();
    try {
      localStorage.setItem(
        "gw_workspace_preferences",
        JSON.stringify(preferences)
      );
      setMsg("Workspace preferences saved.");
    } catch {
      setMsg("Unable to save preferences.");
    }
  }

  async function saveTariff(e) {
    e.preventDefault();
    setSaving(true);
    setMsg("");

    const tariff = Number(new FormData(e.target).get("tariff"));

    if (!Number.isFinite(tariff) || tariff <= 0 || tariff > 100) {
      setMsg("Enter a tariff between ₹0.01 and ₹100.");
      setSaving(false);
      return;
    }

    try {
      const response = await api("/settings/tariff", {
        method: "PUT",
        body: { tariff }
      });

      if (!response.ok) {
        throw new Error("Could not save tariff.");
      }

      setMsg("Energy tariff successfully updated.");
      me.reload();
    } catch (e) {
      setMsg(e.message || "Unable to update tariff.");
    } finally {
      setSaving(false);
    }
  }

  const SectionHeader = ({ title, desc, tag }) => (
    <div className="gw-set-head">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      {tag && <span className="tag">{tag}</span>}
    </div>
  );

  const Toggle = ({ label, desc, checked, onChange }) => (
    <label className="gw-set-toggle">
      <span className="gw-set-toggletext">
        <b>{label}</b>
        <small>{desc}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="gw-set-switch" aria-hidden="true" />
    </label>
  );

  return (
    <>
      <Head
        t="Settings"
        s="Manage your GridWise AI workspace, energy configuration and preferences."
      />

      <style>{`
        .gw-settings {
          display:grid;
          gap:17px;
          min-width:0;
        }
        .gw-set-hero {
          border:1px solid var(--line);
          border-radius:17px;
          padding:23px;
          background:linear-gradient(120deg,var(--card),var(--accsoft));
          position:relative;
          overflow:hidden;
        }
        .gw-set-hero:after {
          content:"";
          position:absolute;
          right:-45px;
          top:-85px;
          width:200px;
          height:200px;
          border:1px solid var(--line);
          border-radius:50%;
          box-shadow:0 0 0 22px var(--accsoft),0 0 0 44px var(--line);
          opacity:.4;
          pointer-events:none;
        }
        .gw-set-eyebrow {
          color:var(--acc);
          font-size:11px;
          font-weight:800;
          letter-spacing:1.5px;
        }
        .gw-set-hero h2 {
          font-size:24px;
          margin:10px 0 6px;
          letter-spacing:-.7px;
        }
        .gw-set-hero p {
          max-width:590px;
          line-height:1.6;
          margin:0;
        }
        .gw-set-overview {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:12px;
        }
        .gw-set-overviewitem {
          border:1px solid var(--line);
          border-radius:12px;
          padding:15px;
          background:var(--card);
          min-width:0;
        }
        .gw-set-overviewitem span {
          display:block;
          color:var(--mute);
          font-size:11px;
          margin-bottom:7px;
        }
        .gw-set-overviewitem b {
          font-size:14px;
          overflow-wrap:anywhere;
        }
        .gw-set-nav {
          display:flex;
          gap:6px;
          padding:6px;
          border:1px solid var(--line);
          border-radius:12px;
          background:var(--card);
          overflow-x:auto;
          scrollbar-width:thin;
        }
        .gw-set-nav button {
          flex:0 0 auto;
          border:0;
          border-radius:8px;
          padding:10px 13px;
          background:transparent;
          color:var(--mute);
          font:inherit;
          font-size:12px;
          font-weight:650;
          cursor:pointer;
          transition:.2s;
        }
        .gw-set-nav button.active {
          background:var(--accsoft);
          color:var(--acc);
          box-shadow:inset 0 0 0 1px var(--line);
        }
        .gw-set-panel {
          border:1px solid var(--line);
          border-radius:15px;
          background:var(--card);
          padding:20px;
          min-width:0;
        }
        .gw-set-head {
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:12px;
          flex-wrap:wrap;
          margin-bottom:19px;
        }
        .gw-set-head h2 {
          margin:0 0 5px;
          font-size:17px;
        }
        .gw-set-head p {
          margin:0;
          font-size:12px;
          color:var(--mute);
          line-height:1.5;
        }
        .gw-set-profile {
          display:flex;
          gap:15px;
          align-items:center;
          padding:17px;
          border:1px solid var(--line);
          border-radius:12px;
          background:var(--accsoft);
          margin-bottom:17px;
          min-width:0;
        }
        .gw-set-avatar {
          display:grid;
          place-items:center;
          flex:0 0 48px;
          height:48px;
          border-radius:14px;
          background:var(--card);
          border:1px solid var(--line);
          font-size:20px;
          font-weight:800;
          color:var(--acc);
        }
        .gw-set-profile b {
          display:block;
          overflow-wrap:anywhere;
        }
        .gw-set-profile small {
          display:block;
          color:var(--mute);
          margin-top:4px;
          overflow-wrap:anywhere;
        }
        .gw-set-details {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px;
        }
        .gw-set-detail {
          border:1px solid var(--line);
          border-radius:10px;
          padding:13px;
          min-width:0;
        }
        .gw-set-detail span {
          display:block;
          font-size:11px;
          color:var(--mute);
          margin-bottom:7px;
        }
        .gw-set-detail b {
          font-size:13px;
          overflow-wrap:anywhere;
        }
        .gw-set-note {
          padding:13px 14px;
          border:1px solid var(--line);
          border-radius:10px;
          background:var(--accsoft);
          font-size:12px;
          line-height:1.6;
          margin-top:15px;
        }
        .gw-set-form {
          display:grid;
          gap:13px;
          max-width:470px;
        }
        .gw-set-form label {
          display:grid;
          gap:7px;
          font-size:12px;
          font-weight:650;
          color:var(--mute);
        }
        .gw-set-form input {
          width:100%;
          padding:11px 12px;
          border:1px solid var(--line);
          border-radius:9px;
          background:var(--card);
          color:inherit;
          font:inherit;
        }
        .gw-set-toggle {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:15px;
          padding:14px 0;
          border-bottom:1px solid var(--line);
          cursor:pointer;
          position:relative;
        }
        .gw-set-toggle:last-child { border-bottom:0; }
        .gw-set-toggletext { display:grid; gap:4px; }
        .gw-set-toggletext b { font-size:13px; }
        .gw-set-toggletext small {
          font-size:11px;
          color:var(--mute);
          line-height:1.45;
        }
        .gw-set-toggle input {
          position:absolute;
          opacity:0;
          width:1px;
          height:1px;
        }
        .gw-set-switch {
          width:38px;
          height:21px;
          flex:0 0 38px;
          border-radius:20px;
          background:var(--line);
          position:relative;
          transition:.2s;
        }
        .gw-set-switch:after {
          content:"";
          position:absolute;
          width:15px;
          height:15px;
          top:3px;
          left:3px;
          border-radius:50%;
          background:var(--card);
          transition:.2s;
        }
        .gw-set-toggle input:checked + .gw-set-switch {
          background:var(--acc);
        }
        .gw-set-toggle input:checked + .gw-set-switch:after {
          transform:translateX(17px);
        }
        .gw-set-toggle input:focus-visible + .gw-set-switch {
          outline:2px solid var(--acc);
          outline-offset:3px;
        }
        .gw-set-themegrid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
        }
        .gw-set-theme {
          border:1px solid var(--line);
          border-radius:12px;
          padding:15px;
          background:var(--card);
          color:inherit;
          cursor:pointer;
          text-align:left;
        }
        .gw-set-theme.selected {
          border:2px solid var(--acc);
          padding:14px;
          background:var(--accsoft);
        }
        .gw-set-themevisual {
          height:76px;
          border-radius:8px;
          margin-bottom:12px;
          border:1px solid var(--line);
          display:flex;
          gap:6px;
          padding:9px;
        }
        .gw-set-themevisual span {
          display:block;
          border-radius:4px;
        }
        .gw-set-themevisual.light {
          background:#f3f6fa;
        }
        .gw-set-themevisual.light span:first-child {
          width:25%;
          background:#dce5ed;
        }
        .gw-set-themevisual.light span:last-child {
          flex:1;
          background:white;
          border:1px solid #dce5ed;
        }
        .gw-set-themevisual.dark {
          background:#101a27;
        }
        .gw-set-themevisual.dark span:first-child {
          width:25%;
          background:#26384b;
        }
        .gw-set-themevisual.dark span:last-child {
          flex:1;
          background:#1b2938;
          border:1px solid #34475a;
        }
        .gw-set-security {
          display:grid;
          gap:10px;
        }
        .gw-set-securityrow {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          padding:13px;
          border:1px solid var(--line);
          border-radius:10px;
          font-size:12px;
        }
        .gw-set-securityrow b { font-size:12px; }
        .gw-set-bottom {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
          padding:13px 15px;
          border:1px solid var(--line);
          border-radius:11px;
          background:var(--card);
          font-size:11px;
          color:var(--mute);
        }
        @media(max-width:650px) {
          .gw-set-overview { grid-template-columns:1fr; }
          .gw-set-details { grid-template-columns:1fr; }
          .gw-set-panel { padding:15px; }
          .gw-set-hero { padding:18px; }
          .gw-set-hero h2 { font-size:21px; }
        }
      `}</style>

      <div className="gw-settings">

        <section className="gw-set-hero">
          <div className="gw-set-eyebrow">
            GRIDWISE AI / CONTROL CENTER
          </div>
          <h2>Everything, configured your way.</h2>
          <p className="muted">
            Manage your workspace identity, electricity tariff,
            notification preferences, security information and
            application experience from one place.
          </p>
        </section>

        <div className="gw-set-overview">
          <div className="gw-set-overviewitem">
            <span>WORKSPACE</span>
            <b>Demo workspace</b>
          </div>
          <div className="gw-set-overviewitem">
            <span>APPLICATION MODE</span>
            <b>Simulated data</b>
          </div>
          <div className="gw-set-overviewitem">
            <span>ACTIVE APPEARANCE</span>
            <b>{theme === "dark" ? "Dark theme" : "Light theme"}</b>
          </div>
        </div>

        <div className="gw-set-nav" role="tablist" aria-label="Settings sections">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setMsg("");
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <State r={me}>
          {(d) => (
            <>
              {tab === "account" && (
                <section className="gw-set-panel">
                  <SectionHeader
                    title="Account profile"
                    desc="Your identity and access information."
                    tag="ACCOUNT"
                  />

                  <div className="gw-set-profile">
                    <div className="gw-set-avatar">
                      {(d.name || "D").charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <b>{d.name || "Demo User"}</b>
                      <small>{d.email || "Email unavailable"}</small>
                    </div>
                    <span className="tag">Owner</span>
                  </div>

                  <div className="gw-set-details">
                    <div className="gw-set-detail">
                      <span>FULL NAME</span>
                      <b>{d.name || "—"}</b>
                    </div>
                    <div className="gw-set-detail">
                      <span>EMAIL ADDRESS</span>
                      <b>{d.email || "—"}</b>
                    </div>
                    <div className="gw-set-detail">
                      <span>ACCESS ROLE</span>
                      <b>{d.role || "—"}</b>
                    </div>
                    <div className="gw-set-detail">
                      <span>ACCOUNT TYPE</span>
                      <b>Demo account</b>
                    </div>
                  </div>

                  <div className="gw-set-note">
                    <b>Profile editing</b>
                    <br />
                    Account details are currently read-only. Profile
                    editing and account recovery are planned features.
                  </div>
                </section>
              )}

              {tab === "org" && (
                <section className="gw-set-panel">
                  <SectionHeader
                    title="Workspace configuration"
                    desc="Review your organization and monitoring environment."
                    tag="WORKSPACE"
                  />

                  <div className="gw-set-details">
                    <div className="gw-set-detail">
                      <span>ORGANIZATION</span>
                      <b>{d.org || "Demo organization"}</b>
                    </div>
                    <div className="gw-set-detail">
                      <span>WORKSPACE ROLE</span>
                      <b>{d.role || "Owner"}</b>
                    </div>
                    <div className="gw-set-detail">
                      <span>MONITORING SITES</span>
                      <b>
                        {Array.isArray(d.sites) ? d.sites.length : 0} sites
                      </b>
                    </div>
                    <div className="gw-set-detail">
                      <span>DATA SOURCE MODE</span>
                      <b>{d.mode || "Simulated"}</b>
                    </div>
                  </div>

                  <h3 style={{ marginTop:22, fontSize:14 }}>Registered sites</h3>
                  <div className="gw-set-details">
                    {(Array.isArray(d.sites) ? d.sites : []).map((site, i) => (
                      <div className="gw-set-detail" key={i}>
                        <span>SITE {i + 1}</span>
                        <b>{site}</b>
                      </div>
                    ))}
                  </div>

                  <div className="gw-set-note">
                    Multi-site management, team invitations, and
                    organization editing are not enabled in this version.
                  </div>
                </section>
              )}

              {tab === "tariffs" && (
                <section className="gw-set-panel">
                  <SectionHeader
                    title="Energy tariff configuration"
                    desc="Set the flat electricity rate used by GridWise cost calculations."
                    tag="BILLING"
                  />

                  <div className="gw-set-profile">
                    <div className="gw-set-avatar">₹</div>
                    <div>
                      <b>Current electricity tariff</b>
                      <small>Applied to estimated energy costs</small>
                    </div>
                  </div>

                  <div className="gw-set-detail" style={{ marginBottom:17 }}>
                    <span>CURRENT TARIFF</span>
                    <b style={{ fontSize:23 }}>
                      ₹{Number(d.tariff || 0).toFixed(2)}
                      <span className="muted" style={{ fontSize:12 }}>
                        {" "} / kWh
                      </span>
                    </b>
                  </div>

                  <form className="gw-set-form" onSubmit={saveTariff} key={d.tariff}>
                    <label>
                      New flat tariff (₹ per kWh)
                      <input
                        name="tariff"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        required
                        defaultValue={d.tariff}
                      />
                    </label>
                    <button className="btn" type="submit" disabled={saving}>
                      {saving ? "Saving..." : "Save energy tariff"}
                    </button>
                  </form>

                  <div className="gw-set-note">
                    <b>Important tariff information</b>
                    <br />
                    GridWise uses this flat tariff for estimates. Actual
                    utility bills may include fixed charges, taxes, subsidies,
                    time-of-day rates and other adjustments.
                  </div>
                </section>
              )}

              {tab === "notifications" && (
                <section className="gw-set-panel">
                  <SectionHeader
                    title="Notification preferences"
                    desc="Customize the types of energy events you want to track."
                    tag="ALERT PREFERENCES"
                  />

                  <div className="gw-set-note" style={{ marginTop:0, marginBottom:18 }}>
                    <b>Email alert configuration</b>
                    <br />
                    These are local preference settings. Actual anomaly
                    email delivery and recipient management are handled
                    separately on the Anomalies page.
                  </div>

                  <form onSubmit={saveNotifications}>
                    <h3 style={{ fontSize:13 }}>Delivery preferences</h3>

                    <Toggle
                      label="Email notification preference"
                      desc="Enable your preference for email-based updates."
                      checked={notifications.email}
                      onChange={v => updateNotification("email", v)}
                    />

                    <Toggle
                      label="Critical energy alerts"
                      desc="Highlight critical consumption events."
                      checked={notifications.critical}
                      onChange={v => updateNotification("critical", v)}
                    />

                    <Toggle
                      label="Anomaly notifications"
                      desc="Track unusual consumption patterns."
                      checked={notifications.anomaly}
                      onChange={v => updateNotification("anomaly", v)}
                    />

                    <Toggle
                      label="Forecast updates"
                      desc="Preference for forecast-related notifications."
                      checked={notifications.forecast}
                      onChange={v => updateNotification("forecast", v)}
                    />

                    <Toggle
                      label="Weekly energy summary"
                      desc="Preference for a weekly performance digest."
                      checked={notifications.weekly}
                      onChange={v => updateNotification("weekly", v)}
                    />

                    <Toggle
                      label="Browser notification preference"
                      desc="Save your preference for browser notifications. Actual browser delivery is not configured here."
                      checked={notifications.browser}
                      onChange={v => updateNotification("browser", v)}
                    />

                    <div className="gw-set-form" style={{ marginTop:18 }}>
                      <label>
                        Preferred email recipient
                        <input
                          type="email"
                          value={notifications.recipient}
                          onChange={e => updateNotification("recipient", e.target.value)}
                          placeholder="Enter email address"
                        />
                      </label>

                      <button className="btn" type="submit">
                        Save notification preferences
                      </button>
                    </div>
                  </form>

                  <div className="gw-set-note">
                    <b>Where actual alerts are managed</b>
                    <br />
                    Visit Intelligence → Anomalies for the existing
                    anomaly alert panel and its email-recipient settings.
                  </div>
                </section>
              )}

              {tab === "appearance" && (
                <section className="gw-set-panel">
                  <SectionHeader
                    title="Appearance & visual experience"
                    desc="Choose the visual theme for your GridWise workspace."
                    tag="PERSONALIZATION"
                  />

                  <div className="gw-set-themegrid">
                    <button
                      type="button"
                      className={"gw-set-theme " + (theme === "light" ? "selected" : "")}
                      onClick={() => pickTheme("light")}
                    >
                      <div className="gw-set-themevisual light">
                        <span />
                        <span />
                      </div>
                      <b>Light theme</b>
                      <p className="muted small">Clean, bright interface</p>
                      {theme === "light" && <span className="tag">Active</span>}
                    </button>

                    <button
                      type="button"
                      className={"gw-set-theme " + (theme === "dark" ? "selected" : "")}
                      onClick={() => pickTheme("dark")}
                    >
                      <div className="gw-set-themevisual dark">
                        <span />
                        <span />
                      </div>
                      <b>Dark theme</b>
                      <p className="muted small">Low-light visual experience</p>
                      {theme === "dark" && <span className="tag">Active</span>}
                    </button>
                  </div>

                  <div className="gw-set-note">
                    Your selected theme is saved in this browser.
                    It does not change the appearance for other users
                    or devices.
                  </div>
                </section>
              )}

              {tab === "preferences" && (
                <section className="gw-set-panel">
                  <SectionHeader
                    title="Workspace preferences"
                    desc="Control how the application presents information."
                    tag="EXPERIENCE"
                  />

                  <Toggle
                    label="Compact workspace"
                    desc="Save your preference for a more compact interface."
                    checked={preferences.compact}
                    onChange={v => updatePreference("compact", v)}
                  />

                  <Toggle
                    label="Confirm important actions"
                    desc="Preference to confirm destructive or important actions."
                    checked={preferences.confirmActions}
                    onChange={v => updatePreference("confirmActions", v)}
                  />

                  <Toggle
                    label="Show demo data labels"
                    desc="Keep simulated-data indicators visible in the workspace."
                    checked={preferences.showDemoLabels}
                    onChange={v => updatePreference("showDemoLabels", v)}
                  />

                  <form onSubmit={savePreferences}>
                    <button className="btn" style={{ marginTop:18 }}>
                      Save workspace preferences
                    </button>
                  </form>

                  <div className="gw-set-note">
                    These preferences are stored locally. Compact layout
                    and confirmation behavior are preference settings;
                    they do not currently alter backend behavior.
                  </div>
                </section>
              )}

              {tab === "security" && (
                <section className="gw-set-panel">
                  <SectionHeader
                    title="Security & access"
                    desc="Review the current account security information."
                    tag="SECURITY"
                  />

                  <div className="gw-set-security">
                    <div className="gw-set-securityrow">
                      <div>
                        <b>Password protection</b>
                        <div className="muted small">Password hashing is handled by the backend.</div>
                      </div>
                      <span className="tag">Configured</span>
                    </div>

                    <div className="gw-set-securityrow">
                      <div>
                        <b>Session expiration</b>
                        <div className="muted small">Configured session lifetime.</div>
                      </div>
                      <span className="tag">8 hours</span>
                    </div>

                    <div className="gw-set-securityrow">
                      <div>
                        <b>Two-factor authentication</b>
                        <div className="muted small">Additional sign-in verification.</div>
                      </div>
                      <span className="tag warn">Planned</span>
                    </div>

                    <div className="gw-set-securityrow">
                      <div>
                        <b>Password change</b>
                        <div className="muted small">Change your account password.</div>
                      </div>
                      <span className="tag warn">Not available</span>
                    </div>

                    <div className="gw-set-securityrow">
                      <div>
                        <b>Account recovery</b>
                        <div className="muted small">Recover access to your account.</div>
                      </div>
                      <span className="tag warn">Planned</span>
                    </div>
                  </div>

                  <div className="gw-set-note">
                    <b>Security transparency</b>
                    <br />
                    This section displays the security features currently
                    documented for this application. Two-factor sign-in,
                    password changes and session-management controls
                    are not implemented through this page.
                  </div>
                </section>
              )}
            </>
          )}
        </State>

        {msg && (
          <div className="gw-set-bottom" role="status">
            <span>{msg}</span>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setMsg("")}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="gw-set-bottom">
          <span>GRIDWISE AI · Workspace Control Center</span>
          <span>Demo environment · Settings version 2.0</span>
        </div>

      </div>
    </>
  );
}

