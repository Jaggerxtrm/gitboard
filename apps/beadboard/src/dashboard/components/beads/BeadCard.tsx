/**
 * BeadCard - Issue card for Kanban board
 */

import type { BeadIssue } from "../../../types/beads.ts";

interface BeadCardProps {
  issue: BeadIssue;
  onClick?: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  bug: "🐛",
  feature: "✨",
  task: "📝",
  epic: "🎯",
  chore: "🔧",
};

const PRIORITY_COLORS: Record<number, string> = {
  0: "var(--accent-red)",
  1: "var(--accent-orange)",
  2: "var(--text-secondary)",
  3: "var(--text-muted)",
  4: "var(--text-disabled)",
};

const STATUS_COLORS: Record<string, string> = {
  open: "var(--status-open)",
  in_progress: "var(--status-in-progress)",
  blocked: "var(--status-blocked)",
  closed: "var(--status-closed)",
};

export function BeadCard({ issue, onClick }: BeadCardProps) {
  const blockerCount = issue.dependencies.filter(
    (d) => d.dependency_type === "blocked_by" && d.status !== "closed"
  ).length;

  const blocksCount = issue.dependencies.filter(
    (d) => d.dependency_type === "blocks"
  ).length;

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface-secondary)",
        borderRadius: "var(--radius-md)",
        padding: "var(--spacing-sm) var(--spacing-md)",
        border: "1px solid var(--border-subtle)",
        cursor: onClick ? "pointer" : "default",
        transition: "var(--transition)",
      }}
    >
      {/* Header: Type + Priority + ID */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-xs)",
          marginBottom: "var(--spacing-xs)",
        }}
      >
        <span style={{ fontSize: "12px" }}>{TYPE_ICONS[issue.issue_type] || "📋"}</span>
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: PRIORITY_COLORS[issue.priority],
          }}
        >
          P{issue.priority}
        </span>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            marginLeft: "auto",
          }}
        >
          {issue.id}
        </span>
      </div>

      {/* Title */}
      <h4
        style={{
          fontSize: "var(--text-sm)",
          fontWeight: 500,
          color: "var(--text-primary)",
          lineHeight: 1.4,
          marginBottom: "var(--spacing-xs)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {issue.title}
      </h4>

      {/* Footer: Dependencies */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
        }}
      >
        {blockerCount > 0 && (
          <span style={{ color: "var(--accent-red)" }}>
            ⛔{blockerCount}
          </span>
        )}
        {blocksCount > 0 && (
          <span style={{ color: "var(--accent-orange)" }}>
            →{blocksCount}
          </span>
        )}
        {issue.labels.length > 0 && (
          <span style={{ color: "var(--accent-blue)" }}>
            🏷️{issue.labels.length}
          </span>
        )}
      </div>
    </div>
  );
}
