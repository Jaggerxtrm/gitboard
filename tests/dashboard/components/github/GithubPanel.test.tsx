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
});

describe("GithubPanel (SSR)", () => {
  it("renders the panel title", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html.toLowerCase()).toContain("github activity");
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

  it("renders contribution empty state when no data", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html.toLowerCase()).toContain("no contribution data");
  });

  it("renders commit detail placeholder when no event selected", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html.toLowerCase()).toContain("select an event");
  });

  it("renders repo filter empty state when no repos", () => {
    const html = renderToStaticMarkup(<GithubPanel onMount={noop} />);
    expect(html.toLowerCase()).toContain("no repos");
  });
});
