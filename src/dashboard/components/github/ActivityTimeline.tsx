import { useRef } from "react";
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
      style={{ borderLeft: selected ? `2px solid ${color}` : "2px solid transparent" }}
      className={`flex items-start gap-3 px-4 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors ${selected ? "bg-slate-800" : ""}`}
    >
      <span className="text-xs text-slate-500 font-mono w-12 shrink-0 pt-0.5">
        {formatTime(evt.created_at)}
      </span>
      <span style={{ color }} className="mt-0.5 shrink-0">
        <EventIcon type={evt.type} action={evt.action} />
      </span>
      <div className="min-w-0">
        <div className="text-xs text-slate-400 font-mono truncate">{evt.repo}</div>
        <div className="text-sm text-slate-200 truncate">{evt.title ?? evt.type}</div>
        {evt.commit_count != null && (
          <div className="text-xs text-slate-500">{evt.commit_count} commit{evt.commit_count !== 1 ? "s" : ""}</div>
        )}
      </div>
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
    return (
      <div className="overflow-auto h-full" role="table">
        {events.map((evt) => (
          <EventRow key={evt.id} evt={evt} selected={evt.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return <VirtualizedTimeline events={events} selectedId={selectedId} onSelect={onSelect} />;
}
