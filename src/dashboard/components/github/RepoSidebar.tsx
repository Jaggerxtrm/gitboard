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

export function RepoSidebar({ repos, stats, selectedRepos, unreadRepos = new Set(), onSelect, onReset }: Props) {
  const groups = new Map<string, GithubRepo[]>();
  for (const repo of repos) {
    const key = repo.group_name ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(repo);
  }

  return (
    <div style={{
      width: 220,
      minWidth: 220,
      background: "var(--bg-secondary)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
    }}>
      <button
        aria-pressed={selectedRepos.length === 0}
        onClick={onReset}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: selectedRepos.length === 0 ? "var(--bg-tertiary)" : "transparent",
          border: "none",
          borderLeft: selectedRepos.length === 0 ? "2px solid var(--event-push)" : "2px solid transparent",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontSize: 13,
          textAlign: "left",
          width: "100%",
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
                padding: "8px 12px 4px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.5px",
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
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "8px 12px",
                  background: isSelected ? "var(--bg-tertiary)" : "transparent",
                  border: "none",
                  borderLeft: isSelected ? "2px solid var(--event-push)" : "2px solid transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 13,
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isUnread && (
                    <span style={{
                      width: 3,
                      height: 3,
                      borderRadius: "50%",
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

                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)", paddingLeft: 20 }}>
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
