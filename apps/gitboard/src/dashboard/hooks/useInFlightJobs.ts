import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { SpecialistJob } from "../../server/observability/types.ts";

interface InFlightJobsResponse {
  jobs?: LiveJob[];
  epoch?: Record<string, number>;
}

const POLL_FAST_MS = 0;
const POLL_SLOW_MS = 5000;

export type LiveJob = SpecialistJob & { lastOutput?: string | null };

export interface InFlightGroup {
  repoSlug: string;
  jobs: LiveJob[];
}

export interface UseInFlightJobsState {
  jobs: LiveJob[];
  groups: InFlightGroup[];
  loading: boolean;
  error: string | null;
}

export function useInFlightJobs(): UseInFlightJobsState {
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  const epochRef = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/specialists/jobs/in-flight");
      if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
      const data = (await res.json()) as InFlightJobsResponse;
      if (!aliveRef.current) return;

      const nextEpoch = data.epoch ?? {};
      const changed = hasEpochChanged(epochRef.current, nextEpoch);
      epochRef.current = nextEpoch;
      setJobs(data.jobs ?? []);
      setError(null);
      setLoading(false);
      schedule(load, timerRef, changed ? POLL_FAST_MS : POLL_SLOW_MS);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load in-flight jobs");
      setLoading(false);
      schedule(load, timerRef, POLL_SLOW_MS);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [load]);

  const groups = useMemo(() => groupJobsByRepo(jobs), [jobs]);
  return { jobs, groups, loading, error };
}

function schedule(load: () => Promise<void>, timerRef: MutableRefObject<number | null>, delayMs: number): void {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
  }
  timerRef.current = window.setTimeout(() => {
    void load();
  }, delayMs);
}

function hasEpochChanged(prev: Record<string, number>, next: Record<string, number>): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return true;
  for (const key of nextKeys) {
    if (prev[key] !== next[key]) return true;
  }
  return false;
}

function groupJobsByRepo(jobs: LiveJob[]): InFlightGroup[] {
  const groups = new Map<string, LiveJob[]>();
  for (const job of jobs) {
    const bucket = groups.get(job.repoSlug);
    if (bucket) bucket.push(job);
    else groups.set(job.repoSlug, [job]);
  }
  return [...groups.entries()].map(([repoSlug, groupedJobs]) => ({ repoSlug, jobs: groupedJobs }));
}
