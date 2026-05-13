import { useEffect, useMemo, useState } from "react";
import { GitPullRequestIcon, IssueOpenedIcon, RepoIcon } from "@primer/octicons-react";

export interface ConsoleRepoRecord {
  id: string;
  name: string;
  path?: string;
  github?: {
    fullName: string;
    displayName: string;
    tracked: boolean;
    openPrs: number;
    closedPrs: number;
    openIssues: number;
    lastActivityAt: string | null;
  };
  beads?: {
    projectId: string;
    path: string;
    issueCount: number;
    open: number;
    inProgress: number;
    blocked: number;
    closed: number;
    epics: number;
    p0: number;
  };
  health: "active" | "idle" | "git-only" | "beads-only";
}

interface Props {
  selectedRepoId: string | null;
  onSelect: (repo: ConsoleRepoRecord | null) => void;
}

export function ConsoleRepoRail({ selectedRepoId, onSelect }: Props) {
  const [repos, setRepos] = useState<ConsoleRepoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRepos() {
      setLoading(true);
      try {
        const response = await fetch("/api/console/repos");
        const data = await response.json() as { repos: ConsoleRepoRecord[] };
        if (cancelled) return;
        setRepos(data.repos);
        if (!selectedRepoId && data.repos[0]) onSelect(data.repos[0]);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRepos();
    return () => { cancelled = true; };
  }, []);

  const selectedRepo = useMemo(() => repos.find((repo) => repo.id === selectedRepoId) ?? null, [repos, selectedRepoId]);

  return (
    <aside style={{ width: 238, minWidth: 238, background: "#181818", borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        style={{ height: 32, padding: "0 12px", display: "flex", alignItems: "center", gap: 8, border: 0, borderBottom: "1px solid var(--border-subtle)", borderLeft: selectedRepo ? "2px solid transparent" : "2px solid rgba(142,210,220,0.72)", background: selectedRepo ? "#181818" : "#202020", color: selectedRepo ? "var(--text-muted)" : "var(--text-primary)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}
      >
        <RepoIcon size={13} />
        Repos
        {loading && <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontWeight: 500 }}>scan</span>}
      </button>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0" }}>
        {repos.map((repo) => {
          const selected = repo.id === selectedRepoId;
          const activeBeads = (repo.beads?.open ?? 0) + (repo.beads?.inProgress ?? 0) + (repo.beads?.blocked ?? 0);
          const openPrs = repo.github?.openPrs ?? 0;
          const openIssues = repo.github?.openIssues ?? 0;
          return (
            <button
              key={repo.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(repo)}
              onMouseEnter={() => setHoveredId(repo.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ width: "100%", display: "flex", flexDirection: "column", gap: 5, padding: "8px 12px", border: 0, borderLeft: selected ? "2px solid rgba(142,210,220,0.78)" : "2px solid transparent", background: selected ? "#202020" : hoveredId === repo.id ? "#1d1d1d" : "transparent", color: "var(--text-primary)", cursor: selected ? "default" : "pointer", textAlign: "left" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: repo.health === "active" ? "rgba(142,210,220,0.85)" : "rgba(255,255,255,0.22)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: 650 }}>{repo.name}</span>
                {repo.beads && <span style={{ color: "#a371f7", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em" }}>BD</span>}
                {repo.github && <span style={{ color: "#8ed2dc", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em" }}>GH</span>}
              </div>
              <div style={{ display: "flex", gap: 8, paddingLeft: 13, color: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 3, color: openPrs > 0 ? "#8ed2dc" : "var(--text-muted)" }}><GitPullRequestIcon size={11} />{openPrs}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 3, color: openIssues > 0 ? "#d29922" : "var(--text-muted)" }}><IssueOpenedIcon size={11} />{openIssues}</span>
                <span style={{ color: activeBeads > 0 ? "#cdb8ff" : "var(--text-muted)" }}>bd {activeBeads}</span>
                {(repo.beads?.blocked ?? 0) > 0 && <span style={{ color: "#d1847f" }}>blk {repo.beads?.blocked}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
