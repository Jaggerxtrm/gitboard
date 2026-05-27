export const SOURCE_REFRESH_COOLDOWN_MS = 2000;

const LOCALHOST_PREFIXES = ["localhost", "127.0.0.1", "[::1]"];

export type SourceRefreshState = {
  inFlight: Promise<unknown> | null;
  lastCompletedAt: number;
};

export function isLocalhost(host: string): boolean {
  return LOCALHOST_PREFIXES.some((prefix) => host.startsWith(prefix));
}

export function formatSourceDisplayPath(path: string): string {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  if (segments.length <= 2) return path;
  return `…/${segments.slice(-2).join("/")}`;
}

export function createSourceRefreshState(): SourceRefreshState {
  return { inFlight: null, lastCompletedAt: 0 };
}

export function canRefreshSources(now: number, state: SourceRefreshState): { ok: true } | { ok: false; status: 202 | 429; body: Record<string, unknown> } {
  if (state.inFlight) return { ok: false, status: 202, body: { error: "refresh in progress" } };
  const elapsed = now - state.lastCompletedAt;
  if (elapsed < SOURCE_REFRESH_COOLDOWN_MS) {
    return { ok: false, status: 429, body: { error: "refresh cooldown", retry_after_ms: SOURCE_REFRESH_COOLDOWN_MS - elapsed } };
  }
  return { ok: true };
}
