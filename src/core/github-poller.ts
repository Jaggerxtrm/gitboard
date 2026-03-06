import type { Database } from "bun:sqlite";
import { insertEvent, insertCommit, upsertRepo, updateRepo } from "./github-store.ts";
import type { GithubEvent, GithubCommit } from "./github-store.ts";

export interface RawGithubCommit {
  sha: string;
  message: string;
  author: { name: string };
  url: string;
}

export interface RawGithubEvent {
  id: string;
  type: string;
  repo: { name: string };
  actor: { login: string };
  created_at: string;
  payload: Record<string, unknown>;
}

export interface PollerOptions {
  intervalMs?: number;
  backfillPages?: number;
}

export function getGithubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const result = Bun.spawnSync(["gh", "auth", "token"]);
  if (result.exitCode === 0) return result.stdout.toString().trim();
  throw new Error("No GitHub token found. Run `gh auth login` or set GITHUB_TOKEN.");
}

export function transformEvent(raw: RawGithubEvent): GithubEvent {
  const payload = raw.payload;
  const repo = raw.repo.name;
  const actor = raw.actor.login;

  let branch: string | null = null;
  let action: string | null = null;
  let title: string | null = null;
  let body: string | null = null;
  let url: string | null = null;
  let additions: number | null = null;
  let deletions: number | null = null;
  let changed_files: number | null = null;
  let commit_count: number | null = null;

  if (payload.action && typeof payload.action === "string") {
    action = payload.action;
  }

  switch (raw.type) {
    case "PushEvent": {
      const ref = payload.ref as string | undefined;
      branch = ref ? ref.replace("refs/heads/", "") : null;
      const commits = payload.commits as RawGithubCommit[] | undefined;
      commit_count = (payload.size as number | undefined) ?? commits?.length ?? 0;
      title = commits?.[0]?.message?.split("\n")[0] ?? null;
      break;
    }
    case "PullRequestEvent": {
      const pr = payload.pull_request as Record<string, unknown> | undefined;
      if (pr) {
        title = (pr.title as string | undefined) ?? null;
        body = (pr.body as string | undefined) ?? null;
        url = (pr.html_url as string | undefined) ?? null;
        additions = (pr.additions as number | undefined) ?? null;
        deletions = (pr.deletions as number | undefined) ?? null;
        changed_files = (pr.changed_files as number | undefined) ?? null;
      }
      break;
    }
    case "IssueCommentEvent":
    case "IssueEvent": {
      const issue = payload.issue as Record<string, unknown> | undefined;
      if (issue) {
        title = (issue.title as string | undefined) ?? null;
        url = (issue.html_url as string | undefined) ?? null;
      }
      break;
    }
    case "PullRequestReviewEvent": {
      const pr = payload.pull_request as Record<string, unknown> | undefined;
      if (pr) {
        title = (pr.title as string | undefined) ?? null;
        url = (pr.html_url as string | undefined) ?? null;
      }
      break;
    }
    case "CreateEvent": {
      const ref_type = payload.ref_type as string | undefined;
      const ref = payload.ref as string | undefined;
      if (ref_type === "branch") branch = ref ?? null;
      title = ref ? `Created ${ref_type}: ${ref}` : `Created ${ref_type}`;
      break;
    }
    case "ReleaseEvent": {
      const release = payload.release as Record<string, unknown> | undefined;
      if (release) {
        title = (release.name as string | undefined) ?? (release.tag_name as string | undefined) ?? null;
        url = (release.html_url as string | undefined) ?? null;
      }
      break;
    }
  }

  return {
    id: raw.id,
    type: raw.type,
    repo,
    branch,
    actor,
    action,
    title,
    body,
    url,
    additions,
    deletions,
    changed_files,
    commit_count,
    created_at: raw.created_at,
  };
}

export function transformCommits(raw: RawGithubEvent): GithubCommit[] {
  if (raw.type !== "PushEvent") return [];

  const payload = raw.payload;
  const commits = payload.commits as RawGithubCommit[] | undefined;
  if (!commits || commits.length === 0) return [];

  const ref = payload.ref as string | undefined;
  const branch = ref ? ref.replace("refs/heads/", "") : null;
  const repo = raw.repo.name;

  return commits.map((c) => ({
    sha: c.sha,
    repo,
    branch,
    author: c.author.name,
    message: c.message,
    url: c.url.replace("api.github.com/repos", "github.com").replace("/commits/", "/commit/"),
    additions: null,
    deletions: null,
    changed_files: null,
    event_id: raw.id,
    committed_at: raw.created_at,
  }));
}

