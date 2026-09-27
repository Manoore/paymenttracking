"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Query = Record<string, string | number | boolean | undefined | null>;

/** Minimal data hook: loads when the path/query changes, exposes reload. */
export function useApi<T>(path: string | null, query?: Query) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `loading` is derived: the request for the current key hasn't settled yet.
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const queryJson = JSON.stringify(query ?? {});
  const key = path ? `${path}${queryJson}#${version}` : null;

  useEffect(() => {
    if (!path || !key) return;
    let cancelled = false;
    api
      .get<T>(path, JSON.parse(queryJson) as Query)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setSettledKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [key, path, queryJson]);

  const reload = useCallback(async () => {
    setVersion((v) => v + 1);
  }, []);

  return { data, error, loading: Boolean(key) && settledKey !== key, reload, setData };
}

export function useSuggestions(field: string) {
  const { data } = useApi<{ values: string[] }>("/suggestions", { field });
  return data?.values ?? [];
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
