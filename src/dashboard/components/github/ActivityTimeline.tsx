import { useRef, useState, useEffect, useCallback } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "@primer/octicons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EventIcon, eventColor } from "./EventIcon.tsx";
import { apiClient } from "../../lib/client.ts";
import type { GithubEvent, GithubCommit } from "../../../types/github.ts";

interface Props {
  events: GithubEvent[];
  selectedId: string | null;
  onSelect: (event: GithubEvent) => void;
}

type Item =
  | { kind: "header"; label: string; key: string }
  | { kind: "event"; event: GithubEvent };

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function buildItems(events: GithubEvent[]): Item[] {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const items: Item[] = [];
  let lastDate = "";
  for (const evt of events) {
    const evtDate = new Date(evt.created_at).toDateString();
    if (evtDate !== lastDate) {
      lastDate = evtDate;
      let label: string;
      if (evtDate === today) label = "Today";
      else if (evtDate === yesterday) label = "Yesterday";
      else {
        const d = new Date(evt.created_at);
        label = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      }
      items.push({ kind: "header", label, key: `header-${evtDate}` });
    }
    items.push({ kind: "event", event: evt });
  }
  return items;
}

interface EventRowProps {
  evt: GithubEvent;
  selected: boolean;
  hovered: boolean;
  onSelect: (e: GithubEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function EventRow({ evt, selected, hovered, onSelect, onMouseEnter, onMouseLeave }: EventRowProps) {
  const color = eventColor(evt.type, evt.action);
  const hasDiff = evt.additions != null || evt.deletions != null;

  return (
    <div
      role="row"
      aria-selected={selected}
      onClick={() => onSelect(evt)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 0,
        padding: "10px 16px",
        borderRadius: "var(--radius-md)",
        borderLeft: selected ? `2px solid ${color}` : "2px solid transparent",
        background: selected ? "var(--surface-tertiary)" : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        cursor: "pointer",
        transition: "var(--transition-fast)",
        minWidth: 0,
      }}
    >
      {/* Indicator dot */}
      <div style={{ width: 6, height: 6, borderRadius: "var(--radius-pill)", background: color, flexShrink: 0, marginTop: 5, marginRight: 8 }} />

      {/* Time */}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)", width: 44, flexShrink: 0, paddingTop: 2 }}>
        {formatTime(evt.created_at)}
      </span>

      {/* Icon */}
      <span style={{ color, flexShrink: 0, marginRight: 8, marginTop: 1, width: 16 }}>
        <EventIcon type={evt.type} action={evt.action} />
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        {/* Line 1: repo · title */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, overflow: "hidden" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-secondary)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "40%" }}>
            {evt.repo}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", flexShrink: 0 }}>·</span>
          <span style={{ fontSize: "var(--text-base)", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {evt.title ?? evt.type}
          </span>
        </div>

        {/* Line 2: branch + commit count + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          {evt.branch && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--text-secondary)",
              background: "var(--surface-tertiary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-xs)",
              padding: "0 5px",
            }}>
              {evt.branch}
            </span>
          )}
          {evt.commit_count != null && evt.commit_count > 0 && (
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
              {evt.commit_count} commit{evt.commit_count !== 1 ? "s" : ""}
            </span>
          )}
          {evt.type === "PushEvent" && (
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
              <ChevronDownIcon size={12} />
            </span>
          )}
        </div>
      </div>

      {/* Diffstats */}
      {hasDiff && (
        <div style={{ display: "flex", gap: 4, fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>
          {evt.additions != null && <span style={{ color: "var(--diff-add)" }}>+{evt.additions}</span>}
          {evt.deletions != null && <span style={{ color: "var(--diff-del)" }}>−{evt.deletions}</span>}
        </div>
      )}
    </div>
  );
}

function DayHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: "6px 16px",
      fontSize: "var(--text-xs)",
      fontWeight: 600,
      color: "var(--text-muted)",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      background: "var(--surface-primary)",
      borderBottom: "1px solid var(--border-subtle)",
    }}>
      {label}
    </div>
  );
}

