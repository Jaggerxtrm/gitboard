import { useState } from "react";
import { GithubPanel } from "./components/github/GithubPanel.tsx";

type Tab = "github";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "github", label: "GitHub" },
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("github");

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-200 font-sans">
      <header className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-slate-800 bg-slate-900">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mr-4">
          Agent Forge
        </span>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              activeTab === tab.id
                ? "bg-slate-700 text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </header>

      <main className="flex-1 min-h-0">
        {activeTab === "github" && <GithubPanel />}
      </main>
    </div>
  );
}
