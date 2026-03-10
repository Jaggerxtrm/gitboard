import { useEffect, useCallback } from "react";
import { useGithubStore } from "../stores/github.ts";
import { apiClient } from "../lib/client.ts";
import { useWebSocket } from "./useWebSocket.ts";
import type { WsMessage } from "../lib/ws.ts";
import type { GithubEvent } from "../../types/github.ts";

export function useGithubActivity(): void {
  const {
    filter,
    setEvents,
    appendEvents,
    prependEvent,
    setRepos,
    setContributions,
    setSummary,
    setRepoStats,
    markRepoUnread,
    setLoading,
    setError,
    setPrs,
    setIssues,
    mergeRepoLastActivity,
  } = useGithubStore();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, reposRes, contribRes, summaryRes, statsRes, prsRes, issuesRes] = await Promise.all([
        apiClient.getEvents({ ...filter, limit: 50, offset: 0 }),
        apiClient.getRepos(),
        apiClient.getContributions(),
        apiClient.getSummary("today"),
        apiClient.getRepoStats(),
        apiClient.getPrs({ limit: 100 }),
        apiClient.getIssues({ limit: 100 }),
      ]);
      setEvents(eventsRes.data);
      mergeRepoLastActivity(eventsRes.data);
      setRepos(reposRes.data);
      setContributions(contribRes.data);
      setSummary(summaryRes);
      setRepoStats(statsRes.data);
      setPrs(prsRes.data);
      setIssues(issuesRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [filter, setEvents, setRepos, setContributions, setSummary, setRepoStats, setLoading, setError, setPrs, setIssues, mergeRepoLastActivity]);

  useEffect(() => {
    void load();
  }, [load]);

  const wsHandler = useCallback(
    (msg: WsMessage) => {
      if (msg.event === "new_event" && msg.data) {
        const event = msg.data as GithubEvent;
        prependEvent(event);
        markRepoUnread(event.repo);
        mergeRepoLastActivity([event]);
      }
      if (msg.event === "new_commits" && msg.data) {
        const { event } = msg.data as { event: GithubEvent };
        if (event) {
          prependEvent(event);
          markRepoUnread(event.repo);
          mergeRepoLastActivity([event]);
        }
      }
    },
    [prependEvent, markRepoUnread, mergeRepoLastActivity]
  );

  useWebSocket("github:activity", wsHandler);

  const loadMore = useCallback(async () => {
    const currentCount = useGithubStore.getState().events.length;
    try {
      const res = await apiClient.getEvents({
        ...filter,
        limit: 50,
        offset: currentCount,
      });
      appendEvents(res.data);
      mergeRepoLastActivity(res.data);
    } catch {
      // ignore load-more errors
    }
  }, [filter, appendEvents, mergeRepoLastActivity]);

  // Expose loadMore via store would be cleaner, but for now attach to window for dev
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__loadMoreGithubEvents = loadMore;
  }, [loadMore]);
}
