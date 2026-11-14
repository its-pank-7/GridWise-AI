import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X, Trash2 } from "lucide-react";
import { api, getJson, useGet, hh } from "./api.js";

const Sev = ({ s }) => <span className={"tag " + (s === "high" ? "bad" : s === "medium" ? "warn" : "")}>{s}</span>;

export function AlertWatcher() {
  const nav = useNavigate(), last = useRef(null); const [d, setD] = useState(null), [toast, setToast] = useState(null);
  useEffect(() => { let on = true;
    async function poll() { try { const j = await getJson("/alerts/feed"); if (!on) return; setD(j);
      if (last.current !== null && j.latest_id > last.current) { const a = j.alerts[0]; setToast(a); if ("Notification" in window && Notification.permission === "granted") new Notification("GridWise alert (" + a.severity + ")", { body: a.message }); }
      last.current = j.latest_id; } catch {} }
    poll(); const id = setInterval(poll, 4000); return () => { on = false; clearInterval(id); }; }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 12000); return () => clearTimeout(t); }, [toast]);
  return <><button className="iconbtn bell" onClick={() => nav("/app/anomalies")} aria-label={`Alerts, ${d?.unread || 0} unread`}><Bell size={18} />{d?.unread > 0 && <span className="badge">{d.unread}</span>}</button>
    {toast && <div className="toast" role="alert"><button className="x" aria-label="Dismiss" onClick={() => setToast(null)}><X size={14} /></button><b>New {toast.severity} alert</b><br />{toast.message}<br /><button className="linkbtn" onClick={() => { setToast(null); nav("/app/anomalies"); }}>Review</button></div>}</>;
}

export function AlertsPanel() {
  const [feed, setFeed] = useState(null), [msg, setMsg] = useState(""), [err, setErr] = useState(""); const contacts = useGet("/alerts/contacts"), cfg = useGet("/alerts/settings");
  const load = useCallback(async () => { try { setFeed(await getJson("/alerts/feed")); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); const id = setInterval(load, 4000); return () => clearInterval(id); }, [load]);
  const act = async (id, a) => { await api(`/alerts/${id}/${a}`, { method: "POST" }); load(); };
  async function add(e) { e.preventDefault(); setErr(""); const f = Object.fromEntries(new FormData(e.target)); try { await api("/alerts/contacts", { method: "POST", body: f }); e.target.reset(); setMsg("Recipient added."); contacts.reload(); } catch (x) { setErr(x.message); } }
  async function rem(id) { await api("/alerts/contacts/" + id, { method: "DELETE" }); contacts.reload(); }
  async function save(e) { e.preventDefault(); const f = new FormData(e.target); try { await api("/alerts/settings", { method: "PUT", body: { enabled: f.get("enabled") === "on", escalation_min: +f.get("esc") } }); setMsg("Alert settings saved."); cfg.reload(); } catch (x) { setErr(x.message); } }
  async function test() { try { await api("/alerts/test", { method: "POST" }); setMsg("Test alert raised."); load(); } catch (x) { setErr(x.message); } }
  async function desk() { if ("Notification" in window) setMsg("Desktop notifications: " + (await Notification.requestPermission())); }
  const c = cfg.data;
  return <div className="card" style={{ marginBottom: 20 }}><div className="hd"><div><h2>Instant alerts</h2><p className="muted small" style={{ margin: 0 }}>New unusual readings raise an alert within seconds. Recipients are notified, and if nobody acknowledges it, your head is notified again.</p></div>
    <div className="row"><button className="btn ghost" onClick={desk}>Enable desktop alerts</button><button className="btn" onClick={test}>Send test alert</button></div></div>
    {(msg || err) && <p role="status" className={err ? "err" : "ok"}>{err || msg}</p>}
    {feed && feed.alerts.length ? feed.alerts.slice(0, 6).map((a) => <div key={a.id} className={"item " + a.severity}><div className="hd"><span><Sev s={a.severity} /> <b>{hh(a.created_at)}</b> {a.source === "test" && <span className="tag plan">test</span>} {a.escalated && <span className="tag bad">escalated</span>} <span className="tag plan">{a.status}</span></span>
      <span className="row">{a.status === "new" && <button className="btn ghost sm" onClick={() => act(a.id, "acknowledge")}>Acknowledge</button>}{a.status !== "resolved" && <button className="btn ghost sm" onClick={() => act(a.id, "resolve")}>Resolve</button>}</span></div>{a.message}<div className="muted small">Delivery: {a.log}</div></div>) : <p className="muted">No alerts yet. Switch on a virtual load or send a test alert.</p>}
    <div className="two even" style={{ marginTop: 16, marginBottom: 0 }}>
      <div><h2>Who gets notified</h2>{contacts.data && contacts.data.length ? contacts.data.map((x) => <div className="dsrow" key={x.id}><span><b>{x.name}</b> <span className="tag">{x.role}</span> <span className="muted small">{x.email}, from {x.min_severity}</span></span><button className="iconbtn" aria-label={"Remove " + x.name} onClick={() => rem(x.id)}><Trash2 size={16} /></button></div>) : <p className="muted">No recipients yet. Add the head of your organization.</p>}
        <form className="f" onSubmit={add} style={{ marginTop: 10 }}><label>Name<input name="name" required maxLength={120} /></label><label>Email<input name="email" type="email" required /></label>
          <div className="ctrl"><label>Role<select name="role" defaultValue="head"><option value="head">Head (gets escalations)</option><option value="manager">Manager</option><option value="staff">Staff</option></select></label><label>Alert from<select name="min_severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High only</option></select></label></div><button className="btn">Add recipient</button></form></div>
      <div><h2>Settings</h2>{c && <form className="f" onSubmit={save} key={c.escalation_min + String(c.enabled)}><label className="chk"><input type="checkbox" name="enabled" defaultChecked={c.enabled} />Alerts enabled</label><label>Escalate to head if not acknowledged within (minutes)<input name="esc" type="number" min="1" max="240" defaultValue={c.escalation_min} required /></label><button className="btn">Save settings</button></form>}
        <p className="muted small" style={{ marginTop: 10 }}>{c?.email_configured ? "Email delivery is configured." : "Email delivery is not configured on this server, so alerts appear in the app and in the delivery log only. Set the SMTP_* environment variables to send real emails."}</p></div></div></div>;
}
