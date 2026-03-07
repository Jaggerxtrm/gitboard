import { useGithubStore } from "../../stores/github.ts";
import { useGithubActivity } from "../../hooks/useGithubActivity.ts";
import { StatsHeader } from "./StatsHeader.tsx";
import { RepoSidebar } from "./RepoSidebar.tsx";
import { ActivityTimeline } from "./ActivityTimeline.tsx";
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
      {/* Left: Repo Sidebar — clean repo list only */}
      <RepoSidebar
        repos={repos}
        stats={repoStats}
        selectedRepos={filter.repos ?? []}
        unreadRepos={unreadRepos}
        onSelect={(r) => setFilter({ repos: [r] })}
        onReset={resetFilter}
      />

      {/* Center: Activity Timeline (full remaining width) */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <StatsHeader summary={summary} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <ActivityTimeline
            events={events}
            selectedId={selectedEvent?.id ?? null}
            onSelect={(evt) => void handleSelectEvent(evt)}
          />
        </div>
      </div>
    </div>
  );
}
