import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';

/**
 * Loads data from a GET endpoint and exposes { data, loading, error, reload }.
 * Re-fetches whenever `url` or the serialized `params` change. Pass url=null to skip.
 */
export function useApi(url, params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(url, { params: JSON.parse(key) });
      if (id === reqId.current) setData(res.data);
    } catch (err) {
      if (id === reqId.current) setError(errorMessage(err));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [url, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

export function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** useState that remembers its value in this browser (e.g. the last filter you chose). */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(`bh:${key}`);
      return raw !== null ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`bh:${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable: still works, just not remembered */
    }
  }, [key, value]);
  return [value, setValue];
}
