import { useState } from "react";
import { GithubPanel } from "./components/github/GithubPanel.tsx";

type Tab = "github";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "github", label: "GitHub" },
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("github");

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '12px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Agent Forge
        </span>
        <nav style={{ display: 'flex', gap: 4 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '6px 12px',
                fontSize: 13,
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
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>
        {activeTab === "github" && <GithubPanel />}
      </main>
    </div>
  );
}

