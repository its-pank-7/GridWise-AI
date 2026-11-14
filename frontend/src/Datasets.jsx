import { useState } from "react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Upload, Download, Trash2 } from "lucide-react";
import { api, useGet, inr, hh } from "./api.js";

const axis = { stroke: "var(--mute)", fontSize: 12 };
const Chart = ({ children }) => <div className="ch"><ResponsiveContainer>{children}</ResponsiveContainer></div>;
const Stat = ({ l, v, u }) => <div className="card stat"><div className="v">{v ?? "n/a"}{u && <small className="muted"> {u}</small>}</div><div className="l">{l}</div></div>;

function sampleCsv() {
  const rows = ["timestamp,energy_kwh"], start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 14);
  for (let i = 0; i < 24 * 14; i++) { const t = new Date(start.getTime() + i * 3600e3), h = t.getHours();
    const kw = 0.3 + 0.28 * Math.sin(((h - 6) / 24) * 2 * Math.PI) + (h >= 18 && h <= 22 ? 0.6 : 0) + (i % 97 === 0 ? 1.4 : 0) + (i % 7) * 0.01;
    rows.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(h).padStart(2, "0")}:00,${kw.toFixed(3)}`); }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); a.download = "gridwise-sample-dataset.csv"; a.click();
}

function Insights({ id }) {
  const r = useGet(`/datasets/${id}/insights`);
  if (r.loading && !r.data) return <p className="muted">Analyzing your data...</p>;
  if (r.err) return <div className="err" role="alert">{r.err}</div>;
  const d = r.data, f = d.forecast;
  return <div style={{ display: "grid", gap: 16 }}>
    <div className="grid"><Stat l="Total energy" v={d.total_kwh} u="kWh" /><Stat l="Average per day" v={d.avg_daily_kwh} u="kWh" /><Stat l="Peak demand" v={d.peak_kw} u="kW" /><Stat l="Estimated cost" v={inr(d.est_cost_inr)} /><Stat l="Projected 30-day cost" v={inr(d.projected_month_inr)} /><Stat l="Anomalies found" v={d.anomaly_count} /></div>
    <p className="muted small">{hh(d.start)} to {hh(d.end)}. Costs use your flat tariff of ₹{d.tariff}/kWh. Peak reading at {hh(d.peak_at)}. Weekday average {d.weekday_daily_kwh} kWh/day, weekend {d.weekend_daily_kwh} kWh/day.</p>
    <div className="card"><h2>Daily consumption (kWh)</h2><Chart><BarChart data={d.daily}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="date" {...axis} minTickGap={30} /><YAxis {...axis} width={44} /><Tooltip /><Bar dataKey="kwh" name="kWh" fill="var(--acc)" /></BarChart></Chart></div>
    <div className="card"><h2>Average load by hour of day (kW)</h2><Chart><AreaChart data={d.hourly_profile}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="hour" {...axis} /><YAxis {...axis} width={44} /><Tooltip /><Area type="linear" dataKey="avg_kw" name="Avg kW" stroke="var(--acc)" fill="var(--accsoft)" /></AreaChart></Chart></div>
    <div className="card"><h2>Forecast, next 24 hours</h2>{f.sufficient ? <><Chart><LineChart data={f.points.map((p) => ({ t: hh(p.ts), kw: p.kw, lo: p.lo, hi: p.hi }))}><CartesianGrid stroke="var(--line)" /><XAxis dataKey="t" {...axis} minTickGap={40} /><YAxis {...axis} width={40} /><Tooltip /><Line dataKey="hi" stroke="var(--line)" dot={false} name="High" /><Line dataKey="kw" stroke="var(--blue)" strokeWidth={2.5} dot={false} name="Forecast" /><Line dataKey="lo" stroke="var(--line)" dot={false} name="Low" /></LineChart></Chart>
      <p><b>{f.daily_kwh} kWh</b> expected per day, about <b>{inr(f.daily_cost_inr)}</b>. Held-out error: MAE {f.metrics.model.mae} kW, RMSE {f.metrics.model.rmse} kW. {f.uncertainty}</p></> : <p className="muted">{f.message}</p>}</div>
    <div className="grid"><div className="card"><h2>Unusual hours</h2>{d.anomalies.length ? d.anomalies.slice(0, 5).map((a) => <div key={a.ts} className={"item " + a.severity}><b>{hh(a.ts)}</b> <span className="tag warn">{a.severity}</span><br />{a.explanation}</div>) : <p className="muted">Nothing unusual found, or fewer than 3 days of data.</p>}</div>
      <div className="card"><h2>Recommendations</h2>{d.recommendations.length ? d.recommendations.map((x) => <div key={x.title} className="item rec"><b>{x.title}</b><br /><span className="muted">{x.evidence}</span></div>) : <p className="muted">None yet from this data.</p>}</div></div>
    <div className="card"><h2>Data quality</h2><p>{d.quality.hours} hourly points, {d.quality.coverage_pct}% coverage, {d.quality.rows_used} rows used.</p>{d.quality.warnings.map((w) => <p key={w} className="muted">Note: {w}</p>)}</div></div>;
}

export default function Datasets() {
  const list = useGet("/datasets"); const [sel, setSel] = useState(null), [file, setFile] = useState(null), [ins, setIns] = useState(null), [map, setMap] = useState({}), [name, setName] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [drag, setDrag] = useState(false);
  async function pick(f) {
    if (!f) return; setErr(""); setIns(null);
    if (f.size > 4e6) return setErr("This file is larger than 4 MB.");
    const text = await f.text(); setFile(text); setName(f.name.replace(/\.[^.]+$/, ""));
    try { const j = await (await api("/datasets/inspect", { method: "POST", body: { csv_text: text } })).json(); setIns(j); setMap({ time_col: j.time_guess, value_col: j.value_guess, unit: j.unit_guess }); } catch (e) { setErr(e.message); setFile(null); }
  }
  async function create() {
    setBusy(true); setErr("");
    try { const j = await (await api("/datasets", { method: "POST", body: { name, csv_text: file, ...map } })).json(); setFile(null); setIns(null); list.reload(); setSel(j.id); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function del(id) { if (!confirm("Delete this dataset?")) return; await api("/datasets/" + id, { method: "DELETE" }); if (sel === id) setSel(null); list.reload(); }
  return <><div className="pagehead"><div><h1>Upload your dataset</h1><p className="muted">Upload electricity readings as CSV and get consumption graphs, forecasts, anomalies, costs and recommendations. Your file is analyzed as given. Nothing is mixed with your meter data.</p></div>
    <button className="btn ghost" onClick={sampleCsv}><Download size={16} />Download sample CSV</button></div>
    <div className="card" style={{ marginBottom: 16 }}>
      <label className={"drop" + (drag ? " on" : "")} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}>
        <Upload size={26} /><b>Drop a CSV here or choose a file</b><span className="muted small">Needs a timestamp column and a consumption column. Up to 4 MB.</span><input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files[0])} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      {ins && <div style={{ marginTop: 16 }}><h2>Confirm your columns</h2><p className="muted small">{ins.rows} rows found. We guessed the columns below. Change them if they are wrong.</p>
        <div className="tw"><table><tbody>{ins.preview.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>
        <div className="ctrl" style={{ marginTop: 12 }}><label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
          <label>Time column<select value={map.time_col} onChange={(e) => setMap({ ...map, time_col: e.target.value })}>{ins.columns.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Value column<select value={map.value_col} onChange={(e) => setMap({ ...map, value_col: e.target.value })}>{ins.columns.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Unit<select value={map.unit} onChange={(e) => setMap({ ...map, unit: e.target.value })}><option value="kwh">kWh per row (energy)</option><option value="kw">kW (power)</option><option value="w">W (power)</option></select></label></div>
        <button className="btn" onClick={create} disabled={busy || !name.trim()}>{busy ? "Analyzing..." : "Analyze dataset"}</button></div>}
    </div>
    <div className="card" style={{ marginBottom: 16 }}><h2>Your datasets</h2>{list.data && list.data.length ? list.data.map((d) => <div className="dsrow" key={d.id}><button className={"linkbtn" + (sel === d.id ? " on" : "")} onClick={() => setSel(d.id)}>{d.name}</button><span className="muted small">{d.rows_used} rows, {d.unit}</span><button className="iconbtn" aria-label={"Delete " + d.name} onClick={() => del(d.id)}><Trash2 size={16} /></button></div>) : <p className="muted">No datasets yet.</p>}</div>
    {sel && <Insights key={sel} id={sel} />}</>;
}
