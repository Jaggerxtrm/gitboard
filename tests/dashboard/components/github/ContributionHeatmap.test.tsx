import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContributionHeatmap } from "../../../../src/dashboard/components/github/ContributionHeatmap.tsx";
import type { ContributionDay } from "../../../../src/types/github.ts";

const days: ContributionDay[] = [
  { date: "2026-03-06", count: 5 },
  { date: "2026-03-05", count: 2 },
  { date: "2026-03-04", count: 0 },
];

describe("ContributionHeatmap", () => {
  it("renders empty state for no data", () => {
    const html = renderToStaticMarkup(<ContributionHeatmap contributions={[]} onDateClick={() => {}} />);
    expect(html.toLowerCase()).toContain("no contribution data");
  });

  it("renders cells with data-date attributes", () => {
    const html = renderToStaticMarkup(<ContributionHeatmap contributions={days} onDateClick={() => {}} />);
    expect(html).toContain('data-date="2026-03-06"');
    expect(html).toContain('data-date="2026-03-05"');
  });

  it("renders cells with data-count attributes", () => {
    const html = renderToStaticMarkup(<ContributionHeatmap contributions={days} onDateClick={() => {}} />);
    expect(html).toContain('data-count="5"');
    expect(html).toContain('data-count="0"');
  });

  it("renders a cell for each contribution day", () => {
    const html = renderToStaticMarkup(<ContributionHeatmap contributions={days} onDateClick={() => {}} />);
    const cellCount = (html.match(/role="cell"/g) ?? []).length;
    expect(cellCount).toBe(3);
  });

  it("renders month abbreviation when contributions span a month boundary", () => {
    const crossMonthDays: ContributionDay[] = [
      { date: "2026-01-31", count: 3 },
      { date: "2026-02-01", count: 1 },
      { date: "2026-02-02", count: 2 },
      { date: "2026-02-03", count: 0 },
      { date: "2026-02-04", count: 1 },
      { date: "2026-02-05", count: 2 },
      { date: "2026-02-06", count: 3 },
      { date: "2026-02-07", count: 1 },
    ];
    const html = renderToStaticMarkup(
      <ContributionHeatmap contributions={crossMonthDays} onDateClick={() => {}} />
    );
    expect(html).toMatch(/Jan|Feb/);
  });

  it("uses darker style for zero-count cells", () => {
    const html = renderToStaticMarkup(<ContributionHeatmap contributions={days} onDateClick={() => {}} />);
    expect(html).toContain("bg-slate-800");
  });
});
