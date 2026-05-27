import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { SourcesPanel } from "../../src/dashboard/components/settings/SourcesPanel.tsx";

type SourceRow = {
  source_key: string;
  kind: string;
  display_path: string;
  origin: string;
  status: string;
};

describe("SourcesPanel e2e flow", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;
  const originalHTMLElement = globalThis.HTMLElement;
  const originalSVGElement = globalThis.SVGElement;
  const originalNode = globalThis.Node;
  const originalEvent = globalThis.Event;
  const originalMouseEvent = globalThis.MouseEvent;
  const originalKeyboardEvent = globalThis.KeyboardEvent;
  const originalCustomEvent = globalThis.CustomEvent;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const originalSyntaxError = globalThis.SyntaxError;
  let sources: SourceRow[];
  let refreshCount: number;

  const restoreGlobals = () => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.navigator = originalNavigator;
    globalThis.HTMLElement = originalHTMLElement;
    globalThis.SVGElement = originalSVGElement;
    globalThis.Node = originalNode;
    globalThis.Event = originalEvent;
    globalThis.MouseEvent = originalMouseEvent;
    globalThis.KeyboardEvent = originalKeyboardEvent;
    globalThis.CustomEvent = originalCustomEvent;
    globalThis.getComputedStyle = originalGetComputedStyle;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    globalThis.SyntaxError = originalSyntaxError;
  };

  beforeEach(() => {
    const window = new Window();
    Object.assign(window, { SyntaxError: originalSyntaxError, event: { type: "message" } });
    Object.assign(globalThis, {
      window,
      document: window.document as unknown as Document,
      navigator: window.navigator,
      HTMLElement: window.HTMLElement,
      SVGElement: window.SVGElement,
      Node: window.Node,
      Event: window.Event,
      MouseEvent: window.MouseEvent,
      KeyboardEvent: window.KeyboardEvent,
      CustomEvent: window.CustomEvent,
      getComputedStyle: window.getComputedStyle.bind(window),
      requestAnimationFrame: window.requestAnimationFrame.bind(window),
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
      SyntaxError: originalSyntaxError,
    });
    sources = [];
    refreshCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/sources" && method === "GET") {
        return Response.json({ sources });
      }

      if (url === "/api/sources/pin" && method === "POST") {
        expect(method).toBe("POST");
        expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
        const body = JSON.parse(String(init?.body ?? "{}")) as { path?: string; kind?: string };
        expect(body).toEqual({ path: "/workspace/project", kind: "beads" });
        const sourceKey = `${body.kind ?? "beads"}:${body.path ?? ""}`;
        sources = sources.filter((source) => source.source_key !== sourceKey).concat({
          source_key: sourceKey,
          kind: body.kind ?? "beads",
          display_path: body.path ?? "",
          origin: "manual",
          status: "active",
        });
        return Response.json({ source_key: sourceKey, kind: body.kind ?? "beads", display_path: body.path ?? "" });
      }

      if (url.startsWith("/api/sources/pin/") && method === "DELETE") {
        expect(method).toBe("DELETE");
        const sourceKey = decodeURIComponent(url.slice("/api/sources/pin/".length));
        expect(sourceKey).toBe("beads:/workspace/project");
        sources = sources.filter((source) => source.source_key !== sourceKey);
        return Response.json({ source_key: sourceKey, status: "deleted" });
      }

      if (url === "/api/sources/refresh" && method === "POST") {
        expect(method).toBe("POST");
        refreshCount += 1;
        sources = sources.map((source) => source.source_key === "beads:/workspace/project" ? { ...source, status: refreshCount === 1 ? "missing" : "active" } : source);
        return Response.json({ refreshed: sources.length, sources });
      }

      throw new Error(`unexpected request ${method} ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreGlobals();
    vi.restoreAllMocks();
  });

  it("pins, refreshes, and removes source from settings panel", async () => {
    const view = render(createElement(SourcesPanel));
    const { getByRole, getByText, queryByText } = within(view.container);

    await waitFor(() => expect(queryByText("/workspace/project")).toBeNull());

    await act(async () => {
      fireEvent.change(getByRole("textbox"), { target: { value: "/workspace/project" } });
    });
    await waitFor(() => expect((getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(getByRole("button", { name: "Add" }));

    await waitFor(() => expect(queryByText("beads:/workspace/project")).not.toBeNull());
    expect(getByText(/manual · active/i)).toBeDefined();

    fireEvent.click(getByRole("button", { name: "Refresh sources" }));
    await waitFor(() => expect(getByText(/manual · missing/i)).toBeDefined());

    fireEvent.click(getByRole("button", { name: "Refresh sources" }));
    await waitFor(() => expect(getByText(/manual · active/i)).toBeDefined());

    fireEvent.click(getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(queryByText("beads:/workspace/project")).toBeNull());
  });
});
