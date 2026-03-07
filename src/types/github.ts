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
  ingested_at?: string;
}

export interface GithubCommit {
  sha: string;
  repo: string;
  branch: string | null;
  author: string;
  message: string;
  message_full?: string | null;
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

export interface ContributionDay {
  date: string;
  count: number;
}

export interface Summary {
  events: number;
  pushes: number;
  prs: number;
  commits: number;
  repos: number;
}

export interface RepoStat {
  full_name: string;
  pushes: number;
  prs_open: number;
  prs_closed: number;
}

export interface RepoStatsResponse {
  data: RepoStat[];
}

export interface EventsResponse {
  data: GithubEvent[];
  limit: number;
  offset: number;
}

export interface CommitsResponse {
  data: GithubCommit[];
  limit: number;
  offset: number;
}

export interface ReposResponse {
  data: GithubRepo[];
}

export interface ContributionsResponse {
  data: ContributionDay[];
}

export type EventFilter = {
  repos?: string[];
  types?: string[];
  branch?: string;
  from?: string;
  to?: string;
  search?: string;
  group?: string;
  limit?: number;
  offset?: number;
};
