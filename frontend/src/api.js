import { useEffect, useState, useCallback } from "react";
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const tok = { get: () => localStorage.getItem("gw_token"), set: (t) => localStorage.setItem("gw_token", t), clear: () => localStorage.removeItem("gw_token") };

export async function api(path, opt = {}) {
  const headers = { "Content-Type": "application/json", ...(tok.get() ? { Authorization: "Bearer " + tok.get() } : {}) };
  const r = await fetch(BASE + path, { method: opt.method || "GET", headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
  if (r.status === 401 && tok.get()) { tok.clear(); location.href = "/login"; }
  if (!r.ok) {
    let m = "Something went wrong. Please try again.";
    try { const j = await r.json(); m = typeof j.detail === "string" ? j.detail : j.detail?.[0]?.msg || m; } catch {}
    throw new Error(m);
  }
  return r;
}
export const getJson = async (p) => (await api(p)).json();

export function useGet(path) {
  const [s, set] = useState({ data: null, err: null, loading: true });
  const load = useCallback(() => { set((x) => ({ ...x, loading: true })); getJson(path).then((data) => set({ data, err: null, loading: false })).catch((e) => set({ data: null, err: e.message, loading: false })); }, [path]);
  useEffect(load, [load]);
  return { ...s, reload: load };
}
export const inr = (n) => (n == null ? "n/a" : "₹" + Math.round(n).toLocaleString("en-IN"));
export const hh = (iso) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
