/**
 * StatusColumn - Kanban column for issues of a specific status
 */

import type { BeadIssue } from "../../../types/beads.ts";
import { BeadCard } from "./BeadCard";

interface StatusColumnProps {
  title: string;
  status: BeadIssue["status"];
  issues: BeadIssue[];
  onIssueClick?: (issue: BeadIssue) => void;
  getAgent?: (issueId: string) => string | null;
  color?: string;
}

const STATUS_CONFIG: Record<BeadIssue["status"], { color: string; icon: string }> = {
  open: { color: "var(--status-open)", icon: "○" },
  in_progress: { color: "var(--accent-blue)", icon: "◐" },
  blocked: { color: "var(--status-blocked)", icon: "●" },
  in_review: { color: "var(--accent-purple)", icon: "◑" },
  closed: { color: "var(--status-closed)", icon: "✓" },
};

export function StatusColumn({ title, status, issues, onIssueClick, getAgent }: StatusColumnProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 280,
        maxWidth: 320,
        background: "var(--surface-secondary)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-xs)",
          padding: "var(--spacing-sm) var(--spacing-md)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span style={{ color: config.color, fontSize: "var(--text-sm)" }}>
          {config.icon}
        </span>
        <h3
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h3>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            marginLeft: "auto",
            background: "var(--surface-tertiary)",
            padding: "2px 8px",
            borderRadius: "var(--radius-pill)",
          }}
        >
          {issues.length}
        </span>
      </div>

      {/* Issue list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--spacing-sm)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--spacing-sm)",
        }}
      >
        {issues.length === 0 ? (
          <div
            style={{
              padding: "var(--spacing-lg)",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "var(--text-sm)",
            }}
          >
            No issues
          </div>
        ) : (
          issues.map((issue) => (
            <BeadCard
              key={issue.id}
              issue={issue}
              onClick={() => onIssueClick?.(issue)}
              agent={getAgent?.(issue.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}