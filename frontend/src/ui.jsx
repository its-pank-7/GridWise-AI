import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Tooltip } from "recharts";

export const Spark = ({ data, color = "var(--acc)" }) => (
  <div className="spark"><ResponsiveContainer><AreaChart data={data.map((v, i) => ({ i, v }))}><Area dataKey="v" stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
);

export function Kpi({ icon: I, label, value, unit, sub, data, tone = "var(--acc)" }) {
  return <div className="card kpi"><div className="kpi-top"><span className="ico" style={{ "--t": tone }}><I size={18} /></span><span className="l">{label}</span></div>
    <div className="v">{value ?? "n/a"}{unit && <small>{unit}</small>}</div>{sub && <div className="sub">{sub}</div>}{data && data.length > 1 && <Spark data={data} color={tone} />}</div>;
}

export function Ring({ value, label, sub }) {
  const v = Math.max(0, Math.min(100, value ?? 0)), r = 52, c = 2 * Math.PI * r;
  const color = v >= 75 ? "var(--ok)" : v >= 50 ? "var(--warn)" : "var(--bad)";
  return <div className="ring"><svg viewBox="0 0 130 130" role="img" aria-label={`${label}: ${Math.round(v)} out of 100`}><circle cx="65" cy="65" r={r} fill="none" stroke="var(--line)" strokeWidth="11" />
    <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 65 65)" />
    <text x="65" y="63" textAnchor="middle" className="rv">{Math.round(v)}</text><text x="65" y="82" textAnchor="middle" className="rs">{sub || "/ 100"}</text></svg></div>;
}

export function Donut({ data }) {
  const cols = ["#6366f1", "#1f9d85", "#3b82c4", "#e0a030"];
  return <div className="donut"><div className="dchart"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">{data.map((d, i) => <Cell key={d.name} fill={cols[i % 4]} />)}</Pie><Tooltip formatter={(v) => v + "%"} /></PieChart></ResponsiveContainer></div>
    <ul className="legend">{data.map((d, i) => <li key={d.name}><i style={{ background: cols[i % 4] }} />{d.name} <b>{d.value}%</b></li>)}</ul></div>;
}

export const Seg = ({ value, onChange, options }) => (
  <div className="seg" role="group">{options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>
);

export const Mark = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--brand)" />
    <path d="M8 8h16M8 16h16M8 24h16M8 8v16M16 8v16M24 8v16" stroke="#fff" strokeWidth="1.6" opacity=".8" fill="none" />
    <g fill="#fff"><circle cx="8" cy="8" r="2" /><circle cx="24" cy="8" r="2" /><circle cx="8" cy="24" r="2" /><circle cx="24" cy="24" r="2" /></g><circle cx="16" cy="16" r="3.6" fill="#D99A32" /></svg>
);
export const Wordmark = () => <><Mark /><span className="wm">GridWise<span> AI</span></span></>;