export class GithubPoller {
  private db: Database;
  private token: string;
  private intervalMs: number;
  private backfillPages: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(db: Database, token: string, options: PollerOptions = {}) {
    this.db = db;
    this.token = token;
    this.intervalMs = options.intervalMs ?? 5 * 60 * 1000;
    this.backfillPages = options.backfillPages ?? 3;
  }

  async ingestEvents(rawEvents: RawGithubEvent[]): Promise<void> {
    for (const raw of rawEvents) {
      const event = transformEvent(raw);
      insertEvent(this.db, event);
      const commits = transformCommits(raw);
      for (const commit of commits) {
        insertCommit(this.db, commit);
      }
    }
  }

  async pollRepo(repoFullName: string): Promise<void> {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agent-forge/0.1.0",
    };

    const url = `https://api.github.com/repos/${repoFullName}/events?per_page=100`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const remaining = response.headers.get("X-RateLimit-Remaining");
      if (remaining && parseInt(remaining) < 50) {
        console.warn(`[github-poller] Rate limit low: ${remaining} requests remaining`);
      }
      throw new Error(`GitHub API error ${response.status} for ${repoFullName}`);
    }

    const remaining = response.headers.get("X-RateLimit-Remaining");
    const limit = response.headers.get("X-RateLimit-Limit");
    if (remaining && limit) {
      const ratio = parseInt(remaining) / parseInt(limit);
      if (ratio < 0.1) {
        console.warn(`[github-poller] Rate limit at ${Math.round(ratio * 100)}% — backing off`);
        await Bun.sleep(60_000);
      }
    }

    const events: RawGithubEvent[] = await response.json();
    await this.ingestEvents(events);

    updateRepo(this.db, repoFullName, { last_polled_at: new Date().toISOString() });
  }

  async backfill(repoFullName: string): Promise<void> {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agent-forge/0.1.0",
    };

    for (let page = 1; page <= this.backfillPages; page++) {
      const url = `https://api.github.com/repos/${repoFullName}/events?per_page=100&page=${page}`;
      const response = await fetch(url, { headers });
      if (!response.ok) break;
      const events: RawGithubEvent[] = await response.json();
      if (events.length === 0) break;
      await this.ingestEvents(events);
    }
  }

  start(repos: string[]): void {
    if (this.timer) return;
    console.log(`[github-poller] Starting poll loop, interval=${this.intervalMs}ms, repos=${repos.length}`);
    this.timer = setInterval(async () => {
      for (const repo of repos) {
        try {
          await this.pollRepo(repo);
        } catch (err) {
          console.error(`[github-poller] Error polling ${repo}:`, err);
        }
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[github-poller] Stopped.");
    }
  }
}

// Entry point for direct execution: bun run src/core/github-poller.ts
if (import.meta.main) {
  const token = getGithubToken();
  const dbPath = process.env.AGENT_FORGE_DB ?? `${process.env.HOME}/.agent-forge/state.db`;

  // Import at runtime to avoid circular issues when running as script
  const { createDatabase } = await import("./store.ts");
  const { getRepos } = await import("./github-store.ts");

  const db = createDatabase(dbPath);
  const repos = getRepos(db)
    .filter((r) => r.tracked)
    .map((r) => r.full_name);

  if (repos.length === 0) {
    console.log("[github-poller] No tracked repos found. Add repos via the API or CLI.");
    process.exit(0);
  }

  const poller = new GithubPoller(db, token, { intervalMs: 5 * 60 * 1000 });

  console.log("[github-poller] Running backfill for tracked repos...");
  for (const repo of repos) {
    await poller.backfill(repo);
  }

  poller.start(repos);
  console.log("[github-poller] Poll loop running. Ctrl+C to stop.");

  process.on("SIGINT", () => {
    poller.stop();
    db.close();
    process.exit(0);
  });
}