function VirtualizedTimeline({ events, selectedId, onSelect }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [commitCache, setCommitCache] = useState<Map<string, GithubCommit[]>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const prevLengthRef = useRef(events.length);
  const prevFirstIdRef = useRef<string | null>(events[0]?.id ?? null);

  // Detect new events prepended
  useEffect(() => {
    if (events.length > 0) {
      const firstId = events[0].id;
      if (prevFirstIdRef.current !== null && firstId !== prevFirstIdRef.current) {
        const prevIdx = events.findIndex(e => e.id === prevFirstIdRef.current);
        if (prevIdx > 0) setNewCount(c => c + prevIdx);
      }
      prevFirstIdRef.current = firstId;
    }
    prevLengthRef.current = events.length;
  }, [events]);

  const items = buildItems(events);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => items[i].kind === "header" ? 32 : 68,
    overscan: 5,
  });

  // Fetch commits when accordion opens
  const handleAccordionChange = useCallback(async (openIds: string[]) => {
    setExpandedIds(openIds);
    for (const evtId of openIds) {
      if (commitCache.has(evtId) || loadingIds.has(evtId)) continue;
      setLoadingIds(prev => new Set([...prev, evtId]));
      try {
        const res = await apiClient.getCommits(undefined, undefined, evtId);
        setCommitCache(prev => new Map([...prev, [evtId, res.data]]));
      } catch {
        setCommitCache(prev => new Map([...prev, [evtId, []]]));
      } finally {
        setLoadingIds(prev => { const n = new Set(prev); n.delete(evtId); return n; });
      }
    }
  }, [commitCache, loadingIds]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const evtItems = items.filter(i => i.kind === "event") as Extract<Item, { kind: "event" }>[];
      if (e.key === "j" || e.key === "k") {
        const idx = evtItems.findIndex(i => i.event.id === selectedId);
        const nextIdx = e.key === "j"
          ? Math.min(evtItems.length - 1, idx + 1)
          : Math.max(0, idx - 1);
        if (evtItems[nextIdx]) onSelect(evtItems[nextIdx].event);
      }
      if (e.key === "Escape") onSelect(null as unknown as GithubEvent);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, selectedId, onSelect]);

  const scrollToTop = () => {
    parentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setNewCount(0);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* New events banner */}
      {newCount > 0 && (
        <button
          onClick={scrollToTop}
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            width: "100%",
            padding: "6px 16px",
            background: "var(--accent-blue)",
            border: "none",
            color: "#fff",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          {newCount} new event{newCount !== 1 ? "s" : ""} — click to scroll to top
        </button>
      )}

      <div ref={parentRef} style={{ overflow: "auto", flex: 1 }} role="table">
        <Accordion.Root type="multiple" value={expandedIds} onValueChange={handleAccordionChange}>
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index];
              return (
                <div
                  key={item.kind === "header" ? item.key : item.event.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.kind === "header" ? (
                    <DayHeader label={item.label} />
                  ) : (
                    <Accordion.Item value={item.event.id} style={{ listStyle: "none" }}>
                      <Accordion.Header>
                        <Accordion.Trigger asChild>
                          <EventRow
                            evt={item.event}
                            selected={item.event.id === selectedId}
                            hovered={hoveredId === item.event.id}
                            onSelect={onSelect}
                            onMouseEnter={() => setHoveredId(item.event.id)}
                            onMouseLeave={() => setHoveredId(null)}
                          />
                        </Accordion.Trigger>
                      </Accordion.Header>
                      {item.event.type === "PushEvent" && (
                        <Accordion.Content style={{ overflow: "hidden" }}>
                          {loadingIds.has(item.event.id) ? (
                            <div style={{ padding: "8px 16px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Loading commits…</div>
                          ) : (
                            <div style={{ padding: "4px 16px 8px" }}>
                              {(commitCache.get(item.event.id) ?? []).map(commit => (
                                <div key={commit.sha} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: "var(--text-xs)" }}>
                                  <a
                                    href={commit.url ?? `https://github.com/${commit.repo}/commit/${commit.sha}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontFamily: "var(--font-mono)", color: "var(--accent-blue)", flexShrink: 0 }}
                                  >
                                    {commit.sha.slice(0, 7)}
                                  </a>
                                  <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {commit.message.split("\n")[0]}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </Accordion.Content>
                      )}
                    </Accordion.Item>
                  )}
                </div>
              );
            })}
          </div>
        </Accordion.Root>
      </div>
    </div>
  );
}

export function ActivityTimeline({ events, selectedId, onSelect }: Props) {
  if (events.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: "var(--text-base)" }} role="table">
        No events to display.
      </div>
    );
  }

  // SSR fallback — no virtualizer, no Radix hooks
  if (typeof window === "undefined") {
    const [hoveredId] = useState<string | null>(null);
    const items = buildItems(events);

    return (
      <div style={{ overflow: "auto", height: "100%" }} role="table">
        {items.map((item) =>
          item.kind === "header" ? (
            <DayHeader key={item.key} label={item.label} />
          ) : (
            <EventRow
              key={item.event.id}
              evt={item.event}
              selected={item.event.id === selectedId}
              hovered={hoveredId === item.event.id}
              onSelect={onSelect}
              onMouseEnter={() => {}}
              onMouseLeave={() => {}}
            />
          )
        )}
      </div>
    );
  }

  return <VirtualizedTimeline events={events} selectedId={selectedId} onSelect={onSelect} />;
}
