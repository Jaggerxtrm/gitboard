import { useState } from "react";
import { GithubPanel } from "./components/github/GithubPanel.tsx";

type Tab = "github" | "beads";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "github", label: "GitHub" },
  { id: "beads", label: "Beads" },
];

// Beadboard URL - can be configured via env
const BEADBOARD_URL = import.meta.env.VITE_BEADBOARD_URL || "http://localhost:3001";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("github");

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 20px',
        height: 'var(--topbar-height)',
        background: 'linear-gradient(180deg, var(--surface-secondary), var(--surface-primary))',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          XTRM
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
                transition: 'var(--transition)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <a 
            href="http://localhost:3001" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-tertiary)',
            }}
          >
            Beadboard ↗
          </a>
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>
        {activeTab === "github" && <GithubPanel />}
        {activeTab === "beads" && (
          <iframe 
            src={BEADBOARD_URL}
            style={{ 
              width: '100%', 
              height: '100%', 
              border: 'none',
              background: 'var(--surface-primary)',
            }}
            title="Beadboard"
          />
        )}
      </main>
    </div>
  );
}