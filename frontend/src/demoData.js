// Browser-side demo data for the PUBLIC preview only. The signed-in app uses the backend API.
const base = (h) => 0.3 + 0.28 * Math.sin(((h - 6) / 24) * 2 * Math.PI) + (h >= 18 && h <= 22 ? 0.65 : 0) + (h >= 6 && h <= 8 ? 0.3 : 0);
export const SITES = { home: { name: "Demo home", k: 1, tariff: 8 }, office: { name: "Demo small office", k: 3.2, tariff: 9.5 }, campus: { name: "Demo campus block", k: 14, tariff: 7.5 } };

export function demo(siteKey, days) {
  const { k, tariff } = SITES[siteKey]; let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const N = days * 24, hours = [];
  for (let i = 0; i < N; i++) hours.push(base(i % 24) * k * (0.94 + rnd() * 0.12));
  let ai = -1; for (let i = N - 2; i >= 0; i--) if (i % 24 === 2) { ai = i; break; }
  const observed = ai >= 0 ? 1.5 * k : null, expected = ai >= 0 ? base(2) * k : null;
  if (ai >= 0) hours[ai] = observed;
  const kwh = hours.reduce((a, b) => a + b, 0);
  let pts;
  if (days <= 7) pts = hours.map((v, i) => ({ label: days === 1 ? `${String(i).padStart(2, "0")}:00` : `Day ${Math.floor(i / 24) + 1}, ${String(i % 24).padStart(2, "0")}:00`, v: +(v * 1000).toFixed(0), anomaly: i === ai }));
  else pts = Array.from({ length: days }, (_, d) => ({ label: `Day ${d + 1}`, v: +hours.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0).toFixed(2), anomaly: false }));
  return { pts, kwh, tariff, unit: days <= 7 ? "W" : "kWh", hourly: days <= 7, anomaly: ai >= 0 && days <= 7 ? { label: pts[ai].label, observed: observed * 1000, expected: expected * 1000, v: pts[ai].v } : null };
}
