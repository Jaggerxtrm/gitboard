/**
 * KanbanBoard - 4-column Kanban layout for bead issues
 */

import type { BeadIssue } from "../../../types/beads.ts";
import { StatusColumn } from "./StatusColumn.tsx";

interface KanbanBoardProps {
  issues: BeadIssue[];
  onIssueClick?: (issue: BeadIssue) => void;
}

const COLUMNS: Array<{ status: BeadIssue["status"]; title: string }> = [
  { status: "open", title: "Open" },
  { status: "in_progress", title: "In Progress" },
  { status: "blocked", title: "Blocked" },
  { status: "closed", title: "Closed" },
];

export function KanbanBoard({ issues, onIssueClick }: KanbanBoardProps) {
  // Group issues by status
  const issuesByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.status] = issues.filter((i) => i.status === col.status);
    return acc;
  }, {} as Record<BeadIssue["status"], BeadIssue[]>);

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--spacing-md)",
        height: "100%",
        overflowX: "auto",
        padding: "var(--spacing-sm)",
      }}
    >
      {COLUMNS.map((col) => (
        <StatusColumn
          key={col.status}
          title={col.title}
          status={col.status}
          issues={issuesByStatus[col.status]}
          onIssueClick={onIssueClick}
        />
      ))}
    </div>
  );
}
