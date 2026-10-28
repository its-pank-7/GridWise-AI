import { useState, useEffect } from "react";
import { Zap, Gauge, IndianRupee, AlertTriangle } from "lucide-react";
import { Kpi, Ring, Donut, Seg } from "./ui.jsx";
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

function PowerChart({ hours = 72, dataKey = "power_w", name = "Power (W)" }) {
  const r = useGet(`/readings?hours=${hours}&limit_=2000`);
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
  const s = useGet("/dashboard/summary"), an = useGet("/analytics"); const [auto, setAuto] = useState(true);
  useEffect(() => { if (!auto) return; const id = setInterval(s.reload, 10000); return () => clearInterval(id); }, [auto, s.reload]);
  const d = s.data, load = d && an.data && an.data.peak_kw ? (d.current_power_w / (an.data.peak_kw * 1000)) * 100 : null;
  return <><div className="pagehead"><div><h1>Live Energy</h1><p className="muted">Latest recorded reading. <span className="tag warn">Simulation, not live hardware</span></p></div>
    <label className="switch"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh every 10 s</label></div>
    {s.err ? <div className="err" role="alert">{s.err}</div> : d && <div className="two"><div className="card"><div className="grid"><Stat l="Power" v={d.current_power_w} u="W" /><Stat l="Voltage" v={d.voltage_v} u="V" /><Stat l="Current" v={d.current_a} u="A" /><Stat l="Frequency" v={d.frequency_hz} u="Hz" /></div>
      <p className="muted small" style={{ marginTop: 12 }}>Last data received {d.last_reading ? hh(d.last_reading) : "never"}. Power factor and temperature are shown only when a device supplies them.</p></div>
      <div className="card"><h2>Load vs recorded peak</h2><Ring value={load} label="Load versus peak" sub="% of peak" /></div></div>}
    <div className="card" style={{ marginTop: 16 }}><h2>Power, last 48 hours</h2><PowerChart hours={48} /></div></>;
}

export function Analytics() {
  const r = useGet("/analytics");
  return <><Head t="Analytics" s="Patterns in recorded consumption." /><State r={r}>{(d) => <><div className="grid" style={{ marginBottom: 16 }}><Stat l="Peak hourly demand" v={d.peak_kw} u="kW" /></div>
    <div className="card" style={{ marginBottom: 16 }}><h2>Average load by hour of day</h2><Chart><BarChart data={d.hourly}><CartesianGrid stroke="var(--line)" /><XAxis dataKey="hour" {...axis} /><YAxis {...axis} width={40} /><Tooltip /><Bar dataKey="avg_kw" name="Avg kW" fill="var(--acc)" /></BarChart></Chart></div>
    <div className="card"><h2>Daily energy (kWh)</h2><Chart><BarChart data={d.daily}><CartesianGrid stroke="var(--line)" /><XAxis dataKey="date" {...axis} minTickGap={20} /><YAxis {...axis} width={40} /><Tooltip /><Bar dataKey="kwh" name="kWh" fill="var(--blue)" /></BarChart></Chart></div></>}</State></>;
}

export function Anomalies() {
  const r = useGet("/anomalies"); const [m, setM] = useState("");
  async function inject() { await api("/simulator/anomaly", { method: "POST" }); setM("Demo spike injected."); r.reload(); }
  return <><Head t="Anomalies" s="Hours well above your typical level for that time of day." />
    <div className="row" style={{ marginBottom: 14 }}><button className="btn ghost" onClick={inject}>Inject demo anomaly</button>{m && <span className="ok" role="status">{m}</span>}</div>
    <State r={r}>{(d) => !d.sufficient ? <Empty m="Need at least 3 days of data." /> : !d.items.length ? <Empty m="Nothing unusual found." /> : d.items.map((x) => <div key={x.ts} className={"item " + x.severity}><b>{hh(x.ts)}</b> <Sev s={x.severity} /> <span className="tag plan">score {x.score}</span>
      <p>{x.explanation}</p><p className="muted">Observed {x.observed_kw} kW vs expected {x.expected_kw} kW ({x.diff_pct > 0 ? "+" : ""}{x.diff_pct}%). Method: {x.method}.<br />Next: {x.next_steps}</p></div>)}</State></>;
}

