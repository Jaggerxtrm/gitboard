import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GithubPanel } from "../../../../src/dashboard/components/github/GithubPanel.tsx";
import { useGithubStore } from "../../../../src/dashboard/stores/github.ts";

const noop = () => {};

beforeEach(() => {
  const s = useGithubStore.getState();
  s.setEvents([]);
  s.selectEvent(null);
  s.setSelectedEventCommits([]);
  s.setRepos([]);
  s.setContributions([]);
  s.setLoading(false);
  s.setError(null);
  s.resetFilter();
  s.setRepoStats([]);
});

describe("GithubPanel (SSR)", () => {
  it("renders All Activity in repo sidebar", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html).toContain("All Activity");
  });

  it("renders stat labels always present", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html).toContain("Pushes");
    expect(html).toContain("Events");
    expect(html).toContain("Repos");
  });

  it("renders empty timeline message when no events", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html.toLowerCase()).toContain("no events");
  });

  it("renders repo sidebar with All Activity when no repos", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html).toContain("All Activity");
  });

  it("does not render a sliding right detail panel", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html).not.toContain("--detail-width");
  });

  // Heatmap deferred to v0.8.0 — not rendered in GithubPanel
  it("does not render contribution heatmap (deferred to v0.8.0)", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html.toLowerCase()).not.toContain("no contribution data");
  });

  // EventDetail sidebar accordion deferred — event detail lives in ActivityTimeline only
  it("does not render EventDetail placeholder in panel (deferred)", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html.toLowerCase()).not.toContain("select an event");
  });
});
