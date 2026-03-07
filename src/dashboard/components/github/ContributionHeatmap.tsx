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

  // Build columns (groups of 7 days) for month label computation
  const DAYS_PER_COL = 7;
  const cols: typeof contributions[] = [];
  for (let i = 0; i < contributions.length; i += DAYS_PER_COL) {
    cols.push(contributions.slice(i, i + DAYS_PER_COL));
  }

  // Compute month label for each column (show when month changes)
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let lastMonth = -1;
  const monthLabels: (string | null)[] = cols.map((col) => {
    if (col.length === 0) return null;
    const month = new Date(col[0].date).getMonth();
    if (month !== lastMonth) {
      lastMonth = month;
      return MONTHS[month];
    }
    return null;
  });

  return (
    <div className="px-4 py-2 overflow-x-auto">
      {/* Month labels row */}
      <div style={{ display: "flex", gap: 3, marginBottom: 2, paddingLeft: 28 }}>
        {monthLabels.map((label, i) => (
          <div
            key={i}
            style={{ width: 14, fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}
          >
            {label ?? ""}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        {/* Day-of-week labels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 28 }}>
          {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
            <div
              key={i}
              style={{ height: 14, fontSize: 11, color: "var(--text-muted)", lineHeight: "14px" }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: "inline-grid", gridTemplateRows: "repeat(7, 14px)", gridAutoFlow: "column", gap: 3 }} role="table">
          {contributions.map((day) => (
            <div
              key={day.date}
              role="cell"
              data-date={day.date}
              data-count={day.count}
              title={`${day.date}: ${day.count} contributions`}
              onClick={() => onDateClick(day.date)}
              style={{ width: 14, height: 14 }}
              className={`rounded-sm cursor-pointer hover:ring-1 hover:ring-indigo-400 transition-all ${countToOpacity(day.count, max)}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

