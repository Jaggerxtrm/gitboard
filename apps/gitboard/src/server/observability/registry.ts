import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { getObservabilityConfig } from "./config.ts";

export interface RepoEntry {
  repoSlug: string;
  repoPath: string;
  dbPath: string;
  mtimeMs: number;
}

const REPO_REFRESH_MS = 10_000;

interface CacheEntry<T> {
  value: T;
  refreshAt: number;
}

let repoCache: CacheEntry<RepoEntry[]> | null = null;

export function listRepos(): RepoEntry[] {
  const cached = repoCache;
  const now = Date.now();
  if (cached && cached.refreshAt > now) return cached.value;

  const roots = getObservabilityConfig().roots;
  if (roots.length === 0) {
    repoCache = { value: [], refreshAt: now + REPO_REFRESH_MS };
    return [];
  }

  const candidates = roots.flatMap(scanRoot);
  candidates.sort((left, right) => left.repoPath.localeCompare(right.repoPath));

  const repos = assignSlugs(candidates);
  repoCache = { value: repos, refreshAt: now + REPO_REFRESH_MS };
  return repos;
}

function scanRoot(root: string): Omit<RepoEntry, "repoSlug">[] {
  const repos: Omit<RepoEntry, "repoSlug">[] = [];

  try {
    const rootStat = statSync(root);
    if (!rootStat.isDirectory()) return repos;
    walk(root, repos);
  } catch {
    console.debug(`[observability] skip unreadable root ${root}`);
    return repos;
  }

  return repos;
}

function walk(dirPath: string, repos: Omit<RepoEntry, "repoSlug">[]): void {
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walk(entryPath, repos);
      continue;
    }

    if (entry.name !== "observability.db") continue;

    try {
      const fileStat = statSync(entryPath);
      const repoPath = resolveRepoRoot(dirPath);
      repos.push({ repoPath, dbPath: entryPath, mtimeMs: fileStat.mtimeMs });
    } catch {
      console.debug(`[observability] skip unreadable file ${entryPath}`);
      continue;
    }
  }
}

function assignSlugs(entries: Omit<RepoEntry, "repoSlug">[]): RepoEntry[] {
  const seen = new Map<string, number>();

  return entries.map((entry) => {
    const baseSlug = slugify(basename(entry.repoPath));
    const count = seen.get(baseSlug) ?? 0;
    seen.set(baseSlug, count + 1);

    const repoSlug = count === 0 ? baseSlug : `${baseSlug}-${shortHash(entry.repoPath)}`;
    return { ...entry, repoSlug };
  });
}

function resolveRepoRoot(dbDir: string): string {
  // observability.db lives at <repo>/.specialists/db/. Strip that suffix to get repo root.
  let current = dbDir;
  for (let i = 0; i < 3; i += 1) {
    const name = basename(current);
    const parent = dirname(current);
    if (parent === current) break;
    if (name === ".specialists") return parent;
    current = parent;
  }
  return dbDir;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}
