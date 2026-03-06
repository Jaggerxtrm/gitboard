import type { Database } from "bun:sqlite";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParams = any;

export interface GithubEvent {
  id: string;
  type: string;
  repo: string;
  branch: string | null;
  actor: string;
  action: string | null;
  title: string | null;
  body: string | null;
  url: string | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  commit_count: number | null;
  created_at: string;
}

export interface GithubCommit {
  sha: string;
  repo: string;
  branch: string | null;
  author: string;
  message: string;
  url: string | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  event_id: string | null;
  committed_at: string;
}

export interface GithubRepo {
  full_name: string;
  display_name: string | null;
  tracked: boolean;
  group_name: string | null;
  last_polled_at: string | null;
  color: string | null;
}

export interface EventFilters {
  repos?: string[];
  types?: string[];
  branch?: string;
  from?: string;
  to?: string;
  search?: string;
  group?: string;
  limit?: number;
  offset?: number;
}

export interface CommitFilters {
  repo?: string;
  event_id?: string;
  from?: string;
  limit?: number;
  offset?: number;
}

export interface ContributionDay {
  date: string;
  count: number;
}

export interface Summary {
  events: number;
  commits: number;
  repos: number;
  pushes: number;
  prs: number;
}

export function insertEvent(db: Database, event: GithubEvent): void {
  db.prepare(
    `INSERT OR IGNORE INTO github_events
      (id, type, repo, branch, actor, action, title, body, url,
       additions, deletions, changed_files, commit_count, created_at)
     VALUES ($id, $type, $repo, $branch, $actor, $action, $title, $body, $url,
             $additions, $deletions, $changed_files, $commit_count, $created_at)`
  ).run({
    $id: event.id,
    $type: event.type,
    $repo: event.repo,
    $branch: event.branch,
    $actor: event.actor,
    $action: event.action,
    $title: event.title,
    $body: event.body,
    $url: event.url,
    $additions: event.additions,
    $deletions: event.deletions,
    $changed_files: event.changed_files,
    $commit_count: event.commit_count,
    $created_at: event.created_at,
  } as AnyParams);
}

export function insertCommit(db: Database, commit: GithubCommit): void {
  db.prepare(
    `INSERT OR IGNORE INTO github_commits
      (sha, repo, branch, author, message, url,
       additions, deletions, changed_files, event_id, committed_at)
     VALUES ($sha, $repo, $branch, $author, $message, $url,
             $additions, $deletions, $changed_files, $event_id, $committed_at)`
  ).run({
    $sha: commit.sha,
    $repo: commit.repo,
    $branch: commit.branch,
    $author: commit.author,
    $message: commit.message,
    $url: commit.url,
    $additions: commit.additions,
    $deletions: commit.deletions,
    $changed_files: commit.changed_files,
    $event_id: commit.event_id,
    $committed_at: commit.committed_at,
  } as AnyParams);
}

export function upsertRepo(db: Database, repo: GithubRepo): void {
  db.prepare(
    `INSERT INTO github_repos
      (full_name, display_name, tracked, group_name, last_polled_at, color)
     VALUES ($full_name, $display_name, $tracked, $group_name, $last_polled_at, $color)
     ON CONFLICT(full_name) DO UPDATE SET
       display_name   = excluded.display_name,
       tracked        = excluded.tracked,
       group_name     = excluded.group_name,
       last_polled_at = excluded.last_polled_at,
       color          = excluded.color`
  ).run({
    $full_name: repo.full_name,
    $display_name: repo.display_name,
    $tracked: repo.tracked ? 1 : 0,
    $group_name: repo.group_name,
    $last_polled_at: repo.last_polled_at,
    $color: repo.color,
  } as AnyParams);
}

export function updateRepo(
  db: Database,
  fullName: string,
  fields: Partial<Pick<GithubRepo, "display_name" | "tracked" | "group_name" | "color" | "last_polled_at">>
): void {
  const sets: string[] = [];
  const params: Record<string, string | number | boolean | null | undefined> = { $full_name: fullName };

  if (fields.display_name !== undefined) {
    sets.push("display_name = $display_name");
    params.$display_name = fields.display_name;
  }
  if (fields.tracked !== undefined) {
    sets.push("tracked = $tracked");
    params.$tracked = fields.tracked ? 1 : 0;
  }
  if (fields.group_name !== undefined) {
    sets.push("group_name = $group_name");
    params.$group_name = fields.group_name;
  }
  if (fields.color !== undefined) {
    sets.push("color = $color");
    params.$color = fields.color;
  }
  if (fields.last_polled_at !== undefined) {
    sets.push("last_polled_at = $last_polled_at");
    params.$last_polled_at = fields.last_polled_at;
  }

  if (sets.length === 0) return;
  db.prepare(`UPDATE github_repos SET ${sets.join(", ")} WHERE full_name = $full_name`).run(params as AnyParams);
}

