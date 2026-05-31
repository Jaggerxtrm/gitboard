/** @vitest-environment happy-dom */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as logger from "../../../../src/core/logger.ts";

const emitSpy = vi.spyOn(logger, "emit");

describe("BeadActivityPane", () => {
  beforeEach(() => {
    emitSpy.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mounts running stream, collapses done feed, and expands with telemetry", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("bead_id=")) {
        return new Response(JSON.stringify({ jobs: [
          { jobId: "job-running", repoSlug: "repo-a", beadId: "bead-1", chainId: "chain-1", epicId: null, chainKind: "executor", status: "running", updatedAt: "2026-01-01T00:00:00.000Z", specialist: "exec", lastOutput: null, turns: null, tools: null, model: null },
          { jobId: "job-done", repoSlug: "repo-a", beadId: "bead-1", chainId: "chain-1", epicId: null, chainKind: "reviewer", status: "done", updatedAt: "2026-01-01T00:00:00.000Z", specialist: "rev", lastOutput: null, turns: null, tools: null, model: null },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ text: "# result", content_type: "text/markdown" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { BeadActivityPane } = await import("../../../../src/dashboard/components/specialists/BeadActivityPane.tsx");
    render(React.createElement(BeadActivityPane, { beadId: "bead-1" }));

    await waitFor(() => expect(document.querySelectorAll(".terminal-stream")).toHaveLength(1));
    expect(screen.getByText("▸ show feed")).toBeTruthy();

    fireEvent.click(screen.getByText("▸ show feed"));
    await waitFor(() => expect(document.querySelectorAll(".terminal-stream")).toHaveLength(2));
    expect(document.querySelectorAll(".terminal-stream")).toHaveLength(2);
  });
});
