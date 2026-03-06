import type { ContributionDay } from "../../../types/github.ts";

interface Props {
  contributions: ContributionDay[];
  onDateClick: (date: string) => void;
}

function countToOpacity(count: number, max: number): string {
  if (count === 0) return "bg-slate-800";
  const pct = count / Math.max(max, 1);
  if (pct < 0.25) return "bg-indigo-900";
  if (pct < 0.5) return "bg-indigo-700";
  if (pct < 0.75) return "bg-indigo-600";
  return "bg-indigo-500";
}

export function ContributionHeatmap({ contributions, onDateClick }: Props) {
  if (contributions.length === 0) {
    return (
      <div className="text-slate-500 text-sm px-4 py-2">No contribution data available.</div>
    );
  }

  const max = Math.max(...contributions.map((d) => d.count));

  return (
    <div className="px-4 py-2 overflow-x-auto">
      <div className="inline-grid grid-rows-7 grid-flow-col gap-0.5" role="table">
        {contributions.map((day) => (
          <div
            key={day.date}
            role="cell"
            data-date={day.date}
            data-count={day.count}
            title={`${day.date}: ${day.count} contributions`}
            onClick={() => onDateClick(day.date)}
            className={`w-3 h-3 rounded-sm cursor-pointer hover:ring-1 hover:ring-indigo-400 transition-all ${countToOpacity(day.count, max)}`}
          />
        ))}
      </div>
    </div>
  );
}
