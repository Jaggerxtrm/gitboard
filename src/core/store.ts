import { Database } from "bun:sqlite";

export const TABLES = [
  "sessions",
  "messages",
  "specialist_events",
  "github_events",
  "github_commits",
  "github_repos",
] as const;

export type TableName = (typeof TABLES)[number];

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL,
  specialist_id    TEXT,
  role             TEXT NOT NULL,
  tmux_session     TEXT NOT NULL,
  status           TEXT NOT NULL,
  task             TEXT,
  parent_id        TEXT,
  started_at       DATETIME,
  updated_at       DATETIME,
  ended_at         DATETIME,
  last_activity    DATETIME,
  stalled_since    DATETIME,
  escalation_level INTEGER DEFAULT 0,
  exit_reason      TEXT,
  log_file         TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_session  TEXT NOT NULL,
  to_session    TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN (
                  'task', 'result', 'status', 'follow_up',
                  'worker_done', 'spawn_request', 'escalation', 'health_check'
                )),
  content       TEXT NOT NULL,
  payload       TEXT,
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  thread_id     TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  read          BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_inbox    ON messages (to_session, read);
CREATE INDEX IF NOT EXISTS idx_thread   ON messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_priority ON messages (priority, created_at);

CREATE TABLE IF NOT EXISTS specialist_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invocation_id   TEXT NOT NULL,
  hook            TEXT NOT NULL CHECK(hook IN (
    'pre_render','post_render','pre_execute','post_execute')),
  timestamp       DATETIME NOT NULL,
  specialist_name TEXT NOT NULL,
  specialist_version TEXT,
  session_id      TEXT,
  thread_id       TEXT,
  payload         TEXT NOT NULL,
  backend         TEXT,
  duration_ms     INTEGER,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost_usd        REAL,
  status          TEXT,
  error_type      TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_invocation ON specialist_events(invocation_id);
CREATE INDEX IF NOT EXISTS idx_events_specialist ON specialist_events(specialist_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_session    ON specialist_events(session_id);

CREATE TABLE IF NOT EXISTS github_events (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  repo            TEXT NOT NULL,
  branch          TEXT,
  actor           TEXT NOT NULL,
  action          TEXT,
  title           TEXT,
  body            TEXT,
  url             TEXT,
  additions       INTEGER,
  deletions       INTEGER,
  changed_files   INTEGER,
  commit_count    INTEGER,
  created_at      DATETIME NOT NULL,
  ingested_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gh_events_repo   ON github_events(repo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gh_events_type   ON github_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gh_events_date   ON github_events(created_at DESC);

CREATE TABLE IF NOT EXISTS github_commits (
  sha             TEXT PRIMARY KEY,
  repo            TEXT NOT NULL,
  branch          TEXT,
  author          TEXT NOT NULL,
  message         TEXT NOT NULL,
  url             TEXT,
  additions       INTEGER,
  deletions       INTEGER,
  changed_files   INTEGER,
  event_id        TEXT REFERENCES github_events(id),
  committed_at    DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gh_commits_repo  ON github_commits(repo, committed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gh_commits_event ON github_commits(event_id);

CREATE TABLE IF NOT EXISTS github_repos (
  full_name       TEXT PRIMARY KEY,
  display_name    TEXT,
  tracked         BOOLEAN DEFAULT TRUE,
  group_name      TEXT,
  last_polled_at  DATETIME,
  color           TEXT
);

CREATE INDEX IF NOT EXISTS idx_gh_repos_group ON github_repos(group_name);
`;

export function createDatabase(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec(SCHEMA);
  return db;
}
