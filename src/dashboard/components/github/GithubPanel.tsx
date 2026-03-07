import { useState } from "react";
import { StarIcon } from "@primer/octicons-react";
import { useGithubStore } from "../../stores/github.ts";
import { useGithubActivity } from "../../hooks/useGithubActivity.ts";
import { StatsHeader } from "./StatsHeader.tsx";
import { RepoSidebar } from "./RepoSidebar.tsx";
import { ActivityTimeline } from "./ActivityTimeline.tsx";
import { apiClient } from "../../lib/client.ts";
import type { GithubEvent } from "../../../types/github.ts";

const SOCIAL_TYPES = new Set(["WatchEvent", "ForkEvent", "MemberEvent"]);

export function GithubPanel({ onMount = useGithubActivity }: { onMount?: () => void } = {}) {
  onMount();

  const [socialOpen, setSocialOpen] = useState(false);

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

  const ownEvents = events.filter((e) => !SOCIAL_TYPES.has(e.type));
  const socialEvents = events.filter((e) => SOCIAL_TYPES.has(e.type));

  // Derive owner username + last own-activity timestamp per repo for sidebar
  const ownerUsername = ownEvents[0]?.actor ?? null;
  const lastEventAt: Record<string, string> = {};
  for (const evt of ownEvents) {
    if (!lastEventAt[evt.repo] || evt.created_at > lastEventAt[evt.repo]) {
      lastEventAt[evt.repo] = evt.created_at;
    }
  }

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
        lastEventAt={lastEventAt}
        ownerUsername={ownerUsername}
        onSelect={(r) => setFilter({ repos: [r] })}
        onReset={resetFilter}
      />

      {/* Center: Activity Timeline (full remaining width) */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <StatsHeader summary={summary} />

        {/* Main feed: owned activity only */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ActivityTimeline
            events={ownEvents}
            selectedId={selectedEvent?.id ?? null}
            onSelect={(evt) => void handleSelectEvent(evt)}
          />
        </div>

        {/* Starred / Social strip — collapsed by default */}
        {socialEvents.length > 0 && (
          <div style={{
            flexShrink: 0,
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--surface-secondary)",
          }}>
            <button
              onClick={() => setSocialOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                padding: "6px 16px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: "var(--text-muted)",
                textAlign: "left",
              }}
            >
              <StarIcon size={12} />
              <span>{socialEvents.length} starred this week</span>
              <span style={{ marginLeft: "auto", fontSize: 10 }}>{socialOpen ? "▲" : "▼"}</span>
            </button>
            {socialOpen && (
              <div style={{ maxHeight: 160, overflowY: "auto", padding: "0 16px 8px" }}>
                {socialEvents.map((e) => (
                  <div key={e.id} style={{ fontSize: 11, color: "var(--text-secondary)", padding: "3px 0", display: "flex", gap: 6 }}>
                    <StarIcon size={11} />
                    <span style={{ color: "var(--text-muted)" }}>{e.actor}</span>
                    <span>starred</span>
                    <span style={{ color: "var(--text-primary)" }}>{e.repo}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
