import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot } from "recharts";
import { Activity, AlertTriangle, TrendingUp, IndianRupee, Lightbulb, ShieldCheck, Menu, Home, Building2, GraduationCap, Factory, Network, Gauge } from "lucide-react";
import { Wordmark, Seg } from "./ui.jsx";
import { demo, SITES } from "./demoData.js";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const EMAIL = import.meta.env.VITE_CONTACT_EMAIL;
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

function Preview({ interactive }) {
  const [site, setSite] = useState("home"), [days, setDays] = useState(1), [tariff, setTariff] = useState(null), [open, setOpen] = useState(!interactive);
  const d = useMemo(() => demo(site, days), [site, days]), t = tariff ?? d.tariff, a = d.anomaly;
  const month = (d.kwh / days) * 30 * t;
  return <div className="card pv"><div className="pvb"><i /><i /><i /><span className="pill">Simulated demo data, generated in your browser</span><b style={{ marginLeft: "auto", fontSize: ".8rem" }}>{SITES[site].name}</b></div>
    <div className="pvc">
      {interactive && <div className="ctrl"><Seg value={days} onChange={(v) => { setDays(v); setOpen(false); }} options={[[1, "24 h"], [7, "7 days"], [30, "30 days"]]} />
        <label className="ctrl" style={{ margin: 0 }}>Site <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Demo site">{Object.entries(SITES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></label>
        <label className="ctrl" style={{ margin: 0 }}>Tariff ₹/kWh <input type="number" min="1" max="50" step="0.5" value={t} onChange={(e) => setTariff(Math.max(0.5, +e.target.value || 0.5))} aria-label="Tariff per kWh" /></label></div>}
      <div className="pvs"><div><b>{Math.round(d.pts[d.pts.length - 1].v * (d.hourly ? 1 : 1000 / 24))} W</b><span>{d.hourly ? "Latest hour" : "Avg last day"}</span></div><div><b>{d.kwh.toFixed(1)} kWh</b><span>Over {days === 1 ? "24 h" : days + " days"}</span></div><div><b>{inr(d.kwh * t)}</b><span>Estimated cost</span></div><div><b>{inr(month)}</b><span>Projected month</span></div></div>
      <div className="ch small" role="img" aria-label={`Demo ${d.hourly ? "power in watts" : "daily energy in kilowatt-hours"} chart for ${SITES[site].name}`} style={{ height: interactive ? 240 : 170 }}><ResponsiveContainer><AreaChart data={d.pts}>
        <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--mute)" }} minTickGap={50} /><YAxis width={48} tick={{ fontSize: 11, fill: "var(--mute)" }} unit={" " + d.unit} /><Tooltip formatter={(v) => [v + " " + d.unit, d.hourly ? "Power" : "Energy"]} />
        <Area type="linear" dataKey="v" stroke="var(--acc)" strokeWidth={2} fill="var(--accsoft)" isAnimationActive={false} />{a && <ReferenceDot x={a.label} y={a.v} r={6} fill="var(--bad)" stroke="#fff" />}</AreaChart></ResponsiveContainer></div>
      {a ? <button className="alert" onClick={() => setOpen(!open)} aria-expanded={open}><AlertTriangle size={18} color="var(--warn)" style={{ flex: "none" }} /><span><b>Unusual overnight consumption (example)</b>{open && <><br />Observed {Math.round(a.observed)} W vs expected about {Math.round(a.expected)} W ({Math.round((a.observed / a.expected - 1) * 100)}% above baseline) at {a.label}. Suggested next step: review connected loads and check whether equipment was left running. This is a simulated event, not a fault diagnosis.</>}{!open && <span className="muted"> Select to inspect</span>}</span></button>
        : <p className="muted small" style={{ marginTop: 10 }}>{d.hourly ? "No anomalies in this demo range." : "The 30-day view shows daily totals. Switch to 24 h or 7 days to inspect the example anomaly."}</p>}
    </div></div>;
}

