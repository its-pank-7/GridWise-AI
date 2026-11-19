
import { useEffect, useState, useCallback } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const tok = {
  get: () => localStorage.getItem("gw_token"),
  set: (t) => localStorage.setItem("gw_token", t),
  clear: () => localStorage.removeItem("gw_token"),
};

export async function api(path, opt = {}) {
  const token = tok.get();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
    ...(opt.headers || {}),
  };

  const response = await fetch(BASE + path, {
    method: opt.method || "GET",
    headers,
    body: opt.body !== undefined
      ? JSON.stringify(opt.body)
      : undefined,
  });

  if (response.status === 401 && token) {
    tok.clear();
    window.location.href = "/login";
  }

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";

    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : data.detail?.[0]?.msg || message;
    } catch {}

    throw new Error(message);
  }

  return response;
}

export const getJson = async (path) => {
  return (await api(path)).json();
};

export function useGet(path) {
  const [state, setState] = useState({
    data: null,
    err: null,
    loading: true,
  });

  const load = useCallback(() => {
    setState((previous) => ({ ...previous, loading: true }));

    getJson(path)
      .then((data) => setState({
        data,
        err: null,
        loading: false,
      }))
      .catch((error) => setState({
        data: null,
        err: error.message,
        loading: false,
      }));
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export const inr = (n) =>
  n == null
    ? "n/a"
    : "₹" + Math.round(n).toLocaleString("en-IN");

export const hh = (iso) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
