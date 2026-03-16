import * as Tooltip from "@radix-ui/react-tooltip";
import type { ContributionDay } from "../../../types/github.ts";

interface Props {
  contributions: ContributionDay[];
  onDateClick: (date: string) => void;
}

function countToStyle(count: number, max: number): React.CSSProperties {
  if (count === 0) return {}; // uses bg-slate-800 class
  const pct = count / Math.max(max, 1);
  let opacity: number;
  if (pct < 0.25) opacity = 0.3;
  else if (pct < 0.5) opacity = 0.5;
  else if (pct < 0.75) opacity = 0.75;
  else opacity = 1;
  return { background: `rgba(99, 102, 241, ${opacity})` };
}

function countToClass(count: number): string {
  return count === 0 ? "bg-slate-800" : "";
}

export function ContributionHeatmap({ contributions, onDateClick }: Props) {
  if (contributions.length === 0) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)", padding: "8px 16px" }}>
        No contribution data available.
      </div>
    );
  }

  const max = Math.max(...contributions.map((d) => d.count));

  const DAYS_PER_COL = 7;
  const cols: typeof contributions[] = [];
  for (let i = 0; i < contributions.length; i += DAYS_PER_COL) {
    cols.push(contributions.slice(i, i + DAYS_PER_COL));
  }

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
    <Tooltip.Provider delayDuration={300}>
      <div style={{ padding: "8px 16px", overflowX: "auto" }}>
        {/* Month labels row */}
        <div style={{ display: "flex", gap: 3, marginBottom: 2, paddingLeft: 28 }}>
          {monthLabels.map((label, i) => (
            <div
              key={i}
              style={{ width: 14, fontSize: "var(--text-xs)", color: "var(--text-muted)", whiteSpace: "nowrap" }}
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
                style={{ height: 14, fontSize: "var(--text-xs)", color: "var(--text-muted)", lineHeight: "14px" }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: "inline-grid", gridTemplateRows: "repeat(7, 14px)", gridAutoFlow: "column", gap: 3 }} role="table">
            {contributions.map((day) => (
              <Tooltip.Root key={day.date}>
                <Tooltip.Trigger asChild>
                  <div
                    role="cell"
                    data-date={day.date}
                    data-count={day.count}
                    onClick={() => onDateClick(day.date)}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "var(--radius-xs)",
                      cursor: "pointer",
                      transition: "var(--transition-fast)",
                      ...countToStyle(day.count, max),
                    }}
                    className={countToClass(day.count)}
                  />
                </Tooltip.Trigger>
                <Tooltip.Content
                  style={{
                    background: "var(--surface-quaternary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 8px",
                    fontSize: "var(--text-xs)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-primary)",
                    zIndex: 50,
                  }}
                >
                  {day.date}: {day.count} contribution{day.count !== 1 ? "s" : ""}
                </Tooltip.Content>
              </Tooltip.Root>
            ))}
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
