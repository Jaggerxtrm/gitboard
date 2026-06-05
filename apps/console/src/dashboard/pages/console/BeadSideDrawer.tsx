import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon, XIcon } from "@primer/octicons-react";
import type { BeadDependency, BeadIssue, BeadIssueDetail, Memory } from "../../../types/beads.ts";
import { useBeadSideDrawer, type BeadInspectorTab } from "../../hooks/useBeadSideDrawer.ts";
import { substrateApi } from "../../lib/beads.ts";
import { useShellStore } from "../../stores/shell.ts";
import { useSpecialistOwnership } from "../../hooks/useSpecialistOwnership.ts";
import { useSpecialistHistory } from "../../hooks/useSpecialistHistory.ts";
import { BeadActivityPane } from "../../components/specialists/BeadActivityPane.tsx";
import { IssueDossier } from "../../components/beads/IssueFeed.tsx";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TABS: Array<{ id: BeadInspectorTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "lineage", label: "Lineage" },
  { id: "activity", label: "Activity" },
  { id: "evidence", label: "Evidence" },
  { id: "github", label: "GitHub" },
  { id: "memories", label: "Memories" },
  { id: "followups", label: "Followups" },
];

export function BeadSideDrawer({ onClose }: { onClose?: () => void } = {}) {
  const beadId = useBeadSideDrawer((s) => s.beadId);
  const jobId = useBeadSideDrawer((s) => s.jobId);
  const projectId = useBeadSideDrawer((s) => s.projectId);
  const issueById = useBeadSideDrawer((s) => s.issueById);
  const fallbackIssue = useBeadSideDrawer((s) => s.fallbackIssue);
  const memories = useBeadSideDrawer((s) => s.memories);
  const tab = useBeadSideDrawer((s) => s.tab);
  const backStack = useBeadSideDrawer((s) => s.backStack);
  const close = useBeadSideDrawer((s) => s.close);
  const back = useBeadSideDrawer((s) => s.back);
  const setTab = useBeadSideDrawer((s) => s.setTab);
  const open = useBeadSideDrawer((s) => s.open);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const issue = beadId ? issueById.get(beadId) ?? fallbackIssue : null;
  const ownership = useSpecialistOwnership(beadId);
  const history = useSpecialistHistory(beadId);
  const [detail, setDetail] = useState<BeadIssueDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!beadId || !projectId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void substrateApi.getIssue(projectId, beadId).then((next) => {
      if (!cancelled) setDetail(next);
    }).catch(() => {
      if (!cancelled) setDetail(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [beadId, projectId]);

  const handleClose = useCallback(() => {
    onClose?.();
    close();
  }, [close, onClose]);

  const handleKey = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [handleClose]);

  useEffect(() => {
    if (!beadId) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [beadId, handleKey]);

  const goToFeed = useCallback(() => {
    const shell = useShellStore.getState();
    shell.setSurface("console");
    shell.setTab("feed");
    close();
    queueMicrotask(() => document.querySelector(`[data-bead-id="${CSS.escape(beadId ?? "")}"]`)?.scrollIntoView({ block: "center" }));
  }, [beadId, close]);

  const relatedMemories = useMemo(() => beadId ? memories.filter((memory) => memory.issue_id === beadId || memory.content.includes(beadId)) : [], [beadId, memories]);

  if (!beadId || !issue) return null;

  const tabs = withCounts(TABS, {
    lineage: countLineage(issue, detail),
    activity: history.count,
    evidence: history.count,
    memories: relatedMemories.length,
    followups: countFollowups(issue, detail),
  });

  return createPortal(
    <div className="bead-side-drawer-backdrop" onClick={handleClose}>
      <aside className="bead-side-drawer" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="bead-side-drawer-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <header className="bead-side-drawer-header">
          <div className="bead-side-drawer-headline">
            {backStack.length > 0 ? <button type="button" className="bead-side-drawer-back" aria-label="Back to previous bead" onClick={back}><ArrowLeftIcon size={14} /></button> : null}
            <span className="bead-side-drawer-id">{issue.id}</span>
            <span id="bead-side-drawer-title" className="bead-side-drawer-title">{issue.title}</span>
          </div>
          <button type="button" className="bead-side-drawer-close" aria-label="close bead inspector" onClick={handleClose}><XIcon size={14} /></button>
        </header>
        <div className="bead-side-drawer-body">
          <div className="bead-dossier-meta-strip">
            <span><b>Priority</b><strong>P{issue.priority}</strong></span>
            <span><b>Type</b><strong>{String(issue.issue_type)}</strong></span>
            <span><b>Status</b><strong>{issue.status}</strong></span>
            {ownership ? <span><b>Owner</b><strong>{ownership.role}</strong></span> : null}
            {history.count > 0 ? <span><b>History</b><strong>{history.count} run{history.count === 1 ? "" : "s"}</strong></span> : null}
          </div>
          <nav className="bead-inspector-tabs" role="tablist" aria-label="Bead inspector tabs">
            {tabs.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "bead-inspector-tab is-active" : "bead-inspector-tab"} onClick={() => setTab(item.id)}>
                <span>{item.label}</span>
                {item.count ? <b>{item.count}</b> : null}
              </button>
            ))}
          </nav>
          <div className="bead-inspector-panel" role="tabpanel">
            {renderTab(tab, {
              issue,
              detail,
              loading,
              projectId,
              issueById,
              memories: relatedMemories,
              history,
              jobId,
              onOpenBead: (nextIssue) => open({ beadId: nextIssue.id, issue: nextIssue }),
            })}
          </div>
        </div>
        <footer className="bead-side-drawer-footer">
          <button type="button" className="ide-btn" onClick={goToFeed}>Open in Feed</button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

function renderTab(tab: BeadInspectorTab, props: {
  issue: BeadIssue;
  detail: BeadIssueDetail | null;
  loading: boolean;
  projectId: string | null;
  issueById: Map<string, BeadIssue>;
  memories: Memory[];
  history: ReturnType<typeof useSpecialistHistory>;
  jobId: string | null;
  onOpenBead: (issue: BeadIssue) => void;
}): ReactNode {
  switch (tab) {
    case "overview":
      return <IssueDossier id={`bead-side-drawer-${props.issue.id}`} issue={props.issue} detail={props.detail} loading={props.loading} projectId={props.projectId} issueById={props.issueById} />;
    case "lineage":
      return <LineageTab issue={props.issue} detail={props.detail} issueById={props.issueById} onOpenBead={props.onOpenBead} />;
    case "activity":
      return <BeadActivityPane key={`${props.issue.id}:${props.jobId ?? ""}`} beadId={props.issue.id} jobIdHint={props.jobId} />;
    case "evidence":
      return <EvidenceTab history={props.history} />;
    case "github":
      return <EmptyTab title="No linked GitHub evidence" body="PR, commit, and issue references will appear here when the materialized evidence refs include this bead." />;
    case "memories":
      return <MemoriesTab memories={props.memories} />;
    case "followups":
      return <FollowupsTab issue={props.issue} detail={props.detail} issueById={props.issueById} onOpenBead={props.onOpenBead} />;
  }
}

function LineageTab({ issue, detail, issueById, onOpenBead }: { issue: BeadIssue; detail: BeadIssueDetail | null; issueById: Map<string, BeadIssue>; onOpenBead: (issue: BeadIssue) => void }) {
  const groups = [
    { title: "Dependencies", items: detail?.dependencies ?? issue.dependencies },
    { title: "Dependents", items: detail?.dependents ?? [] },
    { title: "Children", items: detail?.children ?? [] },
    { title: "Related", items: (detail?.related_ids ?? issue.related_ids ?? []).map((id) => relationFromIssue(id, issueById)) },
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) return <EmptyTab title="No lineage" body="This bead has no dependency, child, dependent, or related records in the current state." />;

  return (
    <div className="bead-inspector-stack">
      {groups.map((group) => (
        <section key={group.title} className="bead-inspector-section">
          <div className="bead-section-title">{group.title}</div>
          <div className="bead-inspector-link-list">
            {group.items.map((item) => <LineageButton key={`${group.title}:${item.id}:${item.dependency_type}`} dependency={item} issue={issueById.get(item.id) ?? null} onOpenBead={onOpenBead} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function FollowupsTab({ issue, detail, issueById, onOpenBead }: { issue: BeadIssue; detail: BeadIssueDetail | null; issueById: Map<string, BeadIssue>; onOpenBead: (issue: BeadIssue) => void }) {
  const items = [
    ...(detail?.children ?? []),
    ...(detail?.dependents ?? []).filter((dep) => dep.dependency_type === "discovered-from" || dep.dependency_type === "tracks" || dep.dependency_type === "validates"),
  ];
  if (items.length === 0) return <EmptyTab title="No followups" body="No child, discovered-from, tracks, or validates followup beads are linked yet." />;
  return (
    <div className="bead-inspector-link-list">
      {items.map((item) => <LineageButton key={`followup:${issue.id}:${item.id}:${item.dependency_type}`} dependency={item} issue={issueById.get(item.id) ?? null} onOpenBead={onOpenBead} />)}
    </div>
  );
}

function LineageButton({ dependency, issue, onOpenBead }: { dependency: BeadDependency; issue: BeadIssue | null; onOpenBead: (issue: BeadIssue) => void }) {
  const target = issue ?? issueFromDependency(dependency);
  return (
    <button type="button" className="bead-inspector-link" onClick={() => onOpenBead(target)}>
      <span className="bead-inspector-link-id">{dependency.id}</span>
      <span className="bead-inspector-link-title">{target.title}</span>
      <span className="bead-inspector-link-meta">{dependency.dependency_type} / {target.status}</span>
    </button>
  );
}

function EvidenceTab({ history }: { history: ReturnType<typeof useSpecialistHistory> }) {
  if (history.loading) return <EmptyTab title="Loading evidence" body="Specialist history is loading." />;
  if (history.jobs.length === 0) return <EmptyTab title="No specialist evidence" body="Terminal feeds, run results, forensic events, and evidence refs will collect here as jobs land." />;
  return (
    <div className="bead-inspector-stack">
      {history.jobs.map((job) => (
        <article key={`${job.repoSlug}:${job.jobId ?? job.beadId}:${job.updatedAt}`} className="bead-inspector-evidence-row">
          <span className="bead-inspector-link-id">{job.jobId ?? job.beadId}</span>
          <span className="bead-inspector-link-title">{job.specialist ?? job.chainKind ?? "specialist"}</span>
          <span className="bead-inspector-link-meta">{job.status} / {formatElapsed(job.updatedAt)}</span>
          {job.lastOutput ? <p>{truncate(job.lastOutput, 220)}</p> : null}
        </article>
      ))}
    </div>
  );
}

function MemoriesTab({ memories }: { memories: Memory[] }) {
  if (memories.length === 0) return <EmptyTab title="No memories" body="No project memory currently references this bead." />;
  return (
    <div className="bead-inspector-stack">
      {memories.map((memory) => (
        <article key={memory.id} className="bead-inspector-memory">
          <span className="bead-inspector-link-meta">{memory.type} / {formatCompactDate(memory.created_at)}</span>
          <p>{memory.content}</p>
          {memory.tags.length > 0 ? <div className="bead-label-strip">{memory.tags.map((tag) => <span key={tag} className="bead-label-chip">{tag}</span>)}</div> : null}
        </article>
      ))}
    </div>
  );
}

function EmptyTab({ title, body }: { title: string; body: string }) {
  return <div className="bead-inspector-empty"><b>{title}</b><span>{body}</span></div>;
}

function withCounts(items: typeof TABS, counts: Partial<Record<BeadInspectorTab, number>>) {
  return items.map((item) => ({ ...item, count: counts[item.id] ?? 0 }));
}

function countLineage(issue: BeadIssue, detail: BeadIssueDetail | null): number {
  return (detail?.dependencies ?? issue.dependencies).length + (detail?.dependents ?? []).length + (detail?.children ?? []).length + (detail?.related_ids ?? issue.related_ids ?? []).length;
}

function countFollowups(_issue: BeadIssue, detail: BeadIssueDetail | null): number {
  return (detail?.children ?? []).length + (detail?.dependents ?? []).filter((dep) => dep.dependency_type === "discovered-from" || dep.dependency_type === "tracks" || dep.dependency_type === "validates").length;
}

function relationFromIssue(id: string, issueById: Map<string, BeadIssue>): BeadDependency {
  const issue = issueById.get(id);
  return {
    id,
    title: issue?.title ?? id,
    status: issue?.status ?? "open",
    issue_type: issue?.issue_type,
    dependency_type: "related",
  };
}

function issueFromDependency(dependency: BeadDependency): BeadIssue {
  return {
    id: dependency.id,
    title: dependency.title || dependency.id,
    description: null,
    status: dependency.status,
    priority: 3,
    issue_type: dependency.issue_type ?? "task",
    owner: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dependencies: [],
    project_id: "",
    created_by: null,
    related_ids: [],
    labels: [],
  };
}

function formatCompactDate(iso: string | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatElapsed(updatedAt: string): string {
  const delta = Date.now() - Date.parse(updatedAt);
  if (!Number.isFinite(delta) || delta < 0) return "now";
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function truncate(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}
