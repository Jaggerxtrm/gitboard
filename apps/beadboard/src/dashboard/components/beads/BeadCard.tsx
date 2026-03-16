/**
 * BeadCard - Card component for displaying a bead issue
 */

import type { BeadIssue } from "../../../types/beads.ts";

interface BeadCardProps {
  issue: BeadIssue;
  onClick?: () => void;
  agent?: string | null;
}

// Type icons
const TYPE_ICONS: Record<BeadIssue["issue_type"], string> = {
  bug: "🐛",
  feature: "✨",
  task: "📋",
  epic: "🎯",
  chore: "🔧",
};

// Priority colors
const PRIORITY_COLORS: Record<BeadIssue["priority"], string> = {
  0: "var(--status-blocked)",
  1: "var(--accent-orange)",
  2: "var(--accent-blue)",
  3: "var(--text-muted)",
  4: "var(--text-muted)",
};

export function BeadCard({ issue, onClick, agent }: BeadCardProps) {
  const blockedBy = issue.dependencies.filter(
    (d) => d.dependency_type === "blocked_by"
  );
  const blocking = issue.dependencies.filter(
    (d) => d.dependency_type === "blocks"
  );

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface-secondary)",
        borderRadius: "var(--radius-md)",
        padding: "var(--spacing-sm) var(--spacing-md)",
        border: "1px solid",
        cursor: onClick ? "pointer" : "default",
        transition: "var(--transition)",
        borderWidth: "var(--border-subtle)",
        borderStyle: "var(--border-subtle)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Header: Type, Priority, ID */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-xs)",
          marginBottom: "var(--spacing-xs)",
        }}
      >
        <span style={{ fontSize: 12 }}>
          {TYPE_ICONS[issue.issue_type]}
        </span>
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: PRIORITY_COLORS[issue.priority],
          }}
        >
          P{issue.priority}
        </span>
        {agent && <AgentBadge agent={agent} />}
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
          overflow: "hidden",
        }}
      >
        {issue.title}
      </h4>

      {/* Footer: Dependencies, Labels */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-sm)",
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
        }}
      >
        {blockedBy.length > 0 && (
          <span title={`${blockedBy.length} blocker(s)`}>
            ⛔{blockedBy.length}
          </span>
        )}
        {blocking.length > 0 && (
          <span title={`Blocks ${blocking.length} issue(s)`}>
            →{blocking.length}
          </span>
        )}
        {issue.labels.length > 0 && (
          <span title={`${issue.labels.length} label(s)`}>
            🏷️{issue.labels.length}
          </span>
        )}
      </div>
    </div>
  );
}

// Agent badge component
function AgentBadge({ agent }: { agent: string }) {
  const colors: Record<string, string> = {
    claude: "#D97706",
    qwen: "#10B981",
    gemini: "#3B82F6",
    gpt: "#6366F1",
  };

  const icons: Record<string, string> = {
    claude: "🧠",
    qwen: "🔮",
    gemini: "✨",
    gpt: "🤖",
  };

  return (
    <span
      style={{
        fontSize: 10,
        padding: "1px 4px",
        background: colors[agent] || "var(--surface-tertiary)",
        color: "white",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {icons[agent] || "🤖"}
    </span>
  );
}