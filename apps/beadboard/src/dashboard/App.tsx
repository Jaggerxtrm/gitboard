import { useState, useEffect } from "react";
import { KanbanBoard } from "./components/beads/index.tsx";
import { useBeadsStore } from "./stores/beads.ts";
import type { BeadIssue } from "../types/beads.ts";

type Tab = "issues" | "closed" | "memories";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "issues", label: "Issues" },
  { id: "closed", label: "Closed" },
  { id: "memories", label: "Memories" },
];

// Mock data for development
const MOCK_ISSUES: BeadIssue[] = [
  {
    id: "forge-001",
    title: "Implement project scanner",
    description: "Scan for .beads directories",
    status: "closed",
    priority: 1,
    issue_type: "feature",
    owner: "user@example.com",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    created_by: "user@example.com",
    updated_at: new Date().toISOString(),
    project_id: "xtrm",
    dependencies: [],
    labels: ["core"],
    related_ids: [],
  },
  {
    id: "forge-002",
    title: "Build Kanban board UI",
    description: "Create the 4-column layout",
    status: "in_progress",
    priority: 1,
    issue_type: "task",
    owner: "user@example.com",
    created_at: new Date(Date.now() - 3600000).toISOString(),
    created_by: "user@example.com",
    updated_at: new Date().toISOString(),
    project_id: "xtrm",
    dependencies: [
      { id: "forge-001", title: "Implement project scanner", status: "closed", dependency_type: "blocked_by" },
    ],
    labels: ["ui"],
    related_ids: [],
  },
  {
    id: "forge-003",
    title: "Add WebSocket support",
    description: "Real-time updates",
    status: "open",
    priority: 2,
    issue_type: "feature",
    owner: "user@example.com",
    created_at: new Date().toISOString(),
    created_by: "user@example.com",
    updated_at: new Date().toISOString(),
    project_id: "xtrm",
    dependencies: [],
    labels: ["realtime"],
    related_ids: [],
  },
  {
    id: "forge-004",
    title: "Fix memory panel scroll",
    description: "Panel not scrolling properly",
    status: "blocked",
    priority: 0,
    issue_type: "bug",
    owner: "user@example.com",
    created_at: new Date().toISOString(),
    created_by: "user@example.com",
    updated_at: new Date().toISOString(),
    project_id: "xtrm",
    dependencies: [
      { id: "forge-002", title: "Build Kanban board UI", status: "in_progress", dependency_type: "blocked_by" },
    ],
    labels: ["bug", "ui"],
    related_ids: [],
  },
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("issues");
  const { issues, setIssues, selectIssue, selectedIssue } = useBeadsStore();

  // Load mock data on mount
  useEffect(() => {
    setIssues(MOCK_ISSUES);
  }, [setIssues]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--surface-primary)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-ui)'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 20px',
        height: 'var(--topbar-height)',
        background: 'var(--surface-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase'
        }}>
          Beadboard
        </span>
        <nav style={{ display: 'flex', gap: 4, height: '100%', alignItems: 'stretch' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0 12px',
                fontSize: 'var(--text-base)',
                fontWeight: 500,
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Sidebar */}
        <aside style={{
          width: 'var(--sidebar-width)',
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--surface-secondary)',
          padding: 16,
        }}>
          <h3 style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginBottom: 12,
          }}>
            Projects
          </h3>
          <div
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-tertiary)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
            }}
          >
            xtrm
          </div>
        </aside>

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {activeTab === "issues" && (
            <KanbanBoard
              issues={issues}
              onIssueClick={(issue) => selectIssue(issue)}
            />
          )}
          {activeTab === "closed" && (
            <div style={{
              padding: 16,
              color: 'var(--text-secondary)',
              overflow: 'auto',
              height: '100%',
            }}>
              <h2 style={{ marginBottom: 16, color: 'var(--text-primary)' }}>Closed Issues</h2>
              {issues.filter(i => i.status === 'closed').map(issue => (
                <div
                  key={issue.id}
                  style={{
                    padding: 'var(--spacing-md)',
                    background: 'var(--surface-secondary)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--spacing-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs', color: 'var(--text-muted)' }}>{issue.id}</div>
                  <div style={{ fontWeight: 500 }}>{issue.title}</div>
                </div>
              ))}
            </div>
          )}
          {activeTab === "memories" && (
            <div style={{
              padding: 16,
              color: 'var(--text-secondary)',
              overflow: 'auto',
              height: '100%',
            }}>
              <h2 style={{ marginBottom: 16, color: 'var(--text-primary)' }}>Memories</h2>
              <p>No memories stored. Use <code style={{
                background: 'var(--surface-tertiary)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
              }}>bd remember "insight"</code> to add one.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
