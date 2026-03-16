/**
 * @jest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { BeadCard } from "../../../../src/dashboard/components/beads/BeadCard.tsx";
import type { BeadIssue } from "../../../../src/types/beads.ts";

afterEach(cleanup);

const mockIssue: BeadIssue = {
  id: "forge-001",
  title: "Test issue title",
  description: "Test description",
  status: "open",
  priority: 1,
  issue_type: "feature",
  owner: "user@example.com",
  created_at: "2024-01-01T00:00:00Z",
  created_by: "user@example.com",
  updated_at: "2024-01-01T00:00:00Z",
  project_id: "proj-1",
  dependencies: [],
  labels: [],
  related_ids: [],
};

describe("BeadCard", () => {
  it("renders issue title", () => {
    render(<BeadCard issue={mockIssue} />);
    const titles = screen.getAllByText("Test issue title");
    expect(titles.length).toBeGreaterThan(0);
  });

  it("renders issue ID", () => {
    render(<BeadCard issue={mockIssue} />);
    const ids = screen.getAllByText("forge-001");
    expect(ids.length).toBeGreaterThan(0);
  });

  it("renders priority badge", () => {
    render(<BeadCard issue={mockIssue} />);
    const badges = screen.getAllByText("P1");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("renders type icon", () => {
    render(<BeadCard issue={mockIssue} />);
    const icons = screen.getAllByText("✨");
    expect(icons.length).toBeGreaterThan(0);
  });

  it("renders blocker count when issue is blocked", () => {
    const blockedIssue: BeadIssue = {
      ...mockIssue,
      dependencies: [
        { id: "dep-1", title: "Blocker", status: "open", dependency_type: "blocked_by" },
      ],
    };
    render(<BeadCard issue={blockedIssue} />);
    const blockers = screen.getAllByText(/⛔1/);
    expect(blockers.length).toBeGreaterThan(0);
  });

  it("renders blocks count when issue blocks others", () => {
    const blockingIssue: BeadIssue = {
      ...mockIssue,
      dependencies: [
        { id: "dep-1", title: "Blocks this", status: "open", dependency_type: "blocks" },
        { id: "dep-2", title: "Blocks that", status: "open", dependency_type: "blocks" },
      ],
    };
    render(<BeadCard issue={blockingIssue} />);
    const blocks = screen.getAllByText(/→2/);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("renders label count", () => {
    const labeledIssue: BeadIssue = {
      ...mockIssue,
      labels: ["frontend", "urgent"],
    };
    render(<BeadCard issue={labeledIssue} />);
    const labels = screen.getAllByText(/🏷️2/);
    expect(labels.length).toBeGreaterThan(0);
  });
});
