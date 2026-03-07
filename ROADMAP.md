# OmniForge — Roadmap

> **Planned rename:** `agent-forge` → `omniforge` (reflects broader scope beyond a single agent)

---

## v0.7.2 — Dashboard UX Overhaul

Design direction: GitHub-quality, information-dense, zero wasted space.
All items below are scoped to frontend changes only unless noted.

### 1. Project rename: `agent-forge` → `omniforge`
- Update `package.json` name, README heading, Docker image name, window title
- Rename repo (optional — can stay as `agent-forge` on disk, display name changes)

### 2. ~~Contribution heatmap — relocate below repo list~~ *(deferred → v0.8.0)*
- ~~Move `ContributionHeatmap` from center column (above timeline) to the bottom of the left sidebar~~
- **Decision (2026-03-07):** Heatmap integration deferred. Component kept in codebase, not wired up.
  The right column panel has been removed and the sidebar is now a clean repo list only.
  Heatmap will be revisited once the multi-panel layout (v0.8.0) defines a better home for it.

### 3. Inline commit details — accordion in timeline *(primary focus)*
- Expand PushEvent accordion to show **nested commit rows** with full `message_full` body
- Each commit row: SHA (linked) → subject → collapsible body (Radix Collapsible)
- Diffstats (`+N −N`) shown inline on the EventRow itself
- **This is the canonical home for event details** — no sidebar accordion needed

### 4. Separate WatchEvents from owned activity
- Current: WatchEvents (stars on other repos) mixed into the main timeline
- Proposed: filter them into a secondary "Social / Stars" section or tab
- Main timeline shows only **push, PR, issue, review, release, create** events on **your own repos**
- WatchEvents shown in a collapsed "Starred this week" strip at the top or in a separate tab

### 5. ~~No right panel — detail as left-panel nested accordion~~ *(revised)*
- ✅ Right panel (360px `EventDetail` slide-in) **removed** — 2-column layout in place
- ~~On event selection: expand inline accordion within the left sidebar~~
- **Decision (2026-03-07):** Sidebar detail accordion deferred. Event detail lives in the
  ActivityTimeline accordion (item 3) only. Sidebar stays a clean, scannable repo list.

### 6. Tighter stats header with octicons
- Current: tall metric strip with large numbers and uppercase labels
- Proposed: single-line bar, `11px` text
- Use `@primer/octicons-react` icons per category:
  - `GitCommitIcon` → commits
  - `GitPullRequestIcon` → PRs
  - `RepoIcon` → repos
  - `UploadIcon` → pushes
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
- Revisit ContributionHeatmap placement in multi-panel layout

## v1.0.0 — Mercury Integration

- Prometheus alert feed in dashboard
- AlertManager webhook → WebSocket push to dashboard
- Telegram notification correlation view

---

*Last updated: 2026-03-07*
