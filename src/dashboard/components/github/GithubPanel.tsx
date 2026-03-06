import { useGithubStore } from "../../stores/github.ts";
import { useGithubActivity } from "../../hooks/useGithubActivity.ts";
import { StatsHeader } from "./StatsHeader.tsx";
import { RepoFilter } from "./RepoFilter.tsx";
import { ActivityTimeline } from "./ActivityTimeline.tsx";
import { CommitList } from "./CommitList.tsx";
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
    contributions,
    summary,
    filter,
    loading,
    error,
    selectEvent,
    setSelectedEventCommits,
    setFilter,
  } = useGithubStore();

  async function handleSelectEvent(evt: GithubEvent) {
    selectEvent(evt);
    try {
      const res = await apiClient.getCommits(evt.repo);
      const eventCommits = res.data.filter((c) => c.event_id === evt.id);
      setSelectedEventCommits(eventCommits);
    } catch {
      setSelectedEventCommits([]);
    }
  }

  function handleDateClick(date: string) {
    setFilter({ from: date, to: date });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading GitHub activity…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-rose-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      <div className="shrink-0 px-4 pt-3 pb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          GitHub Activity
        </h2>
      </div>

      <div className="shrink-0">
        <StatsHeader summary={summary} />
      </div>

      <div className="shrink-0">
        <ContributionHeatmap contributions={contributions} onDateClick={handleDateClick} />
      </div>

      <div className="shrink-0">
        <RepoFilter
          repos={repos}
          selectedRepos={filter.repos ?? []}
          onReposChange={(r) => setFilter({ repos: r })}
        />
      </div>

      <div className="flex flex-1 min-h-0 divide-x divide-slate-800">
        <div className="flex-1 min-w-0">
          <ActivityTimeline
            events={events}
            selectedId={selectedEvent?.id ?? null}
            onSelect={(evt) => void handleSelectEvent(evt)}
          />
        </div>
        <div className="w-80 shrink-0">
          <CommitList event={selectedEvent} commits={selectedEventCommits} />
        </div>
      </div>
    </div>
  );
}
