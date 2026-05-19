import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import { Sidebar } from "../../../../src/dashboard/components/shell/Sidebar.tsx";
import { useShellStore } from "../../../../src/dashboard/stores/shell.ts";

const now = new Date("2026-05-19T12:00:00.000Z").getTime();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(now);
  useShellStore.setState({
    repos: [],
    selection: { surface: "beads", tab: "triage", repo: null },
    sidebarCollapsed: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Sidebar in-flight rail", () => {
  it("renders 3 running jobs grouped by repo", async () => {
    mockFetchQueue([
      { jobs: jobsFixture, epoch: { alpha: 1, beta: 2 } },
    ]);

    render(<Sidebar />);

    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /bead-/ })).toHaveLength(3);

    const alphaGroup = screen.getByRole("heading", { level: 3, name: "alpha" }).closest("section");
    expect(alphaGroup).not.toBeNull();
    expect(within(alphaGroup as HTMLElement).getAllByRole("link")).toHaveLength(2);

    const betaGroup = screen.getByRole("heading", { level: 3, name: "beta" }).closest("section");
    expect(betaGroup).not.toBeNull();
    expect(within(betaGroup as HTMLElement).getAllByRole("link")).toHaveLength(1);
  });

  it("refetches after epoch change and updates within ~1s", async () => {
    mockFetchQueue([
      { jobs: [], epoch: { alpha: 1 } },
      { jobs: jobsFixture, epoch: { alpha: 2 } },
    ]);

    render(<Sidebar />);
    expect(await screen.findByText("No live specialists.")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(await screen.findByText("bead-1")).toBeInTheDocument();
    expect(screen.queryByText("No live specialists.")).not.toBeInTheDocument();
  });

  it("shows no badge when API returns empty", async () => {
    mockFetchQueue([{ jobs: [], epoch: {} }]);

    render(<Sidebar />);

    expect(await screen.findByText("No live specialists.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

const jobsFixture = [
  {
    repoSlug: "alpha",
    beadId: "bead-1",
    chainId: "chain-1",
    epicId: "epic-1",
    chainKind: "executor",
    status: "running",
    updatedAt: "2026-05-19T11:59:10.000Z",
    lastOutput: "Starting build and syncing dependencies",
  },
  {
    repoSlug: "alpha",
    beadId: "bead-2",
    chainId: "chain-2",
    epicId: "epic-2",
    chainKind: "reviewer",
    status: "starting",
    updatedAt: "2026-05-19T11:58:00.000Z",
    lastOutput: "Reviewing latest panel changes for sidebar rail",
  },
  {
    repoSlug: "beta",
    beadId: "bead-3",
    chainId: "chain-3",
    epicId: "epic-3",
    chainKind: "other",
    status: "running",
    updatedAt: "2026-05-19T11:57:00.000Z",
    lastOutput: "Deploying fix for in-flight rail updates",
  },
] as const;

function mockFetchQueue(responses: ReadonlyArray<{ jobs: readonly unknown[]; epoch: Record<string, number> }>): void {
  let index = 0;
  globalThis.fetch = vi.fn(async () => {
    const current = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => current,
    } as Response;
  }) as unknown as typeof fetch;
}
