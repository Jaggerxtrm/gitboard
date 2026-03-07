import { useGithubStore } from "../../stores/github.ts";
import { useGithubActivity } from "../../hooks/useGithubActivity.ts";
import { StatsHeader } from "./StatsHeader.tsx";
import { RepoSidebar } from "./RepoSidebar.tsx";
import { ActivityTimeline } from "./ActivityTimeline.tsx";
import { EventDetail } from "./EventDetail.tsx";
import { ContributionHeatmap } from "./ContributionHeatmap.tsx";
import { apiClient } from "../../lib/client.ts";
import type { GithubEvent } from "../../../types/github.ts";

export function GithubPanel({ onMount = useGithubActivity }: { onMount?: () => void } = {}) {
  onMount();

  const {
    events,
    selectedEvent,
    selectedEventCommits,
    repos,
    repoStats,
    contributions,
    summary,
    filter,
    loading,
    error,
    unreadRepos,
    selectEvent,
    setSelectedEventCommits,
    setFilter,
    resetFilter,
    clearRepoUnread,
  } = useGithubStore();

  async function handleSelectEvent(evt: GithubEvent) {
    selectEvent(evt);
    clearRepoUnread(evt.repo);
    try {
      const res = await apiClient.getCommits(undefined, undefined, evt.id);
      setSelectedEventCommits(res.data);
    } catch {
      setSelectedEventCommits([]);
    }
  }

  const detailOpen = selectedEvent !== null;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: "var(--text-base)" }}>
        Loading GitHub activity…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--accent-red)", fontSize: "var(--text-base)" }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: Repo Sidebar */}
      <RepoSidebar
        repos={repos}
        stats={repoStats}
        selectedRepos={filter.repos ?? []}
        unreadRepos={unreadRepos}
        onSelect={(r) => setFilter({ repos: [r] })}
        onReset={resetFilter}
      />

      {/* Center: Activity Feed */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <StatsHeader summary={summary} />
        <ContributionHeatmap contributions={contributions} onDateClick={(d) => setFilter({ from: d, to: d })} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <ActivityTimeline
            events={events}
            selectedId={selectedEvent?.id ?? null}
            onSelect={(evt) => void handleSelectEvent(evt)}
          />
        </div>
      </div>

      {/* Right: Event Detail — CSS width transition */}
      <div style={{
        width: detailOpen ? "var(--detail-width)" : 0,
        minWidth: 0,
        overflow: "hidden",
        borderLeft: detailOpen ? "1px solid var(--border-subtle)" : "none",
        background: "var(--surface-secondary)",
        transition: "width var(--transition-fast)",
        flexShrink: 0,
      }}>
        <EventDetail event={selectedEvent} commits={selectedEventCommits} />
      </div>
    </div>
  );
}
