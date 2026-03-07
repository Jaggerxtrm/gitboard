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
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 0,
      padding: "8px 24px",
      background: "var(--surface-secondary)",
      borderBottom: "1px solid var(--border-subtle)",
      flexShrink: 0,
    }}>
      {STATS.map(({ key, label }, i) => (
        <div key={key} style={{ display: "flex", alignItems: "center" }}>
          {i > 0 && (
            <span style={{ margin: "0 var(--spacing-xl)", color: "var(--text-muted)" }}>·</span>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              {label}
            </span>
            <span style={{ fontSize: "var(--text-xl)", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
              {summary ? String(summary[key]) : "—"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