export function Forecasts() {
  const r = useGet("/forecast");
  return <><Head t="Forecasts" s="Next 24 hours." /><State r={r}>{(d) => !d.sufficient ? <Empty m={d.message} /> : <><div className="grid" style={{ marginBottom: 16 }}><Stat l="Expected per day" v={d.daily_kwh} u="kWh" /><Stat l="Projected month" v={d.projected_month_kwh} u="kWh" /><Stat l="Projected month cost" v={inr(d.projected_month_cost_inr)} /></div>
    <div className="card" style={{ marginBottom: 16 }}><h2>Hourly forecast (kW)</h2><Chart><LineChart data={d.points.map((p) => ({ t: hh(p.ts), kw: p.kw, lo: p.lo, hi: p.hi }))}><CartesianGrid stroke="var(--line)" /><XAxis dataKey="t" {...axis} minTickGap={40} /><YAxis {...axis} width={40} /><Tooltip /><Line dataKey="hi" stroke="var(--line)" dot={false} name="High" /><Line dataKey="kw" stroke="var(--acc)" strokeWidth={2} dot={false} name="Forecast" /><Line dataKey="lo" stroke="var(--line)" dot={false} name="Low" /></LineChart></Chart><p className="muted">{d.uncertainty}</p></div>
    <div className="card"><h2>Accuracy on held-out last 24 h</h2><div className="tw"><table><thead><tr><th>Model</th><th>MAE (kW)</th><th>RMSE (kW)</th></tr></thead><tbody>
      <tr><td>Hour-of-day median</td><td>{d.metrics.model.mae}</td><td>{d.metrics.model.rmse}</td></tr><tr><td>Seasonal naive (yesterday)</td><td>{d.metrics.seasonal_naive.mae}</td><td>{d.metrics.seasonal_naive.rmse}</td></tr></tbody></table></div><p className="muted">{d.metrics.note}</p></div></>}</State></>;
}

export function Cost() {
  const r = useGet("/cost");
  return <><Head t="Cost Intelligence" s="Measured energy, estimated cost and hypothetical excess." /><State r={r}>{(d) => <><div className="grid" style={{ marginBottom: 16 }}><Stat l="Tariff" v={"₹" + d.tariff} u="/kWh" /><Stat l="Measured this month" v={d.measured_month_kwh} u="kWh" /><Stat l="Estimated cost so far" v={inr(d.estimated_month_cost_inr)} /><Stat l="Projected month cost" v={inr(d.projected_month_cost_inr)} />
    <Stat l="Excess vs baseline (anomalies)" v={d.excess_kwh_vs_baseline} u="kWh" /><Stat l="Hypothetical excess cost" v={inr(d.excess_cost_inr)} /></div><p className="muted">{d.note} Change the tariff in <Link to="/app/settings">Settings</Link>. No appliance-level breakdown is shown because only aggregate meter data exists.</p></>}</State></>;
}

export function Recs() {
  const r = useGet("/recommendations");
  return <><Head t="Recommendations" s="Rule-based, derived from your data." /><State r={r}>{(d) => !d.length ? <Empty m="No recommendations yet. More data is needed." /> : d.map((x) => <div className="card" key={x.title} style={{ marginBottom: 12 }}><h2>{x.title} <span className="tag">{x.priority}</span> <span className="tag plan">{x.status}</span></h2>
    <p><b>Evidence:</b> {x.evidence}</p><p>{x.explanation}</p><p><b>Action:</b> {x.action}</p><p><b>Estimated savings:</b> {x.estimated_monthly_savings_inr != null ? inr(x.estimated_monthly_savings_inr) + " per month (hypothetical)" : "not calculable"}</p><p className="muted">Assumptions: {x.assumptions}</p></div>)}</State></>;
}

export function Savings() {
  const [res, setRes] = useState(null); const [err, setErr] = useState("");
  async function go(e) { e.preventDefault(); setErr(""); const f = Object.fromEntries(new FormData(e.target));
    try { setRes(await (await api("/savings/simulate", { method: "POST", body: { monthly_bill: +f.bill, reduction_pct: +f.pct } })).json()); } catch (x) { setErr(x.message); } }
  return <><Head t="Savings Simulator" s="Enter assumptions to estimate savings." /><form className="f" onSubmit={go}><label>Current monthly bill (₹)<input name="bill" type="number" min="1" step="any" required defaultValue={1420} /></label>
    <label>Expected reduction (%)<input name="pct" type="number" min="0" max="100" step="any" required defaultValue={10} /></label><button className="btn">Calculate</button></form>
    {err && <p className="err" role="alert">{err}</p>}{res && <div className="card" style={{ marginTop: 16, maxWidth: 520 }} role="status"><div className="grid"><Stat l="Monthly saving" v={inr(res.monthly_inr)} /><Stat l="Annual saving" v={inr(res.annual_inr)} /></div><p className="muted" style={{ marginTop: 10 }}>Formula: {res.formula}. {res.disclaimer}</p></div>}</>;
}

