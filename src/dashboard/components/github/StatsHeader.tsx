import type { Summary } from "../../../types/github.ts";

interface Props {
  summary: Summary | null;
}

const STATS: Array<{ key: keyof Summary; label: string }> = [
  { key: "events", label: "Events" },
  { key: "pushes", label: "Pushes" },
  { key: "prs", label: "PRs" },
  { key: "commits", label: "Commits" },
  { key: "repos", label: "Repos" },
];

export function StatsHeader({ summary }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", padding: "8px 20px" }}>
      {STATS.map(({ key, label }, i) => (
        <div key={key} style={{ display: "flex", alignItems: "center" }}>
          {i > 0 && (
            <span style={{ margin: "0 16px", color: "var(--text-muted)" }}>·</span>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>{label}</span>
            <span style={{ fontSize: 18, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
              {summary ? String(summary[key]) : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}


