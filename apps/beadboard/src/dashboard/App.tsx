import { useState } from "react";

type Tab = "issues" | "closed" | "memories";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "issues", label: "Issues" },
  { id: "closed", label: "Closed" },
  { id: "memories", label: "Memories" },
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("issues");

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
          <div style={{
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
          }}>
            No projects configured
          </div>
        </aside>

        {/* Content area */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          {activeTab === "issues" && (
            <div style={{ color: 'var(--text-secondary)' }}>
              Kanban board will appear here
            </div>
          )}
          {activeTab === "closed" && (
            <div style={{ color: 'var(--text-secondary)' }}>
              Closed issues will appear here
            </div>
          )}
          {activeTab === "memories" && (
            <div style={{ color: 'var(--text-secondary)' }}>
              Memories will appear here
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
