import { RepoIcon, GitBranchIcon, LinkExternalIcon } from "@primer/octicons-react";
import type { GithubEvent, GithubCommit } from "../../../../src/types/github.ts";

interface Props {
  event: GithubEvent | null;
  commits: GithubCommit[];
}

const EVENT_COLORS: Record<string, string> = {
  PushEvent: "var(--event-push)",
  PullRequestEvent: "var(--event-pr-open)",
  IssuesEvent: "var(--event-issue-open)",
  ReleaseEvent: "var(--event-release)",
  CreateEvent: "var(--event-branch)",
  WatchEvent: "var(--event-social)",
};

function getEventColor(type: string): string {
  return EVENT_COLORS[type] ?? "var(--text-muted)";
}

export function EventDetail({ event, commits }: Props) {
  if (!event) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-muted)",
        fontSize: 13,
        padding: 24,
      }}>
        Select an event to see details.
      </div>
    );
  }

  const eventColor = getEventColor(event.type);
  const hasStats = event.additions != null || event.deletions != null;
  const total = (event.additions ?? 0) + (event.deletions ?? 0);
  const addPct = total > 0 ? ((event.additions ?? 0) / total) * 100 : 0;
  const delPct = total > 0 ? ((event.deletions ?? 0) / total) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Panel header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        fontSize: 12,
        color: "var(--text-secondary)",
      }}>
        <RepoIcon size={14} />
        <span>{event.repo}</span>
        {event.branch && (
          <>
            <span style={{ color: "var(--text-muted)" }}>/</span>
            <GitBranchIcon size={14} />
            <span>{event.branch}</span>
          </>
        )}
        {event.url && (
          <a
            href={`https://github.com/${event.repo}`}
            target="_blank"
            rel="noreferrer"
            style={{ marginLeft: "auto", color: "var(--text-muted)" }}
          >
            <LinkExternalIcon size={12} />
          </a>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {/* Event title */}
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
          {event.title ?? event.type}
        </div>

        {/* Diffstat bar */}
        {hasStats && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              height: 6,
              background: "var(--bg-tertiary)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              display: "flex",
              marginBottom: 4,
            }}>
              <div style={{ width: `${addPct}%`, background: "var(--diff-add)" }} />
              <div style={{ width: `${delPct}%`, background: "var(--diff-del)" }} />
            </div>
            <div style={{ display: "flex", gap: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {event.additions != null && (
                <span style={{ color: "var(--diff-add)" }}>+{event.additions}</span>
              )}
              {event.deletions != null && (
                <span style={{ color: "var(--diff-del)" }}>−{event.deletions}</span>
              )}
              {event.changed_files != null && (
                <span style={{ color: "var(--text-muted)" }}>{event.changed_files} files</span>
              )}
            </div>
          </div>
        )}

        {/* Event body */}
        {event.body && (
          <div style={{
            background: "var(--bg-tertiary)",
            borderLeft: `3px solid ${eventColor}`,
            borderRadius: "var(--radius-md)",
            padding: "10px 12px",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 16,
            whiteSpace: "pre-wrap",
          }}>
            {event.body}
          </div>
        )}

        {/* Commits section */}
        {commits.length > 0 && (
          <div>
            <div style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: "var(--text-muted)",
              marginBottom: 8,
            }}>
              Commits
            </div>
            {commits.map((commit) => {
              const fullMsg = commit.message_full ?? commit.message;
              const subject = fullMsg.split("\n")[0];
              const hasBody = fullMsg.includes("\n");
              return (
                <div key={commit.sha} style={{ marginBottom: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <a
                      href={commit.url ?? `https://github.com/${commit.repo}/commit/${commit.sha}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent-blue)" }}
                    >
                      {commit.sha.slice(0, 7)}
                    </a>
                    <span style={{ color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {subject}
                    </span>
                    {hasBody && (
                      <span style={{ color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>▸</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Open on GitHub */}
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              marginTop: 16,
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-secondary)",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            <LinkExternalIcon size={12} />
            View on GitHub
          </a>
        )}
      </div>
    </div>
  );
}
