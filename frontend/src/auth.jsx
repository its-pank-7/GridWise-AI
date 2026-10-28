import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { Eye, EyeOff, Check, Circle, ShieldCheck, Activity, AlertTriangle, TrendingUp, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { api, tok } from "./api.js";
import { Wordmark } from "./ui.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const rules = (p) => [["At least 8 characters", p.length >= 8], ["Upper and lower case letters", /[a-z]/.test(p) && /[A-Z]/.test(p)], ["A number", /\d/.test(p)], ["A symbol or 12+ characters", /[^A-Za-z0-9]/.test(p) || p.length >= 12]];
const strength = (p) => rules(p).filter((r) => r[1]).length;
const LEVELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];

function Brand() {
  return <aside className="abrand"><Link to="/" className="logo" aria-label="GridWise AI home"><Wordmark /></Link>
    <div className="abody"><div className="eyebrow" style={{ color: "#7fd8b8" }}>ENERGY INTELLIGENCE</div><h2>The intelligence layer for every kilowatt-hour.</h2>
      <ul className="afeat">{[[Activity, "Monitor power, voltage, current and energy"], [AlertTriangle, "Explainable anomaly detection against your own baseline"], [TrendingUp, "Forecasts with measured error, and transparent cost estimates"], [ShieldCheck, "Your data stays scoped to your organization"]].map(([I, t]) => <li key={t}><I size={18} />{t}</li>)}</ul>
      <div className="amini" aria-label="Example of simulated data"><span className="apill">Simulated example</span><div className="agrid"><div><b>278 W</b><span>Current power</span></div><div><b>7.42 kWh</b><span>Today</span></div><div><b>₹1,420</b><span>Est. month</span></div></div>
        <svg viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="#7fd8b8" strokeWidth="2" points="0,30 15,28 30,24 45,26 60,18 75,22 90,12 105,16 120,8 135,20 150,14 165,22 180,18 200,24" /></svg></div></div>
    <p className="asmall">Prototype. New accounts start with 14 days of clearly labeled demo data.</p></aside>;
}

function Password({ label, value, onChange, autoComplete, error, hint }) {
  const [show, setShow] = useState(false), [caps, setCaps] = useState(false);
  return <label className="fld">{label}<span className="inp"><input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required
    onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState("CapsLock"))} aria-invalid={!!error} /><button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
    {caps && <small className="warnt">Caps Lock is on</small>}{error && <small className="errt" role="alert">{error}</small>}{hint}</label>;
}

function Shell({ children }) { return <div className="auth2"><Brand /><main className="aform"><Link to="/" className="aback"><ArrowLeft size={16} />Back to website</Link><div className="acard">{children}</div></main></div>; }

async function enter(path, body, nav) { const r = await api(path, { method: "POST", body }); tok.set((await r.json()).access_token); nav("/app"); }

export function SignIn() {
  const nav = useNavigate(), [email, setEmail] = useState(localStorage.getItem("gw_email") || ""), [pw, setPw] = useState(""), [rem, setRem] = useState(!!localStorage.getItem("gw_email"));
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [forgot, setForgot] = useState(false), [touched, setTouched] = useState(false);
  if (tok.get()) return <Navigate to="/app" replace />;
  const bad = touched && !EMAIL_RE.test(email);
  async function submit(e) { e.preventDefault(); setTouched(true); if (!EMAIL_RE.test(email)) return; setErr(""); setBusy(true);
    try { if (rem) localStorage.setItem("gw_email", email); else localStorage.removeItem("gw_email"); await enter("/auth/login", { email, password: pw }, nav); } catch (x) { setErr(x.message); } finally { setBusy(false); } }
  return <Shell><h1>Welcome back</h1><p className="muted">Sign in to your GridWise AI workspace.</p>
    <form className="aform-f" onSubmit={submit} noValidate>
      <label className="fld">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} autoComplete="email" required aria-invalid={bad} />{bad && <small className="errt" role="alert">Enter a valid email address.</small>}</label>
      <Password label="Password" value={pw} onChange={setPw} autoComplete="current-password" />
      <div className="arow"><label className="chk"><input type="checkbox" checked={rem} onChange={(e) => setRem(e.target.checked)} />Remember my email</label><button type="button" className="linkbtn" onClick={() => setForgot(!forgot)} aria-expanded={forgot}>Forgot password?</button></div>
      {forgot && <p className="note" role="status">Password reset is not available in this prototype yet. Create a new account to continue exploring.</p>}
      {err && <div className="errbox" role="alert">{err}</div>}
      <button className="btn wide" disabled={busy}>{busy ? <><Loader2 size={16} className="spin" />Signing in</> : "Sign in"}</button></form>
    <p className="aswitch">New to GridWise? <Link to="/signup">Create an account</Link></p></Shell>;
}

