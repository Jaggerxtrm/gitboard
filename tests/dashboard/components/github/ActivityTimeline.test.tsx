import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityTimeline } from "../../../../src/dashboard/components/github/ActivityTimeline.tsx";
import type { GithubEvent } from "../../../../src/types/github.ts";

const events: GithubEvent[] = [
  {
    id: "e1",
    type: "PushEvent",
    repo: "owner/repo-a",
    branch: "main",
    actor: "alice",
    action: null,
    title: "fix: bug fix",
    body: null,
    url: null,
    additions: 10,
    deletions: 2,
    changed_files: 1,
    commit_count: 2,
    created_at: "2026-03-06T15:41:00Z",
  },
  {
    id: "e2",
    type: "PullRequestEvent",
    repo: "owner/repo-b",
    branch: null,
    actor: "bob",
    action: "merged",
    title: "feat: new feature",
    body: null,
    url: null,
    additions: null,
    deletions: null,
    changed_files: null,
    commit_count: null,
    created_at: "2026-03-06T15:38:00Z",
  },
];

describe("ActivityTimeline (SSR)", () => {
  it("renders empty state when no events", () => {
    const html = renderToStaticMarkup(
      <ActivityTimeline events={[]} selectedId={null} onSelect={() => {}} />
    );
    expect(html.toLowerCase()).toContain("no events");
  });

  it("renders event titles in SSR fallback", () => {
    const html = renderToStaticMarkup(
      <ActivityTimeline events={events} selectedId={null} onSelect={() => {}} />
    );
    expect(html).toContain("fix: bug fix");
    expect(html).toContain("feat: new feature");
  });

  it("renders repo names in SSR fallback", () => {
    const html = renderToStaticMarkup(
      <ActivityTimeline events={events} selectedId={null} onSelect={() => {}} />
    );
    expect(html).toContain("owner/repo-a");
    expect(html).toContain("owner/repo-b");
  });

  it("marks selected event row with aria-selected=true", () => {
    const html = renderToStaticMarkup(
      <ActivityTimeline events={events} selectedId="e1" onSelect={() => {}} />
    );
    expect(html).toContain('aria-selected="true"');
  });

  it("non-selected rows have aria-selected=false", () => {
    const html = renderToStaticMarkup(
      <ActivityTimeline events={events} selectedId="e1" onSelect={() => {}} />
    );
    expect(html).toContain('aria-selected="false"');
  });

  it("renders commit count when present", () => {
    const html = renderToStaticMarkup(
      <ActivityTimeline events={events} selectedId={null} onSelect={() => {}} />
    );
    expect(html).toContain("2 commits");
  });
});
