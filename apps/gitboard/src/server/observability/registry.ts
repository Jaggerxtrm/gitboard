import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { getObservabilityConfig } from "./config.ts";

export interface RepoEntry {
  repoSlug: string;
  repoPath: string;
  dbPath: string;
  mtimeMs: number;
}

export function listRepos(): RepoEntry[] {
  const roots = getObservabilityConfig().roots;
  if (roots.length === 0) return [];

  const candidates = roots.flatMap(scanRoot);
  candidates.sort((left, right) => left.repoPath.localeCompare(right.repoPath));

  return assignSlugs(candidates);
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
      const repoPath = dirPath;
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

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}
