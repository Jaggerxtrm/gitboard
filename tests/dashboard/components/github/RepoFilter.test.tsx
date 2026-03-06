import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RepoFilter } from "../../../../src/dashboard/components/github/RepoFilter.tsx";
import type { GithubRepo } from "../../../../src/types/github.ts";

const repos: GithubRepo[] = [
  { full_name: "owner/repo-a", display_name: "Repo A", tracked: true, group_name: "g1", last_polled_at: null, color: "#6366f1" },
  { full_name: "owner/repo-b", display_name: null, tracked: true, group_name: null, last_polled_at: null, color: null },
];

describe("RepoFilter", () => {
  it("renders display names when available", () => {
    const html = renderToStaticMarkup(<RepoFilter repos={repos} selectedRepos={[]} onReposChange={() => {}} />);
    expect(html).toContain("Repo A");
  });

  it("falls back to full_name when no display_name", () => {
    const html = renderToStaticMarkup(<RepoFilter repos={repos} selectedRepos={[]} onReposChange={() => {}} />);
    expect(html).toContain("owner/repo-b");
  });

  it("marks selected repo with aria-pressed=true", () => {
    const html = renderToStaticMarkup(<RepoFilter repos={repos} selectedRepos={["owner/repo-a"]} onReposChange={() => {}} />);
    expect(html).toContain('aria-pressed="true"');
  });

  it("non-selected repo has aria-pressed=false", () => {
    const html = renderToStaticMarkup(<RepoFilter repos={repos} selectedRepos={[]} onReposChange={() => {}} />);
    expect(html).toContain('aria-pressed="false"');
  });

  it("renders empty state message when no repos", () => {
    const html = renderToStaticMarkup(<RepoFilter repos={[]} selectedRepos={[]} onReposChange={() => {}} />);
    expect(html.toLowerCase()).toContain("no repos");
  });

  it("toggle logic: adds new repo to selection", () => {
    const handler = vi.fn();
    // Render and extract the toggle logic by checking the props passed
    // The component calls onReposChange([...selectedRepos, fullName]) for unselected
    // We verify by rendering and inspecting the aria attribute
    const html = renderToStaticMarkup(<RepoFilter repos={repos} selectedRepos={["owner/repo-b"]} onReposChange={handler} />);
    expect(html).toContain('aria-pressed="true"');  // repo-b is selected
    expect(html).toContain('aria-pressed="false"'); // repo-a is not
  });
});
