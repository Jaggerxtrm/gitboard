// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

function setupStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
  });
}

describe("RightSidebar", () => {
  beforeEach(() => {
    setupStorage();
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ jobs: [] }), { status: 200 })) as typeof fetch);
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("renders target, closes on escape, and resizes via pointer", async () => {
    const { useShellStore } = await import("../../../../src/dashboard/stores/shell.ts");
    const { RightSidebar } = await import("../../../../src/dashboard/components/shell/RightSidebar.tsx");

    useShellStore.getState().openSidebar({ beadId: "bead-1", jobId: "job-1" });
    const { getByRole, queryByRole, rerender, container } = render(React.createElement(RightSidebar));

    expect(container.textContent).toContain("bead-1");

    useShellStore.getState().openSidebar({ beadId: "bead-2" });
    rerender(React.createElement(RightSidebar));
    expect(container.textContent).toContain("bead-2");

    fireEvent.keyDown(window, { key: "Escape" });
    rerender(React.createElement(RightSidebar));
    expect(queryByRole("complementary", { name: "Bead details" })).toBeNull();

    useShellStore.getState().openSidebar({ beadId: "bead-3" });
    rerender(React.createElement(RightSidebar));
    const resize = getByRole("separator", { name: "Resize sidebar" });
    fireEvent.pointerDown(resize, { button: 0, pointerId: 1, clientX: 1000 });
    fireEvent.pointerMove(window, { clientX: 900 });
    expect(useShellStore.getState().sidebar.width).toBe(380);

    fireEvent.pointerCancel(window, { pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 800 });
    expect(useShellStore.getState().sidebar.width).toBe(380);
  });
});
