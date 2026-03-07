# Changelog

All notable changes to Agent Forge are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

### Added
- RepoSidebar component — grouped repo list with 24h stats, unread dots, GitHub links (replaces RepoFilter)
- EventDetail component — slide-in panel with diffstat bar, expandable commit messages, message_full lazy enrichment (replaces CommitList)
- GET /api/github/repos/stats route — 24h push/PR counts per repo
- getRepoStats, isTruncated, updateCommitFullMessage, enrichCommitMessages to github-store
- repoStats and unreadRepos state + setRepoStats, markRepoUnread, clearRepoUnread actions to Zustand store
- message_full column migration and GithubCommit.message_full type field

### Changed
- GithubPanel — three-column layout: RepoSidebar | activity feed | EventDetail slide-in
- ActivityTimeline — day group headers, inline diffstats, branch tag, PushEvent chevron
- ContributionHeatmap — month labels row, 14px cells, 3px gap, day-of-week labels
- globals.css — full LobsterBoard design token system replacing ad-hoc slate-* classes
- useGithubActivity hook — loads repoStats on mount, marks repos unread on WebSocket new_event

### Removed
- RepoFilter.tsx and CommitList.tsx — replaced by RepoSidebar and EventDetail