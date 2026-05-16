// Aggregates github repos + beads projects into RepoNode[] for the shell sidebar
// (forge-5w9.3). Runs once on mount; later refinements (live updates) live in forge-f0g/forge-igg.

import { useEffect } from "react";
import { apiClient } from "../lib/client.ts";
import { beadsApi } from "../lib/beads-api.ts";
import { useShellStore } from "../stores/shell.ts";
import type { GithubChips, BeadsChips, RepoNode } from "../../types/shell.ts";
import type { BeadsStats } from "../../types/beads.ts";

const ZERO_GITHUB: GithubChips = { openPRs: 0, commitsToday: 0, openIssues: 0, releases: 0 };
const ZERO_BEADS: BeadsChips = { open: 0, inProgress: 0, blocked: 0, epics: 0 };

function tailName(fullName: string): string {
  const idx = fullName.lastIndexOf("/");
  return idx >= 0 ? fullName.slice(idx + 1) : fullName;
}

function beadsChipsFromStats(stats: BeadsStats | null): BeadsChips {
  if (!stats) return ZERO_BEADS;
  return {
    open: stats.open ?? 0,
    inProgress: stats.in_progress ?? 0,
    blocked: stats.blocked ?? 0,
    epics: stats.by_type?.epic ?? 0,
  };
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function useRepoTree(): void {
  const setRepos = useShellStore((s) => s.setRepos);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [reposRes, statsRes, projects] = await Promise.all([
          apiClient.getRepos().catch(() => ({ data: [] })),
          apiClient.getRepoStats().catch(() => ({ data: [] })),
          beadsApi.listProjects().catch(() => []),
        ]);
        if (cancelled) return;

        const repoStatsByName = new Map(statsRes.data.map((s) => [s.full_name, s]));

        // Per-project beads stats — parallel, tolerate misses.
        const projectStats = await Promise.all(
          projects.map((p) =>
            beadsApi.getStats(p.id).then(
              (s) => [p, s] as const,
              () => [p, null as BeadsStats | null] as const,
            ),
          ),
        );
        if (cancelled) return;

        // Index beads projects by tail name for github match.
        const beadsByTail = new Map<string, { project: typeof projects[number]; stats: BeadsStats | null }>();
        for (const [project, stats] of projectStats) {
          beadsByTail.set(project.name, { project, stats });
        }

        const matched = new Set<string>();
        const nodes: RepoNode[] = [];

        // GitHub repos first; pull in beads side if name matches.
        for (const repo of reposRes.data) {
          const tail = tailName(repo.full_name);
          const beadsSide = beadsByTail.get(tail);
          if (beadsSide) matched.add(tail);
          const stats = repoStatsByName.get(repo.full_name);
          const githubStats: GithubChips = {
            openPRs: stats?.prs_open ?? 0,
            commitsToday: 0,    // populated in forge-f0g live-update work
            openIssues: 0,      // ditto
            releases: 0,        // ditto
          };
          const beadsStats = beadsChipsFromStats(beadsSide?.stats ?? null);
          nodes.push({
            fullName: repo.full_name,
            displayName: repo.display_name ?? repo.full_name,
            lastActivityAt: maxIso(repo.last_polled_at, beadsSide?.project.lastScanned ?? null),
            openBeadsCount: beadsStats.open + beadsStats.inProgress + beadsStats.blocked,
            githubStats,
            beadsStats,
            hasGithub: true,
            hasBeads: Boolean(beadsSide),
          });
        }

        // Beads-only orphans.
        for (const [tail, { project, stats }] of beadsByTail) {
          if (matched.has(tail)) continue;
          const beadsStats = beadsChipsFromStats(stats);
          nodes.push({
            fullName: project.name,
            displayName: project.name,
            lastActivityAt: project.lastScanned,
            openBeadsCount: beadsStats.open + beadsStats.inProgress + beadsStats.blocked,
            githubStats: ZERO_GITHUB,
            beadsStats,
            hasGithub: false,
            hasBeads: true,
          });
        }

        setRepos(nodes);
        if (nodes.length > 0) {
          // AC: log at least one RepoNode with both stats populated.
          console.log("[useRepoTree] aggregated %d repos; sample:", nodes.length, nodes[0]);
        }
      } catch (err) {
        console.warn("[useRepoTree] aggregation failed", err);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [setRepos]);
}
