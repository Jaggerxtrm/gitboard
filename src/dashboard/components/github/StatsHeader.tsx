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
    <div className="flex gap-6 px-4 py-2 border-b border-slate-800 text-sm">
      {STATS.map(({ key, label }) => (
        <div key={key} className="flex flex-col items-center">
          <span className="text-slate-400 text-xs">{label}</span>
          <span className="text-slate-100 font-mono font-semibold">
            {summary ? String(summary[key]) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}
