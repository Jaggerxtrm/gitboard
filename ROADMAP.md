# OmniForge — Roadmap

> **Planned rename:** `agent-forge` → `omniforge` (reflects broader scope beyond a single agent)

---

## v0.7.2 — Dashboard UX Overhaul

Design direction: GitHub-quality, information-dense, zero wasted space.
All items below are scoped to frontend changes only unless noted.

### 1. Project rename: `agent-forge` → `omniforge`
- Update `package.json` name, README heading, Docker image name, window title
- Rename repo (optional — can stay as `agent-forge` on disk, display name changes)

### 2. Contribution heatmap — relocate below repo list
- Move `ContributionHeatmap` from center column (above timeline) to the bottom of the left sidebar, below `RepoSidebar`
- Frees the full viewport height for the activity timeline (most valuable real estate)
- Heatmap becomes a context item for the selected repo, not a global header

### 3. Inline commit details — accordion in timeline, detail panel optional
- Expand PushEvent accordion to show **nested commit rows** with full `message_full` body
- Each commit row: SHA (linked) → subject → collapsible body (Radix Collapsible, same as EventDetail currently uses)
- Diffstats (`+N −N`) shown inline on the EventRow itself
- Right detail panel remains for PR body / release notes, but is **not needed for commits**

### 4. Separate WatchEvents from owned activity
- Current: WatchEvents (stars on other repos) mixed into the main timeline
- Proposed: filter them into a secondary "Social / Stars" section or tab
- Main timeline shows only **push, PR, issue, review, release, create** events on **your own repos**
- WatchEvents shown in a collapsed "Starred this week" strip at the top or in a separate tab

### 5. No right panel — detail as left-panel nested accordion
- Remove the 360px right `EventDetail` slide-in panel entirely
- On event selection: expand an **inline accordion** within the left sidebar showing event details
  - PR body, commit list, diffstats
  - Smaller font (`11px`/`12px`), compressed line-height
  - Scrollable within the sidebar column
- Right column space reclaimed by the activity timeline (more horizontal width)

### 6. Tighter stats header with octicons
- Current: tall metric strip with large numbers and uppercase labels
- Proposed: single-line bar, `11px` text, right-to-left reading: `◆ 12 pushes · ↑ 4 PRs · ⎇ 31 commits · 📦 7 repos`
- Use `@primer/octicons-react` icons per category:
  - `GitCommitIcon` → commits
  - `GitPullRequestIcon` → PRs
  - `RepoForkedIcon` / `RepoIcon` → repos
  - `UploadIcon` or `RepoIcon` → pushes
  - `CalendarIcon` → events total
- Height: `32px` max (from current ~`56px`)

### 7. Repo sidebar — own repos only, sorted by last activity
- Filter out repos where the last event was a `WatchEvent` (not your own work)
- Sort by most recent push/PR/commit event descending
- Show `last_polled_at` or last event `created_at` as a relative timestamp (`2h ago`, `yesterday`)
- Zero-count stats (`0 pushes`) hidden per existing quality bar rule

---

## v0.8.0 — Multi-panel (Fleet, Registry)

- Fleet panel: agent session list (Mercury stack services)
- Registry panel: specialist system overview
- Top-nav tabs become functional (currently GitHub-only)

## v1.0.0 — Mercury Integration

- Prometheus alert feed in dashboard
- AlertManager webhook → WebSocket push to dashboard
- Telegram notification correlation view

---

*Last updated: 2026-03-07*