export function getEvents(db: Database, filters: EventFilters): GithubEvent[] {
  const conditions: string[] = [];
  const params: Record<string, string | number | null | undefined> = {};

  if (filters.repos && filters.repos.length > 0) {
    const placeholders = filters.repos.map((_, i) => `$repo${i}`).join(", ");
    conditions.push(`repo IN (${placeholders})`);
    filters.repos.forEach((r, i) => (params[`$repo${i}`] = r));
  }

  if (filters.types && filters.types.length > 0) {
    const placeholders = filters.types.map((_, i) => `$type${i}`).join(", ");
    conditions.push(`type IN (${placeholders})`);
    filters.types.forEach((t, i) => (params[`$type${i}`] = t));
  }

  if (filters.branch) {
    conditions.push("branch = $branch");
    params.$branch = filters.branch;
  }

  if (filters.from) {
    conditions.push("created_at >= $from");
    params.$from = filters.from;
  }

  if (filters.to) {
    conditions.push("created_at <= $to");
    params.$to = filters.to;
  }

  if (filters.search) {
    conditions.push("(title LIKE $search OR body LIKE $search)");
    params.$search = `%${filters.search}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.$limit = filters.limit ?? 50;
  params.$offset = filters.offset ?? 0;

  return db
    .query<GithubEvent, AnyParams>(
      `SELECT * FROM github_events ${where} ORDER BY created_at DESC LIMIT $limit OFFSET $offset`
    )
    .all(params);
}

export function getEvent(db: Database, id: string): GithubEvent | null {
  return (
    db.query<GithubEvent, AnyParams>("SELECT * FROM github_events WHERE id = $id").get({ $id: id }) ?? null
  );
}

export function getCommits(db: Database, filters: CommitFilters): GithubCommit[] {
  const conditions: string[] = [];
  const params: Record<string, string | number | null | undefined> = {};

  if (filters.repo) {
    conditions.push("repo = $repo");
    params.$repo = filters.repo;
  }

  if (filters.event_id) {
    conditions.push("event_id = $event_id");
    params.$event_id = filters.event_id;
  }

  if (filters.from) {
    conditions.push("committed_at >= $from");
    params.$from = filters.from;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.$limit = filters.limit ?? 50;
  params.$offset = filters.offset ?? 0;

  return db
    .query<GithubCommit, AnyParams>(
      `SELECT * FROM github_commits ${where} ORDER BY committed_at DESC LIMIT $limit OFFSET $offset`
    )
    .all(params);
}

export function getCommit(db: Database, sha: string): GithubCommit | null {
  return (
    db.query<GithubCommit, AnyParams>("SELECT * FROM github_commits WHERE sha = $sha").get({ $sha: sha }) ?? null
  );
}

export function getRepos(db: Database): GithubRepo[] {
  return db.query<GithubRepo, never[]>("SELECT * FROM github_repos ORDER BY full_name").all();
}

export function getContributions(db: Database, weeks: number = 12): ContributionDay[] {
  const daysBack = weeks * 7;
  return db
    .query<ContributionDay, AnyParams>(
      `SELECT date(created_at) as date, COUNT(*) as count
       FROM github_events
       WHERE created_at >= date('now', '-' || $days || ' days')
       GROUP BY date(created_at)
       ORDER BY date ASC`
    )
    .all({ $days: daysBack });
}

export function getSummary(db: Database, period: "today" | "week" | "month"): Summary {
  const intervalMap = { today: "1 day", week: "7 days", month: "30 days" };
  const interval = intervalMap[period];

  const events =
    db
      .query<{ c: number }, AnyParams>(
        `SELECT COUNT(*) as c FROM github_events WHERE created_at >= datetime('now', '-' || $interval)`
      )
      .get({ $interval: interval })?.c ?? 0;

  const commits =
    db
      .query<{ c: number }, AnyParams>(
        `SELECT COUNT(*) as c FROM github_commits WHERE committed_at >= datetime('now', '-' || $interval)`
      )
      .get({ $interval: interval })?.c ?? 0;

  const repos =
    db
      .query<{ c: number }, never[]>("SELECT COUNT(*) as c FROM github_repos WHERE tracked = 1")
      .get()?.c ?? 0;

  const pushes =
    db
      .query<{ c: number }, AnyParams>(
        `SELECT COUNT(*) as c FROM github_events WHERE type = 'PushEvent' AND created_at >= datetime('now', '-' || $interval)`
      )
      .get({ $interval: interval })?.c ?? 0;

  const prs =
    db
      .query<{ c: number }, AnyParams>(
        `SELECT COUNT(*) as c FROM github_events WHERE type = 'PullRequestEvent' AND created_at >= datetime('now', '-' || $interval)`
      )
      .get({ $interval: interval })?.c ?? 0;

  return { events, commits, repos, pushes, prs };
}
