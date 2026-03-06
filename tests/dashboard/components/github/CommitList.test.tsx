import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommitList } from "../../../../src/dashboard/components/github/CommitList.tsx";
import type { GithubCommit, GithubEvent } from "../../../../src/types/github.ts";

const event: GithubEvent = {
  id: "e1",
  type: "PushEvent",
  repo: "owner/repo",
  branch: "main",
  actor: "alice",
  action: null,
  title: "fix: bug",
  body: null,
  url: "https://github.com/owner/repo",
  additions: 10,
  deletions: 2,
  changed_files: 1,
  commit_count: 2,
  created_at: "2026-03-06T10:00:00Z",
};

const commits: GithubCommit[] = [
  {
    sha: "abc1234567",
    repo: "owner/repo",
    branch: "main",
    author: "alice",
    message: "fix: bug\n\nDetails here",
    url: "https://github.com/owner/repo/commit/abc1234567",
    additions: 5,
    deletions: 1,
    changed_files: 1,
    event_id: "e1",
    committed_at: "2026-03-06T10:00:00Z",
  },
  {
    sha: "def4567890",
    repo: "owner/repo",
    branch: "main",
    author: "alice",
    message: "chore: cleanup",
    url: null,
    additions: 5,
    deletions: 1,
    changed_files: null,
    event_id: "e1",
    committed_at: "2026-03-06T09:55:00Z",
  },
];

describe("CommitList", () => {
  it("shows placeholder when no event selected", () => {
    const html = renderToStaticMarkup(<CommitList event={null} commits={[]} />);
    expect(html.toLowerCase()).toContain("select an event");
  });

  it("shows repo and branch", () => {
    const html = renderToStaticMarkup(<CommitList event={event} commits={commits} />);
    expect(html).toContain("owner/repo");
    expect(html).toContain("main");
  });

  it("renders commit messages (first line only)", () => {
    const html = renderToStaticMarkup(<CommitList event={event} commits={commits} />);
    expect(html).toContain("fix: bug");
    expect(html).toContain("chore: cleanup");
  });

  it("renders shortened SHAs", () => {
    const html = renderToStaticMarkup(<CommitList event={event} commits={commits} />);
    expect(html).toContain("abc1234");
  });

  it("renders addition stats", () => {
    const html = renderToStaticMarkup(<CommitList event={event} commits={commits} />);
    expect(html).toContain("+10");
    expect(html).toContain("-2");
  });

  it("renders link to GitHub when url present", () => {
    const html = renderToStaticMarkup(<CommitList event={event} commits={commits} />);
    expect(html).toContain("github.com");
  });
});