const caps = [[Activity, "Monitor", "Understand voltage, current, power and cumulative energy from supported meter data."], [AlertTriangle, "Detect", "Identify readings that deviate from a learned or configured baseline."], [TrendingUp, "Forecast", "Estimate future energy consumption using historical patterns."],
  [IndianRupee, "Understand costs", "Apply configurable electricity tariffs to estimate consumption costs."], [Lightbulb, "Optimize", "Explore recommendations based on observed usage patterns."], [Gauge, "Verify", "Compare actual consumption with an appropriate baseline before making savings claims."]];
const steps = [["Collect", "Receive energy readings from a supported meter or simulator."], ["Analyze", "Calculate consumption metrics and identify unusual patterns."], ["Predict", "Estimate future usage and potential costs."], ["Act", "Review recommendations and evaluate possible changes."]];
const sols = [[Home, "GridWise Home", "Households", "Understand household energy consumption", "Available in demo"], [Building2, "GridWise Business", "Shops and offices", "Review usage patterns and estimated electricity costs", "Available in demo"],
  [GraduationCap, "GridWise Campus", "Educational institutions", "Analyze energy usage across configured locations", "Planned"], [Factory, "GridWise Industry", "Small industrial facilities", "Monitor supported electrical measurements and investigate unusual usage", "Planned"], [Network, "GridWise Enterprise", "Multi-site organizations", "Centralize analytics across multiple sites", "Planned"]];

