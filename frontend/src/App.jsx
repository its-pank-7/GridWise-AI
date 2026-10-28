import { Routes, Route, Navigate, Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { Zap, LayoutDashboard, Activity, BarChart3, AlertTriangle, TrendingUp, IndianRupee, Lightbulb, Calculator, Cpu, FileText, Settings as Cog, Menu, LogOut, Sun, Moon } from "lucide-react";
import { tok, api, useGet } from "./api.js";
import Landing, { Legal, NotFound } from "./Landing.jsx";
import { Wordmark } from "./ui.jsx";
import { SignIn, SignUp } from "./auth.jsx";
import * as P from "./pages.jsx";

const Logo = () => <Link to="/" className="logo" aria-label="GridWise AI home"><Wordmark /></Link>;

const groups = [["Overview", [["", "Overview", LayoutDashboard], ["live", "Live Energy", Activity], ["analytics", "Analytics", BarChart3]]],
  ["Intelligence", [["anomalies", "Anomalies", AlertTriangle], ["forecasts", "Forecasts", TrendingUp], ["cost", "Cost Intelligence", IndianRupee], ["recommendations", "Recommendations", Lightbulb], ["simulator", "Savings Simulator", Calculator]]],
  ["Management", [["devices", "Devices", Cpu], ["reports", "Reports", FileText], ["settings", "Settings", Cog]]]];
const titles = Object.fromEntries(groups.flatMap(([, g]) => g.map(([p, l]) => [p, l])));

function Shell() {
  const nav = useNavigate(); const loc = useLocation(); const [open, setOpen] = useState(false); const me = useGet("/me");
  const [theme, setTheme] = useState(document.documentElement.dataset.theme); const sm = useGet("/dashboard/summary");
  if (!tok.get()) return <Navigate to="/login" replace />;
  const out = () => { tok.clear(); nav("/"); };
  const flip = () => { const t = theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; localStorage.setItem("gw_theme", t); setTheme(t); };
  const title = titles[loc.pathname.replace(/^\/app\/?/, "")] || "Dashboard";
  const initials = (me.data?.name || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return <div className="shell">
    <aside className={"side" + (open ? " open" : "")}><div className="brand"><Logo /></div>
      <nav aria-label="Application">{groups.map(([g, list]) => <div key={g}><div className="grp">{g}</div>{list.map(([p, l, I]) => <NavLink key={p} end={p === ""} to={"/app/" + p} onClick={() => setOpen(false)}><I />{l}</NavLink>)}</div>)}</nav>
      <div className="sidefoot"><div className="mode"><span className="dot" />Demo mode: simulated data</div><button className="signout" onClick={out}><LogOut size={16} />Sign out</button></div></aside>
    <div className="content"><header className="topbar"><button className="btn ghost menu" aria-expanded={open} aria-label="Toggle menu" onClick={() => setOpen(!open)}><Menu size={18} /></button>
      <div><div className="crumb">GridWise AI / <b>{title}</b></div><div className="ttl">{title}</div></div><div className="tools"><span className="pill" title="All readings are simulated"><span className="dot" />Demo mode: simulated</span>{sm.data?.last_reading && <span className="upd">Latest reading {new Date(sm.data.last_reading).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</span>}{me.data && <span className="upd">Site: {me.data.sites[0]}</span>}<button className="iconbtn" onClick={flip} aria-label="Toggle light or dark theme">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        <div className="user"><span className="avatar" aria-hidden="true">{initials}</span><span className="uname">{me.data?.name || ""}<small>{me.data?.org || ""}</small></span></div></div></header>
      <main className="main"><Outlet /></main></div></div>;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<SignIn />} /><Route path="/signup" element={<SignUp />} />
    <Route path="/app" element={<Shell />}>
      <Route index element={<P.Overview />} /><Route path="live" element={<P.Live />} /><Route path="analytics" element={<P.Analytics />} />
      <Route path="anomalies" element={<P.Anomalies />} /><Route path="forecasts" element={<P.Forecasts />} /><Route path="cost" element={<P.Cost />} />
      <Route path="recommendations" element={<P.Recs />} /><Route path="simulator" element={<P.Savings />} /><Route path="devices" element={<P.Devices />} />
      <Route path="reports" element={<P.Reports />} /><Route path="settings" element={<P.SettingsPage />} />
    </Route>
    <Route path="/privacy" element={<Legal what="Privacy policy" />} /><Route path="/terms" element={<Legal what="Terms of service" />} /><Route path="*" element={<NotFound />} />
  </Routes>;
}