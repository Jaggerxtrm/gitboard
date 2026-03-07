import { useState } from "react";
import { RepoIcon, LinkExternalIcon, GitCommitIcon, GitMergeIcon, GitPullRequestIcon } from "@primer/octicons-react";
import type { GithubRepo, RepoStat } from "../../../../src/types/github.ts";

interface Props {
  repos: GithubRepo[];
  stats: Record<string, RepoStat>;
  selectedRepos: string[];
  unreadRepos?: Set<string>;
  onSelect: (fullName: string) => void;
  onReset: () => void;
}

function sortByRecency(repos: GithubRepo[]): GithubRepo[] {
  return [...repos].sort((a, b) => {
    if (!a.last_polled_at && !b.last_polled_at) return 0;
    if (!a.last_polled_at) return 1;
    if (!b.last_polled_at) return -1;
    return b.last_polled_at > a.last_polled_at ? 1 : -1;
  });
}

export function RepoSidebar({ repos, stats, selectedRepos, unreadRepos = new Set(), onSelect, onReset }: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const groups = new Map<string, GithubRepo[]>();
  for (const repo of sortByRecency(repos)) {
    const key = repo.group_name ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(repo);
  }

  const allActive = selectedRepos.length === 0;

  return (
    <div style={{
      width: "var(--sidebar-width)",
      minWidth: "var(--sidebar-width)",
      background: "var(--surface-secondary)",
      borderRight: "1px solid var(--border-subtle)",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
    }}>
      <button
        aria-pressed={allActive}
        onClick={onReset}
        onMouseEnter={() => setHoveredKey("__all__")}
        onMouseLeave={() => setHoveredKey(null)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          padding: "10px 16px",
          background: allActive ? "var(--surface-tertiary)" : hoveredKey === "__all__" ? "rgba(255,255,255,0.04)" : "transparent",
          border: "none",
          borderLeft: allActive ? "2px solid var(--event-push)" : "2px solid transparent",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: "var(--text-base)",
          textAlign: "left",
          width: "100%",
          transition: "var(--transition-fast)",
        }}
      >
        All Activity
      </button>

      {Array.from(groups.entries()).map(([groupName, groupRepos]) => (
        <div key={groupName}>
          {groupName && (
            <div
              role="heading"
              style={{
                padding: "8px 16px 4px",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                letterSpacing: "0.05em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              {groupName}
            </div>
          )}
          {groupRepos.map((repo) => {
            const stat = stats[repo.full_name];
            const isSelected = selectedRepos.includes(repo.full_name);
            const isUnread = unreadRepos.has(repo.full_name);
            const slug = repo.full_name.split("/")[1];
            const displayName = repo.display_name ?? slug;

            return (
              <button
                key={repo.full_name}
                aria-pressed={isSelected}
                onClick={() => onSelect(repo.full_name)}
                onMouseEnter={() => setHoveredKey(repo.full_name)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "8px 16px",
                  background: isSelected ? "var(--surface-tertiary)" : hoveredKey === repo.full_name ? "rgba(255,255,255,0.04)" : "transparent",
                  border: "none",
                  borderLeft: isSelected ? "2px solid var(--event-push)" : "2px solid transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: "var(--text-base)",
                  textAlign: "left",
                  width: "100%",
                  transition: "var(--transition-fast)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isUnread && (
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: "var(--radius-pill)",
                      background: "var(--accent-blue)",
                      flexShrink: 0,
                    }} />
                  )}
                  <RepoIcon size={14} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName}
                  </span>
                  <a
                    href={`https://github.com/${repo.full_name}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: "var(--text-muted)", lineHeight: 1 }}
                  >
                    <LinkExternalIcon size={12} />
                  </a>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--text-secondary)", paddingLeft: 20 }}>
                  {stat ? (
                    <>
                      {stat.pushes > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <GitCommitIcon size={12} />
                          {stat.pushes}
                        </span>
                      )}
                      {stat.prs_closed > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <GitMergeIcon size={12} />
                          {stat.prs_closed}
                        </span>
                      )}
                      {stat.prs_open > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--event-pr-open)" }}>
                          <GitPullRequestIcon size={12} />
                          {stat.prs_open}
                        </span>
                      )}
                      {stat.pushes === 0 && stat.prs_closed === 0 && stat.prs_open === 0 && (
                        <span style={{ color: "var(--text-muted)" }}>no activity today</span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>no activity today</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
