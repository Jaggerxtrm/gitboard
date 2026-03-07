import { useRef } from "react";
import { ChevronDownIcon } from "@primer/octicons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EventIcon, eventColor } from "./EventIcon.tsx";
import type { GithubEvent } from "../../../types/github.ts";

interface Props {
  events: GithubEvent[];
  selectedId: string | null;
  onSelect: (event: GithubEvent) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function EventRow({ evt, selected, onSelect }: { evt: GithubEvent; selected: boolean; onSelect: (e: GithubEvent) => void }) {
  const color = eventColor(evt.type, evt.action);
  return (
    <div
      role="row"
      aria-selected={selected}
      onClick={() => onSelect(evt)}
      style={{ borderLeft: selected ? `2px solid ${color}` : "2px solid transparent", background: selected ? "var(--bg-tertiary)" : "transparent" }}
      className={`flex items-start gap-3 px-4 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors`}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", width: 44, flexShrink: 0, paddingTop: 2 }}>
        {formatTime(evt.created_at)}
      </span>
      <span style={{ color }} className="mt-0.5 shrink-0">
        <EventIcon type={evt.type} action={evt.action} />
      </span>
      <div className="min-w-0 flex-1">
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }} className="truncate">{evt.repo}</div>
        <div style={{ fontSize: 13, color: "var(--text-primary)" }} className="truncate">{evt.title ?? evt.type}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          {evt.branch && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 6px" }}>
              {evt.branch}
            </span>
          )}
          {evt.commit_count != null && evt.commit_count > 0 && (
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
              {evt.commit_count} commit{evt.commit_count !== 1 ? "s" : ""}
            </span>
          )}
          {evt.type === "PushEvent" && (
            <span style={{ color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }}>
              <ChevronDownIcon size={12} />
            </span>
          )}
        </div>
      </div>
      {(evt.additions != null || evt.deletions != null) && (
        <div style={{ display: "flex", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
          {evt.additions != null && <span style={{ color: "var(--diff-add)" }}>+{evt.additions}</span>}
          {evt.deletions != null && <span style={{ color: "var(--diff-del)" }}>−{evt.deletions}</span>}
        </div>
      )}
    </div>
  );
}


function VirtualizedTimeline({ events, selectedId, onSelect }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="overflow-auto h-full" role="table">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const evt = events[virtualRow.index];
          return (
            <div
              key={evt.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <EventRow evt={evt} selected={evt.id === selectedId} onSelect={onSelect} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActivityTimeline({ events, selectedId, onSelect }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm" role="table">
        No events to display.
      </div>
    );
  }

  // SSR fallback: render items directly (no virtualizer)
  if (typeof window === "undefined") {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const items: Array<{ kind: "header"; label: string; key: string } | { kind: "event"; event: GithubEvent }> = [];
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

    return (
      <div className="overflow-auto h-full" role="table">
        {items.map((item) =>
          item.kind === "header" ? (
            <div
              key={item.key}
              style={{
                padding: "6px 16px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                background: "var(--bg-primary)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {item.label}
            </div>
          ) : (
            <EventRow
              key={item.event.id}
              evt={item.event}
              selected={item.event.id === selectedId}
              onSelect={onSelect}
            />
          )
        )}
      </div>
    );
  }

  return <VirtualizedTimeline events={events} selectedId={selectedId} onSelect={onSelect} />;
}