export function SignUp() {
  const nav = useNavigate(), [step, setStep] = useState(1), [f, setF] = useState({ name: "", email: "", pw: "", pw2: "", org: "", ok: false });
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [t, setT] = useState({});
  if (tok.get()) return <Navigate to="/app" replace />;
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v })), s = strength(f.pw);
  const e1 = { name: !f.name.trim() ? "Enter your name." : "", email: !EMAIL_RE.test(f.email) ? "Enter a valid email address." : "", pw: f.pw.length < 8 ? "Use at least 8 characters." : "", pw2: f.pw2 !== f.pw ? "Passwords do not match." : "" };
  const ok1 = !Object.values(e1).some(Boolean);
  const next = (e) => { e.preventDefault(); setT({ name: 1, email: 1, pw: 1, pw2: 1 }); if (ok1) setStep(2); };
  async function submit(e) { e.preventDefault(); if (!f.org.trim() || !f.ok) { setT((x) => ({ ...x, org: 1 })); return; } setErr(""); setBusy(true);
    try { await enter("/auth/signup", { email: f.email, password: f.pw, name: f.name.trim(), org_name: f.org.trim() }, nav); } catch (x) { setErr(x.message); } finally { setBusy(false); } }
  async function demo() { setErr(""); setBusy(true); const id = Math.random().toString(36).slice(2, 10);
    try { await enter("/auth/signup", { email: `demo-${id}@gridwise-demo.com`, password: crypto.randomUUID(), name: "Demo User", org_name: "Demo workspace" }, nav); } catch (x) { setErr(x.message); } finally { setBusy(false); } }
  return <Shell><ol className="steps2" aria-label="Sign-up progress"><li className={step >= 1 ? "on" : ""}><span>{step > 1 ? <Check size={14} /> : 1}</span>Account</li><li className={step >= 2 ? "on" : ""}><span>2</span>Workspace</li></ol>
    <h1>{step === 1 ? "Create your account" : "Set up your workspace"}</h1><p className="muted">{step === 1 ? "Start with simulated data. No hardware needed." : "Your workspace holds your sites, devices and data."}</p>
    {step === 1 ? <form className="aform-f" onSubmit={next} noValidate>
      <label className="fld">Full name<input value={f.name} onChange={(e) => set("name")(e.target.value)} onBlur={() => setT({ ...t, name: 1 })} autoComplete="name" maxLength={120} required />{t.name && e1.name && <small className="errt" role="alert">{e1.name}</small>}</label>
      <label className="fld">Work or personal email<input type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} onBlur={() => setT({ ...t, email: 1 })} autoComplete="email" required />{t.email && e1.email && <small className="errt" role="alert">{e1.email}</small>}</label>
      <Password label="Password" value={f.pw} onChange={set("pw")} autoComplete="new-password" error={t.pw && e1.pw}
        hint={f.pw && <div className="meter" aria-live="polite"><div className="bars">{[1, 2, 3, 4].map((i) => <i key={i} className={s >= i ? "l" + s : ""} />)}</div><b>{LEVELS[s]}</b><ul>{rules(f.pw).map(([l, ok]) => <li key={l} className={ok ? "ok" : ""}>{ok ? <Check size={13} /> : <Circle size={13} />}{l}</li>)}</ul><small className="muted">Guidance only: the server requires 8 characters.</small></div>} />
      <Password label="Confirm password" value={f.pw2} onChange={set("pw2")} autoComplete="new-password" error={t.pw2 && e1.pw2} />
      <button className="btn wide">Continue</button>
      <div className="or"><span>or</span></div>
      <button type="button" className="btn ghost wide" onClick={demo} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}Explore a temporary demo workspace</button>
      <small className="muted">The demo creates a throwaway account with simulated data. You cannot sign back in to it after signing out.</small>
      {err && <div className="errbox" role="alert">{err}</div>}</form>
    : <form className="aform-f" onSubmit={submit} noValidate>
      <label className="fld">Organization name<input value={f.org} onChange={(e) => set("org")(e.target.value)} maxLength={120} autoFocus required />{t.org && !f.org.trim() && <small className="errt" role="alert">Enter an organization name.</small>}</label>
      <div className="note"><b>What you will get</b><ul><li>A site and a simulated meter</li><li>14 days of labeled demo readings, including one example anomaly</li><li>All dashboard pages, ready to explore</li></ul></div>
      <label className="chk"><input type="checkbox" checked={f.ok} onChange={(e) => set("ok")(e.target.checked)} />I understand GridWise AI is a prototype and all readings are simulated.</label>
      {t.org && !f.ok && <small className="errt" role="alert">Please confirm to continue.</small>}
      {err && <div className="errbox" role="alert">{err}</div>}
      <div className="arow"><button type="button" className="btn ghost" onClick={() => setStep(1)}>Back</button><button className="btn grow" disabled={busy}>{busy ? <><Loader2 size={16} className="spin" />Creating</> : "Create account"}</button></div></form>}
    <p className="aswitch">Already have an account? <Link to="/login">Sign in</Link></p></Shell>;
}