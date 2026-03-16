import { useState } from "react";
import { GithubPanel } from "./components/github/GithubPanel.tsx";

type Tab = "github";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "github", label: "GitHub" },
];

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
          OmniForge
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
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>
        {activeTab === "github" && <GithubPanel />}
      </main>
    </div>
  );
}
