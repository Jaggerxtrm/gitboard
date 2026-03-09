import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  GitPullRequestIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  ChevronDownIcon,
} from "@primer/octicons-react";
import type { GithubPr } from "../../../types/github.ts";
import {
  buildDateGroupedItems,
  formatRelativeTime,
  parseLabels,
  truncateBody,
  type DateGroupItem,
} from "../../lib/timeline-utils.ts";

type PrItem = DateGroupItem<GithubPr>;

function prStateStyle(state: string): { Icon: React.ElementType; color: string } {
  if (state === "merged") return { Icon: GitMergeIcon, color: "var(--accent-purple)" };
  if (state === "closed") return { Icon: GitPullRequestClosedIcon, color: "var(--accent-red)" };
  return { Icon: GitPullRequestIcon, color: "var(--accent-blue)" };
}

function DayHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "6px 12px 4px",
        fontSize: "var(--text-xs)",
        color: "var(--text-muted)",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--surface-primary)",
      }}
    >
      {label}
    </div>
  );
}

function LabelChip({ name }: { name: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: "var(--radius-pill)",
        background: "var(--surface-tertiary)",
        border: "1px solid var(--border-default)",
        color: "var(--text-secondary)",
        fontSize: "var(--text-xs)",
        lineHeight: 1.5,
      }}
    >
      {name}
    </span>
  );
}

function PrExpandedBody({ pr }: { pr: GithubPr }) {
  const [showMore, setShowMore] = useState(false);
  const labels = parseLabels(pr.label_names);
  const hasDiff = pr.additions != null || pr.deletions != null || pr.changed_files != null;

  return (
    <div style={{ padding: "8px 12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
      {pr.body && (() => {
        const { visible, hasMore } = truncateBody(pr.body);
        return (
          <div>
            <div
              style={{
                whiteSpace: "pre-wrap",
                fontSize: "var(--text-xs)",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              {showMore ? pr.body : visible}
            </div>
            {hasMore && !showMore && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowMore(true); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent-blue)",
                  fontSize: "var(--text-xs)",
                  cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                show more
              </button>
            )}
          </div>
        );
      })()}
      {hasDiff && (
        <div style={{ display: "flex", gap: 8, fontSize: "var(--text-xs)" }}>
          {pr.additions != null && (
            <span style={{ color: "var(--diff-add)" }}>+{pr.additions}</span>
          )}
          {pr.deletions != null && (
            <span style={{ color: "var(--diff-del)" }}>−{pr.deletions}</span>
          )}
          {pr.changed_files != null && (
            <span style={{ color: "var(--text-muted)" }}>Δ{pr.changed_files} files</span>
          )}
        </div>
      )}
      {labels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {labels.map((name) => <LabelChip key={name} name={name} />)}
        </div>
      )}
      {pr.url && (
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--accent-blue)", fontSize: "var(--text-xs)", textDecoration: "none" }}
        >
          Open on GitHub →
        </a>
      )}
    </div>
  );
}

function PrRow({
  pr,
  expanded,
  onToggle,
}: {
  pr: GithubPr;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { Icon, color } = prStateStyle(pr.state);
  const repoShort = pr.repo.split("/")[1] ?? pr.repo;
  const time = formatRelativeTime(pr.updated_at ?? pr.created_at);

  return (
    <div
      onClick={onToggle}
      style={{
        cursor: "pointer",
        borderBottom: "1px solid var(--border-subtle)",
        background: expanded ? "var(--surface-secondary)" : "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          minHeight: 40,
        }}
      >
        <span style={{ color, flexShrink: 0 }}>
          <Icon size={16} />
        </span>
        <span
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "var(--text-xs)",
            flexShrink: 0,
          }}
        >
          #{pr.number}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: "var(--text-xs)",
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {pr.title}
        </span>
        <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)", flexShrink: 0 }}>
          {repoShort}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", flexShrink: 0 }}>
          {time}
        </span>
        <span
          style={{
            color: "var(--text-muted)",
            flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms",
            display: "flex",
          }}
        >
          <ChevronDownIcon size={14} />
        </span>
      </div>
      {expanded && <PrExpandedBody pr={pr} />}
    </div>
  );
}

function VirtualizedPrTimeline({ prs }: { prs: GithubPr[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const items: PrItem[] = buildDateGroupedItems(prs, (pr) => pr.updated_at ?? pr.created_at);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => items[i].kind === "header" ? 32 : 72,
    overscan: 5,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 0,
  });

  const toggle = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div ref={parentRef} style={{ height: "100%", overflowY: "auto" }}>
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const item = items[vRow.index];
          return (
            <div
              key={vRow.key}
              data-index={vRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vRow.start}px)`,
              }}
            >
              {item.kind === "header" ? (
                <DayHeader label={item.label} />
              ) : (
                <PrRow
                  pr={item.item}
                  expanded={expandedKeys.has(`${item.item.repo}#${item.item.number}`)}
                  onToggle={() => toggle(`${item.item.repo}#${item.item.number}`)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrTimeline({ prs }: { prs: GithubPr[] }) {
  if (prs.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)",
          fontSize: "var(--text-base)",
        }}
      >
        No pull requests.
      </div>
    );
  }

  if (typeof window === "undefined") {
    const items: PrItem[] = buildDateGroupedItems(prs, (pr) => pr.updated_at ?? pr.created_at);
    return (
      <div>
        {items.map((item, i) =>
          item.kind === "header" ? (
            <div key={item.key}>{item.label}</div>
          ) : (
            <PrRow key={i} pr={item.item} expanded={false} onToggle={() => {}} />
          ),
        )}
      </div>
    );
  }

  return <VirtualizedPrTimeline prs={prs} />;
}