export function Devices() {
  const r = useGet("/devices"); const [key, setKey] = useState(null); const [err, setErr] = useState("");
  async function add(e) { e.preventDefault(); setErr(""); const name = new FormData(e.target).get("name");
    try { setKey((await (await api("/devices", { method: "POST", body: { name } })).json()).api_key); e.target.reset(); r.reload(); } catch (x) { setErr(x.message); } }
  return <><Head t="Devices" s="Registry of meters. Hardware devices post readings to POST /ingest using their key." /><State r={r}>{(d) => <div className="card tw"><table><thead><tr><th>Name</th><th>Source</th><th>Status</th><th>Last seen</th></tr></thead><tbody>
    {d.map((x) => <tr key={x.id}><td>{x.name}</td><td><span className={"tag " + (x.is_simulated ? "warn" : "")}>{x.is_simulated ? "Simulated" : "Hardware"}</span></td><td>{x.status}</td><td>{x.last_seen ? hh(x.last_seen) : "never"}</td></tr>)}</tbody></table></div>}</State>
    <div className="card" style={{ marginTop: 16 }}><h2>Register a hardware device (planned ESP32/PZEM)</h2><form className="f" onSubmit={add}><label>Device name<input name="name" required maxLength={120} /></label><button className="btn">Create device key</button></form>
      {err && <p className="err" role="alert">{err}</p>}{key && <p role="status">Device key (shown once): <code>{key}</code></p>}<p className="muted">No physical device is connected until firmware is written and installed. Mains wiring must be done by a qualified electrician.</p></div></>;
}

export function Reports() {
  const [msg, setMsg] = useState("");
  async function dl() { try { const b = await (await api("/export/readings.csv")).blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "gridwise-readings.csv"; a.click(); setMsg("Download started."); } catch (e) { setMsg(e.message); } }
  const s = useGet("/dashboard/summary");
  return <><Head t="Reports" s="Summary and data export." /><State r={s}>{(d) => <div className="card" style={{ marginBottom: 16 }}><p>Month to date: <b>{d.month_to_date_kwh} kWh</b>, estimated <b>{inr(d.month_to_date_cost)}</b> at ₹{d.tariff}/kWh. Projected month: <b>{inr(d.projected_month_cost)}</b> ({d.projection_basis}).</p></div>}</State>
    <button className="btn" onClick={dl}>Download readings (CSV)</button> <span role="status" className="muted">{msg}</span></>;
}

export function SettingsPage() {
  const me = useGet("/me"); const [tab, setTab] = useState("account"); const [msg, setMsg] = useState(""); const [theme, setTheme] = useState(document.documentElement.dataset.theme);
  async function save(e) { e.preventDefault(); const t = +new FormData(e.target).get("tariff"); try { await api("/settings/tariff", { method: "PUT", body: { tariff: t } }); setMsg("Tariff saved."); me.reload(); } catch (x) { setMsg(x.message); } }
  function pick(t) { document.documentElement.dataset.theme = t; localStorage.setItem("gw_theme", t); setTheme(t); }
  const tabs = [["account", "Account"], ["org", "Organization"], ["tariffs", "Tariffs"], ["appearance", "Appearance"], ["security", "Security"]];
  return <><Head t="Settings" /><div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setMsg(""); }}>{l}</button>)}</div>
    <State r={me}>{(d) => <div className="card" style={{ maxWidth: 640 }}>
      {tab === "account" && <><h2>Account</h2><p>Name: <b>{d.name}</b><br />Email: <b>{d.email}</b><br />Role: <b>{d.role}</b></p><p className="muted small">Profile editing is planned. These details are read-only for now.</p></>}
      {tab === "org" && <><h2>Organization and sites</h2><p>Organization: <b>{d.org}</b><br />Sites: <b>{d.sites.join(", ")}</b><br />Data mode: <b>{d.mode}</b></p><p className="muted small">Adding and editing sites is planned. Multi-site features are not yet available.</p></>}
      {tab === "tariffs" && <><h2>Tariff</h2><form className="f" onSubmit={save} key={d.tariff}><label>Flat tariff (₹ per kWh)<input name="tariff" type="number" min="0.01" max="100" step="0.01" required defaultValue={d.tariff} /></label><button className="btn">Save tariff</button></form><p role="status" className="ok">{msg}</p>
        <p className="muted small">GridWise does not know your provider's actual tariff. Cost figures use this value only, with no taxes, fixed charges or time-of-day rates.</p></>}
      {tab === "appearance" && <><h2>Theme</h2><Seg value={theme} onChange={pick} options={[["light", "Light"], ["dark", "Dark"]]} /><p className="muted small" style={{ marginTop: 10 }}>Saved in this browser only.</p></>}
      {tab === "security" && <><h2>Security</h2><p>Sessions expire after 8 hours. Passwords are hashed with bcrypt. Changing your password and two-factor sign-in are planned and not available yet.</p></>}
    </div>}</State></>;
}