export default function Landing() {
  const [m, setM] = useState(false);
  return <div>
    <header className="hnav"><div className="wrap in"><Link to="/" className="logo" aria-label="GridWise AI home"><Wordmark /></Link>
      <nav className={"mid" + (m ? " open" : "")} aria-label="Main">{[["product", "Product"], ["solutions", "Solutions"], ["how", "How it works"], ["security", "Security"], ["resources", "Resources"]].map(([h, l]) => <a key={h} href={"#" + h} onClick={() => setM(false)}>{l}</a>)}</nav>
      <div className="right"><Link to="/login" className="hide">Sign in</Link><Link className="btn" to="/signup">Get started</Link><button className="btn ghost mbtn" aria-expanded={m} aria-label="Toggle menu" onClick={() => setM(!m)}><Menu size={18} /></button></div></div></header>
    <div className="wrap">
      <section className="hero"><div><div className="eyebrow">GRIDWISE AI · ENERGY INTELLIGENCE</div><h1>Know your energy. Make every decision count.</h1>
        <p className="muted" style={{ fontSize: "1.05rem" }}>Monitor electricity consumption, identify unusual usage, forecast demand, and understand energy costs through one intelligent platform.</p>
        <div className="row" style={{ margin: "18px 0 10px" }}><Link className="btn" to="/signup">Get started</Link><a className="btn ghost" href="#product">Explore the platform</a></div>
        <p className="muted small">Start with simulated data. Connect compatible meters as your deployment evolves.</p></div><Preview /></section>
      <section className="s"><div className="trust">{["Designed around measurable energy data", "Transparent assumptions and cost calculations", "Simulation clearly distinguished from live measurements", "Explainable anomaly detection", "Built for incremental hardware integration"].map((t) => <div key={t}>{t}</div>)}</div></section>
      <section className="s" id="product"><div className="sech"><div className="eyebrow">PRODUCT</div><h2>Measure, understand, decide</h2><p className="muted">Each capability builds on recorded readings, with the method and assumptions visible.</p></div>
        <div className="grid">{caps.map(([I, t, d], i) => <div className="card cap" key={t}><span className="n">0{i + 1}</span><div style={{ margin: "8px 0" }}><I color="var(--acc)" size={22} /></div><h2>{t}</h2><p className="muted">{d}</p></div>)}</div></section>
      <section className="s" id="how"><div className="sech"><div className="eyebrow">HOW IT WORKS</div><h2>From readings to decisions</h2></div><div className="steps">{steps.map(([t, d], i) => <div className="step" key={t}><div className="num">{i + 1}</div><h2>{t}</h2><p className="muted">{d}</p></div>)}</div></section>
      <section className="s" id="demo"><div className="sech"><div className="eyebrow">INTERACTIVE PREVIEW</div><h2>Try the dashboard</h2><p className="muted">Everything below is simulated data generated in your browser. Change the range, site and tariff to see the numbers respond. In the real application these values come from the backend.</p></div><Preview interactive /></section>
      <section className="s" id="solutions"><div className="sech"><div className="eyebrow">SOLUTIONS</div><h2>Built to grow with your deployment</h2><p className="muted">Only the single-site experience exists today. Multi-site features are planned.</p></div>
        <div className="grid">{sols.map(([I, n, who, v, s]) => <div className="card" key={n}><I color="var(--acc)" /><h2 style={{ marginTop: 8 }}>{n}</h2><p className="muted small">{who}</p><p>{v}</p><span className={"tag " + (s === "Planned" ? "plan" : "")}>{s}</span></div>)}</div></section>
      <section className="s" id="security"><div className="sech"><div className="eyebrow">SECURITY AND TRANSPARENCY</div><h2><ShieldCheck size={22} style={{ verticalAlign: -3 }} /> What is actually in place</h2></div>
        <div className="grid">{[["Authentication", "Passwords are hashed with bcrypt. Access tokens expire after 8 hours. Sign-in and sign-up are rate limited."], ["Data access", "Every query is scoped to your organization on the server. Hiding a button is never the only protection."], ["Simulated vs live", "Every reading carries a source label. Demo and hardware data are never mixed silently."], ["Secrets", "Signing keys and database credentials are server environment variables, not frontend code."], ["Retention and handling", "Readings are stored until you delete the account in this prototype. A retention policy will be defined before commercial use."]
          , ["Known limits", "This is a prototype. It has no certifications and no independent security audit, and it needs production hardening before real customer data."]].map(([t, d]) => <div className="card" key={t}><h2>{t}</h2><p className="muted">{d}</p></div>)}</div>
        <p className="muted" style={{ marginTop: 14 }}>Contact: {EMAIL ? <a href={"mailto:" + EMAIL}>{EMAIL}</a> : "contact details will be added before launch."}</p></section>
      <section className="s" style={{ textAlign: "center" }}><h2 style={{ fontSize: "clamp(1.6rem,3.5vw,2.3rem)" }}>Make your energy data more useful.</h2><p className="muted">Start exploring your consumption, costs, and energy patterns with GridWise AI.</p>
        <div className="row" style={{ justifyContent: "center" }}><Link className="btn" to="/signup">Get started</Link><a className="btn ghost" href="#demo">Explore the demo</a></div></section>
    </div>
    <footer id="resources"><div className="wrap fgrid"><div><Wordmark /><p className="small" style={{ marginTop: 10 }}>The intelligence layer for every kilowatt-hour.</p></div>
      <div><h3>Platform</h3><a href="#product">Product</a><a href="#solutions">Solutions</a><a href="#how">How it works</a></div>
      <div><h3>Resources</h3><a href={API + "/docs"} target="_blank" rel="noreferrer">API documentation</a><a href="#security">Security</a>{EMAIL ? <a href={"mailto:" + EMAIL}>Contact</a> : <span className="small">Contact: coming soon</span>}</div>
      <div><h3>Legal</h3><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms of service</Link></div></div>
      <div className="wrap small" style={{ marginTop: 18 }}>© GridWise AI. Prototype. Demo data is simulated and is not a customer measurement.</div></footer></div>;
}

export function Legal({ what }) {
  return <div className="wrap"><div className="nav"><Link to="/" className="logo"><Wordmark /></Link></div><div className="card" style={{ maxWidth: 620, margin: "40px auto" }}><h1>{what}</h1>
    <p className="muted">This document has not been published yet. GridWise AI is a prototype, and a reviewed {what.toLowerCase()} covering data handling and retention will be prepared before any commercial launch.</p><Link to="/">Back to home</Link></div></div>;
}
export function NotFound() {
  return <div className="wrap"><div className="card" style={{ maxWidth: 520, margin: "80px auto", textAlign: "center" }}><h1>Page not found</h1><p className="muted">The page you opened does not exist.</p><Link className="btn" to="/">Go home</Link></div></div>;
}
