import { useCallback, useEffect, useRef, useState } from "react";

export type DashboardResourceState<TData> = {
  data: TData | null;
  loading: boolean;
  error: string | null;
};

export type DashboardResourceOptions<TData> = {
  key: string | null;
  cacheTtlMs: number;
  pollMs?: number;
  staleEmptyRetryMs?: number;
  isEmpty?: (data: TData) => boolean;
  fetcher: (key: string, options: { refresh: boolean; signal: AbortSignal }) => Promise<TData>;
};

type CacheEntry<TData> = {
  data: TData;
  fetchedAt: number;
  expiresAt: number;
};

type Subscriber = () => void;

const cache = new Map<string, CacheEntry<unknown>>();
const subscribers = new Map<string, Set<Subscriber>>();
const invalidateTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();

export function readDashboardResource<TData>(key: string | null): TData | null {
  if (!key) return null;
  return (cache.get(key)?.data as TData | undefined) ?? null;
}

export function invalidateDashboardResource(key: string): void {
  if (typeof window === "undefined") return;
  if (invalidateTimers.has(key)) return;
  invalidateTimers.set(key, window.setTimeout(() => {
    invalidateTimers.delete(key);
    cache.delete(key);
    notifySubscribers(key);
  }, 1500));
}

export function applyDashboardResourceDelta<TData>(key: string, updater: (current: TData) => TData | null): TData | null {
  const current = readDashboardResource<TData>(key);
  if (!current) return null;
  const next = updater(current);
  if (!next) return null;
  const now = Date.now();
  cache.set(key, { data: next, fetchedAt: now, expiresAt: now + 10_000 });
  notifySubscribers(key);
  return next;
}

export function useDashboardResource<TData>(options: DashboardResourceOptions<TData>): DashboardResourceState<TData> & { refresh: (options?: { force?: boolean; refresh?: boolean }) => Promise<void> } {
  const { key, cacheTtlMs, pollMs, staleEmptyRetryMs, isEmpty, fetcher } = options;
  const [state, setState] = useState<DashboardResourceState<TData>>(() => ({ data: readDashboardResource<TData>(key), loading: key !== null && !readDashboardResource<TData>(key), error: null }));
  const requestSeq = useRef(0);
  const pollTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const staleTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const staleRetryUsed = useRef(false);
  const visibleRef = useRef(typeof document === "undefined" ? true : document.visibilityState === "visible");

  const clearTimer = useCallback((timer: ReturnType<typeof window.setTimeout> | null) => {
    if (timer !== null) window.clearTimeout(timer);
  }, []);

  const schedulePoll = useCallback((refresh: () => Promise<void>) => {
    clearTimer(pollTimer.current);
    pollTimer.current = null;
    if (!pollMs || !key || !visibleRef.current) return;
    pollTimer.current = window.setTimeout(() => {
      void refresh({ force: true, refresh: true });
    }, pollMs);
  }, [clearTimer, key, pollMs]);

  const scheduleStaleRetry = useCallback((refresh: () => Promise<void>) => {
    if (!staleEmptyRetryMs || staleRetryUsed.current || staleTimer.current !== null) return;
    staleRetryUsed.current = true;
    staleTimer.current = window.setTimeout(() => {
      staleTimer.current = null;
      void refresh({ force: true, refresh: true });
    }, staleEmptyRetryMs);
  }, [staleEmptyRetryMs]);

  const refresh = useCallback(async (options: { force?: boolean; refresh?: boolean } = {}) => {
    if (!key || typeof window === "undefined") {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const cached = readDashboardResource<TData>(key);
    if (cached) setState((current) => ({ ...current, data: cached, error: null, loading: false }));
    if (cached && !options.force && !options.refresh && isFresh(key)) return;
    if (!cached) setState((current) => ({ ...current, loading: true, error: null }));

    const seq = ++requestSeq.current;
    const controller = new AbortController();
    try {
      const data = await fetcher(key, { refresh: options.refresh ?? false, signal: controller.signal });
      if (seq !== requestSeq.current) return;
      const now = Date.now();
      cache.set(key, { data, fetchedAt: now, expiresAt: now + cacheTtlMs });
      setState({ data, loading: false, error: null });
      schedulePoll(refresh);
      if (isEmpty?.(data)) scheduleStaleRetry(refresh);
      else {
        staleRetryUsed.current = false;
        clearTimer(staleTimer.current);
        staleTimer.current = null;
      }
    } catch (error) {
      if (seq !== requestSeq.current) return;
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error), data: cached ?? current.data }));
      schedulePoll(refresh);
    }
  }, [cacheTtlMs, clearTimer, fetcher, isEmpty, key, schedulePoll, scheduleStaleRetry]);

  useEffect(() => {
    if (!key) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const cached = readDashboardResource<TData>(key);
    setState({ data: cached, loading: !cached, error: null });
    const subscriber = () => { void refresh({ force: true, refresh: true }); };
    registerSubscriber(key, subscriber);
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh({ force: true, refresh: true }); };
    const onVisibility = () => {
      visibleRef.current = document.visibilityState === "visible";
      if (visibleRef.current) void refresh({ force: true, refresh: true });
      else clearTimer(pollTimer.current);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unregisterSubscriber(key, subscriber);
      clearTimer(pollTimer.current);
      clearTimer(staleTimer.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clearTimer, key, refresh]);

  return { ...state, refresh };
}

function registerSubscriber(key: string, subscriber: Subscriber): void {
  const set = subscribers.get(key) ?? new Set<Subscriber>();
  set.add(subscriber);
  subscribers.set(key, set);
}

function unregisterSubscriber(key: string, subscriber: Subscriber): void {
  const set = subscribers.get(key);
  if (!set) return;
  set.delete(subscriber);
  if (set.size === 0) subscribers.delete(key);
}

function notifySubscribers(key: string): void {
  for (const subscriber of subscribers.get(key) ?? []) subscriber();
}

function isFresh(key: string): boolean {
  const entry = cache.get(key);
  return !!entry && entry.expiresAt > Date.now();
}
