import { useState } from "react";
import { RepoIcon, LinkExternalIcon, GitCommitIcon, GitMergeIcon, GitPullRequestIcon } from "@primer/octicons-react";
import type { GithubRepo, RepoStat } from "../../../../src/types/github.ts";
import { ContributionHeatmap } from "./ContributionHeatmap.tsx";
import { EventDetail } from "./EventDetail.tsx";
import type { GithubEvent, GithubCommit, ContributionDay } from "../../../../src/types/github.ts";

interface Props {
  repos: GithubRepo[];
  stats: Record<string, RepoStat>;
  selectedRepos: string[];
  unreadRepos?: Set<string>;
  onSelect: (fullName: string) => void;
  onReset: () => void;
  lastEventAt?: Record<string, string>;
  contributions?: ContributionDay[];
  onDateClick?: (date: string) => void;
  selectedEvent?: GithubEvent | null;
  selectedEventCommits?: GithubCommit[];
}

export function filterOwnRepos(repos: GithubRepo[], lastEventAt: Record<string, string>): GithubRepo[] {
  if (Object.keys(lastEventAt).length === 0) return repos;
  return repos.filter((r) => r.full_name in lastEventAt);
}

export function sortByLastEvent(repos: GithubRepo[], lastEventAt: Record<string, string>): GithubRepo[] {
  return [...repos].sort((a, b) => {
    const ta = lastEventAt[a.full_name] ?? a.last_polled_at ?? "";
    const tb = lastEventAt[b.full_name] ?? b.last_polled_at ?? "";
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return tb > ta ? 1 : -1;
  });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function RepoSidebar({ repos, stats, selectedRepos, unreadRepos = new Set(), onSelect, onReset, lastEventAt = {}, contributions, onDateClick, selectedEvent, selectedEventCommits }: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  let filtered = filterOwnRepos(repos, lastEventAt);
  let sorted = sortByLastEvent(filtered, lastEventAt);

  // Hide zero-activity repos when list exceeds 20
  if (sorted.length > 20) {
    sorted = sorted.filter((r) => {
      const stat = stats[r.full_name];
      return stat && (stat.pushes > 0 || stat.prs_open > 0 || stat.prs_closed > 0);
    });
  }

  const groups = new Map<string, GithubRepo[]>();
  for (const repo of sorted) {
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
      overflow: "hidden",
    }}>
      {/* Scrollable repo list */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
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
              const lastAt = lastEventAt[repo.full_name];

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
                    {lastAt && (
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", flexShrink: 0 }}>
                        {relativeTime(lastAt)}
                      </span>
                    )}
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

      {/* Inline event detail — shown when selectedEvent prop is provided */}
      {selectedEvent !== undefined && (
        <div style={{
          borderTop: "1px solid var(--border-subtle)",
          overflowY: "auto",
          maxHeight: "45%",
          flexShrink: 0,
          fontSize: "11px",
          lineHeight: 1.4,
        }}>
          <EventDetail event={selectedEvent ?? null} commits={selectedEventCommits ?? []} />
        </div>
      )}

      {/* Contribution heatmap pinned at bottom */}
      {contributions !== undefined && (
        <div style={{
          borderTop: "1px solid var(--border-subtle)",
          flexShrink: 0,
          padding: "8px 0",
        }}>
          <ContributionHeatmap contributions={contributions} onDateClick={onDateClick ?? (() => {})} />
        </div>
      )}
    </div>
  );
}
