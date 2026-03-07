// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RepoSidebar } from "../../../../src/dashboard/components/github/RepoSidebar.tsx";

const repos = [
  { full_name: "owner/api", display_name: "api", tracked: true, group_name: "mercury", last_polled_at: null, color: "#6366f1" },
  { full_name: "owner/worker", display_name: null, tracked: true, group_name: "mercury", last_polled_at: null, color: null },
  { full_name: "owner/infra", display_name: "infra", tracked: true, group_name: "infra", last_polled_at: null, color: null },
];

const stats = {
  "owner/api": { full_name: "owner/api", pushes: 12, prs_open: 2, prs_closed: 3 },
};

const noop = () => {};

describe("RepoSidebar", () => {
  it("renders All Activity", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={[]} onSelect={noop} onReset={noop} />
    );
    expect(html).toContain("All Activity");
  });

  it("renders display_name for repos that have it", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={[]} onSelect={noop} onReset={noop} />
    );
    expect(html).toContain("api");
    expect(html).toContain("infra");
  });

  it("falls back to repo slug when display_name is null", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={[]} onSelect={noop} onReset={noop} />
    );
    expect(html).toContain("worker");
  });

  it("renders push count from stats", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={[]} onSelect={noop} onReset={noop} />
    );
    expect(html).toContain("12");
  });

  it("renders prs_open count from stats", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={[]} onSelect={noop} onReset={noop} />
    );
    expect(html).toContain("2");
  });

  it("renders MERCURY and INFRA group headers", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={[]} onSelect={noop} onReset={noop} />
    );
    expect(html.toUpperCase()).toContain("MERCURY");
    expect(html.toUpperCase()).toContain("INFRA");
  });

  it("renders github.com links for each repo", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={[]} onSelect={noop} onReset={noop} />
    );
    expect(html).toContain("https://github.com/owner/api");
    expect(html).toContain("https://github.com/owner/worker");
    expect(html).toContain("https://github.com/owner/infra");
  });

  it("aria-pressed true for selected repo", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={["owner/api"]} onSelect={noop} onReset={noop} />
    );
    // The selected repo button should have aria-pressed="true"
    expect(html).toContain('aria-pressed="true"');
  });

  it("aria-pressed false for unselected repo", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={["owner/api"]} onSelect={noop} onReset={noop} />
    );
    expect(html).toContain('aria-pressed="false"');
  });

  it("shows no activity text for repos with no stats entry", () => {
    const html = renderToStaticMarkup(
      <RepoSidebar repos={repos} stats={stats} selectedRepos={[]} onSelect={noop} onReset={noop} />
    );
    expect(html).toContain("no activity today");
  });
});
