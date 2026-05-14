import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FilterIcon, InboxIcon, ProjectIcon, ArchiveIcon, DatabaseIcon, CheckIcon } from "@primer/octicons-react";
import { IssueFeed } from "./components/beads/IssueFeed.tsx";
import { KanbanBoard } from "./components/beads/KanbanBoard.tsx";
import { ProjectRail, type ProjectRailStats } from "./components/beads/ProjectRail.tsx";
import { useBeadsStore } from "./stores/beads.ts";
import { api } from "./lib/api.ts";
import type { BeadIssue, BeadIssueDetail, Memory, Interaction } from "../types/beads.ts";

type Tab = "issues" | "board" | "closed" | "memories" | "triage";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "issues", label: "Feed" },
  { id: "board", label: "Board" },
  { id: "closed", label: "Closed" },
  { id: "memories", label: "Memories" },
  { id: "triage", label: "Triage" },
];

const STALE_DAYS = 7;
const VELOCITY_WINDOWS_DAYS = [7, 30] as const;
const PRIORITY_WEIGHT: Record<number, number> = { 0: 1, 1: 0.75, 2: 0.5, 3: 0.25, 4: 0 };

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("issues");
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssueDetail, setSelectedIssueDetail] = useState<BeadIssueDetail | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [statsByProject, setStatsByProject] = useState<Record<string, ProjectRailStats | undefined>>({});
  const [loadingProjectStats, setLoadingProjectStats] = useState(false);
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const requestIdRef = useRef(0);

  const {
    projects,
    selectedProjectId,
    issues,
    closedIssues,
    memories,
    loading,
    error,
    setProjects,
    selectProject,
    setIssues,
    setClosedIssues,
    setMemories,
    setLoading,
    setError,
  } = useBeadsStore();

  useEffect(() => {
    async function loadProjects() {
      setLoading(true);
      try {
        const projs = await api.getProjects();
        setProjects(projs);
        if (projs.length > 0 && !selectedProjectId) {
          selectProject(projs[0].id);
        }
      } catch (err) {
        setError("Failed to load projects");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  const loadProjectData = useCallback(async (projectId: string) => {
    setLoading(true);
    setSelectedIssueId(null);
    setSelectedIssueDetail(null);
    try {
      const [issueData, closedData, memoryData, interactionData] = await Promise.all([
        api.getIssues(projectId),
        api.getClosedIssues(projectId, 50),
        api.getMemories(projectId),
        api.getInteractions(projectId),
      ]);
      setIssues(issueData);
      setClosedIssues(closedData);
      setMemories(memoryData);
      setInteractions(interactionData);
    } catch (err) {
      setError("Failed to load project data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [setIssues, setClosedIssues, setMemories, setLoading, setError]);

  useEffect(() => {
    if (selectedProjectId) loadProjectData(selectedProjectId);
  }, [selectedProjectId, loadProjectData]);

  useEffect(() => {
    if (projects.length === 0) {
      setStatsByProject({});
      return;
    }

    let cancelled = false;
    async function loadProjectStats() {
      setLoadingProjectStats(true);
      const entries = await Promise.all(projects.map(async (project) => {
        try {
          const stats = await api.getStats(project.id);
          return [project.id, stats] as const;
        } catch (err) {
          console.error(`Failed to load stats for ${project.id}`, err);
          return [project.id, undefined] as const;
        }
      }));

      if (!cancelled) {
        setStatsByProject(Object.fromEntries(entries));
        setLoadingProjectStats(false);
      }
    }

    loadProjectStats();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const handleIssueSelect = useCallback(async (issue: BeadIssue) => {
    if (!selectedProjectId) return;
    if (loadingDetailId === issue.id) return;
    if (selectedIssueId === issue.id) {
      setSelectedIssueId(null);
      setSelectedIssueDetail(null);
      return;
    }

    setSelectedIssueId(issue.id);
    setSelectedIssueDetail(null);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingDetailId(issue.id);
    try {
      const detail = await api.getIssue(selectedProjectId, issue.id);
      if (requestIdRef.current !== requestId) return;
      setSelectedIssueDetail(detail ?? null);
    } catch (err) {
      if (requestIdRef.current === requestId) {
        console.error(err);
        setSelectedIssueDetail(null);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoadingDetailId(null);
      }
    }
  }, [loadingDetailId, selectedIssueId, selectedProjectId]);

  const getAgentForIssue = useCallback((issueId: string): string | null => {
    const issueInteractions = interactions.filter((i) => i.issue_id === issueId);
    if (issueInteractions.length === 0) return null;
    const model = issueInteractions[0]?.model;
    if (!model) return null;
    const lower = model.toLowerCase();
    if (lower.includes("claude")) return "claude";
    if (lower.includes("qwen")) return "qwen";
    if (lower.includes("gemini")) return "gemini";
    if (lower.includes("gpt")) return "gpt";
    return null;
  }, [interactions]);

  const visibleIssues = useMemo(() => (showOpenOnly ? issues.filter((issue) => issue.status !== "closed") : issues), [issues, showOpenOnly]);
  const visibleClosedIssues = useMemo(() => (showOpenOnly ? closedIssues.filter((issue) => issue.status === "closed") : closedIssues), [closedIssues, showOpenOnly]);
  const triage = useMemo(() => buildTriageView(issues, closedIssues), [closedIssues, issues]);
  const segmentCounts = useMemo(() => ({ feed: visibleIssues.length, board: visibleIssues.length, closed: visibleClosedIssues.length, memories: memories.length, triage: triage.topPicks.length }), [memories.length, triage.topPicks.length, visibleClosedIssues.length, visibleIssues.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>
      <header className="module-header">
        <div className="module-segments">
          {TABS.map((tab) => {
            const Icon = tab.id === "issues" ? InboxIcon : tab.id === "board" ? ProjectIcon : tab.id === "closed" ? ArchiveIcon : DatabaseIcon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`module-segment ${activeTab === tab.id ? "is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={12} />
                <span>{tab.label}</span>
                <span className="module-count">{segmentCounts[tab.id]}</span>
              </button>
            );
          })}
        </div>
        <div className="module-actions">
          <button type="button" className={`module-icon-btn ${showOpenOnly ? "is-active" : ""}`} onClick={() => setShowOpenOnly((value) => !value)} aria-pressed={showOpenOnly}>
            <FilterIcon size={12} /> Filter
          </button>
        </div>
        {loading && <span className="module-status">Loading...</span>}
        {error && <span className="module-status is-error">{error}</span>}
      </header>

      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <ProjectRail
          projects={projects}
          selectedProjectId={selectedProjectId}
          statsByProject={statsByProject}
          loadingStats={loadingProjectStats}
          onSelectProject={selectProject}
        />

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {activeTab === "issues" && (
            <IssueFeed
              issues={visibleIssues}
              selectedIssueId={selectedIssueId}
              selectedIssueDetail={selectedIssueDetail}
              loadingDetailId={loadingDetailId}
              onIssueSelect={handleIssueSelect}
              getAgent={getAgentForIssue}
            />
          )}
          {activeTab === "board" && <KanbanBoard issues={visibleIssues} projectId={selectedProjectId} interactions={interactions} getAgent={getAgentForIssue} />}
          {activeTab === "closed" && <ClosedIssuesPanel issues={visibleClosedIssues} getAgent={getAgentForIssue} />}
          {activeTab === "memories" && <MemoriesPanel memories={memories} />}
          {activeTab === "triage" && <TriagePanel triage={triage} />}
        </div>
      </main>
    </div>
  );
}

function ClosedIssuesPanel({ issues, getAgent }: { issues: BeadIssue[]; getAgent: (id: string) => string | null; }) {
  return <div style={{ padding: 12, color: 'var(--text-secondary)' }}><h2 style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Closed Issues</h2>{issues.length === 0 ? <p>No closed issues</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{issues.map(issue => <div key={issue.id} style={{ padding: 'var(--spacing-sm)', background: 'var(--surface-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}><span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{issue.id}</span>{getAgent(issue.id) && <AgentBadge agent={getAgent(issue.id)!} />}</div><div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{issue.title}</div>{issue.close_reason && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}><CheckIcon size={12} />{issue.close_reason}</div>}</div>)}</div>}</div>;
}

function MemoriesPanel({ memories }: { memories: Memory[] }) {
  return <div style={{ padding: 12, color: 'var(--text-secondary)' }}><h2 style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Memories</h2>{memories.length === 0 ? <p>No memories stored. Use <code style={{ background: 'var(--surface-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>bd remember "insight"</code> to add one.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{memories.map(memory => <div key={memory.id} style={{ padding: 'var(--spacing-sm)', background: 'var(--surface-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}><div style={{ display: 'flex', gap: 6, marginBottom: 2 }}><span style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', background: 'var(--surface-tertiary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>{memory.type}</span>{memory.tags.map(tag => <span key={tag} style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-blue)' }}>#{tag}</span>)}</div><div style={{ color: 'var(--text-primary)' }}>{memory.content}</div>{memory.issue_id && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>Issue: {memory.issue_id}</div>}</div>)}</div>}</div>;
}

function AgentBadge({ agent }: { agent: string }) {
  return <span style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', background: 'var(--surface-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{agent}</span>;
}

type TriageView = {
  topPicks: TriageIssue[];
  quickWins: TriageIssue[];
  staleIssues: TriageIssue[];
  velocity: { last7: number; last30: number };
  health: {
    countsByStatus: Record<string, number>;
    countsByType: Record<string, number>;
    countsByPriority: Record<string, number>;
  };
};

type TriageIssue = BeadIssue & { score: number; daysIdle: number; blockerCount: number };

function TriagePanel({ triage }: { triage: TriageView }) {
  return (
    <div style={{ padding: 12, display: 'grid', gap: 12 }}>
      <section style={panelStyle}>
        <h2 style={sectionTitleStyle}>Top picks</h2>
        <IssueList issues={triage.topPicks} emptyText="No open issues" />
      </section>
      <section style={panelStyle}>
        <h2 style={sectionTitleStyle}>Quick wins</h2>
        <IssueList issues={triage.quickWins} emptyText="No quick wins" />
      </section>
      <section style={panelStyle}>
        <h2 style={sectionTitleStyle}>Stale issues</h2>
        <IssueList issues={triage.staleIssues} emptyText="No stale issues" />
      </section>
      <section style={panelStyle}>
        <h2 style={sectionTitleStyle}>Velocity</h2>
        <div style={statsGridStyle}>
          <StatCard label="Last 7 days" value={String(triage.velocity.last7)} />
          <StatCard label="Last 30 days" value={String(triage.velocity.last30)} />
        </div>
      </section>
      <section style={panelStyle}>
        <h2 style={sectionTitleStyle}>Project health</h2>
        <HealthGrid triage={triage} />
      </section>
    </div>
  );
}

function IssueList({ issues, emptyText }: { issues: TriageIssue[]; emptyText: string; }) {
  if (issues.length === 0) return <div style={emptyStyle}>{emptyText}</div>;
  return <div style={{ display: 'grid', gap: 8 }}>{issues.map((issue) => <div key={issue.id} style={issueCardStyle}><div style={issueRowStyle}><span style={issueIdStyle}>{issue.id}</span><span style={issueScoreStyle}>{issue.score.toFixed(3)}</span></div><div style={issueTitleStyle}>{issue.title}</div><div style={issueMetaStyle}>P{issue.priority} • {issue.daysIdle}d idle • blockers {issue.blockerCount}</div></div>)}</div>;
}

function HealthGrid({ triage }: { triage: TriageView }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <StatGrid title="By status" items={triage.health.countsByStatus} />
      <StatGrid title="By type" items={triage.health.countsByType} />
      <StatGrid title="By priority" items={triage.health.countsByPriority} />
    </div>
  );
}

function StatGrid({ title, items }: { title: string; items: Record<string, number> }) {
  return <div><div style={sectionTitleStyle}>{title}</div><div style={statsGridStyle}>{Object.entries(items).map(([label, value]) => <StatCard key={label} label={label} value={String(value)} />)}</div></div>;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <div style={statCardStyle}><div style={issueMetaStyle}>{label}</div><div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</div></div>;
}

const panelStyle = { background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', padding: 12 } as const;
const sectionTitleStyle = { marginBottom: 8, color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600 } as const;
const statsGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 } as const;
const statCardStyle = { background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', padding: 8 } as const;
const emptyStyle = { color: 'var(--text-muted)', fontSize: 'var(--text-sm)' } as const;
const issueCardStyle = { background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', padding: 8 } as const;
const issueRowStyle = { display: 'flex', justifyContent: 'space-between', gap: 8 } as const;
const issueIdStyle = { fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' } as const;
const issueScoreStyle = { color: 'var(--accent)', fontSize: 'var(--text-xs)' } as const;
const issueTitleStyle = { color: 'var(--text-primary)', fontWeight: 500, marginTop: 2 } as const;
const issueMetaStyle = { color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginTop: 2 } as const;

function buildTriageView(issues: BeadIssue[], closedIssues: BeadIssue[]): TriageView {
  const openIssues = issues.filter((issue) => issue.status !== "closed");
  const scoredIssues = openIssues.map((issue) => ({ ...issue, ...getTriageSignals(issue, openIssues) }));
  const topPicks = [...scoredIssues].sort((left, right) => right.score - left.score).slice(0, 5);
  const quickWins = scoredIssues.filter((issue) => issue.priority >= 2 && issue.blockerCount === 0).sort((left, right) => left.priority - right.priority || right.score - left.score).slice(0, 5);
  const staleIssues = scoredIssues.filter((issue) => issue.daysIdle >= STALE_DAYS).sort((left, right) => right.daysIdle - left.daysIdle || right.score - left.score).slice(0, 5);
  return {
    topPicks,
    quickWins,
    staleIssues,
    velocity: getVelocity(closedIssues),
    health: getHealthCounts(issues, closedIssues),
  };
}

function getTriageSignals(issue: BeadIssue, openIssues: BeadIssue[]) {
  const daysIdle = getDaysSince(issue.updated_at ?? issue.created_at);
  const blockerCount = issue.dependencies.filter((dependency) => dependency.dependency_type === "blocks" || dependency.dependency_type === "blocked_by").length;
  const openCount = openIssues.length;
  const priorityWeight = PRIORITY_WEIGHT[issue.priority as number] ?? 0;
  const stalenessWeight = Math.min(daysIdle / 30, 1);
  const openLoadWeight = Math.min(openCount / 100, 1);
  return { daysIdle, blockerCount, score: priorityWeight + stalenessWeight + openLoadWeight };
}

function getDaysSince(isoDate: string): number {
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function getVelocity(closedIssues: BeadIssue[]) {
  const now = Date.now();
  const closedAt = (issue: BeadIssue) => new Date(issue.closed_at ?? issue.updated_at).getTime();
  return {
    last7: closedIssues.filter((issue) => now - closedAt(issue) <= VELOCITY_WINDOWS_DAYS[0] * 86_400_000).length,
    last30: closedIssues.filter((issue) => now - closedAt(issue) <= VELOCITY_WINDOWS_DAYS[1] * 86_400_000).length,
  };
}

function getHealthCounts(issues: BeadIssue[], closedIssues: BeadIssue[]) {
  const allIssues = [...issues, ...closedIssues];
  return {
    countsByStatus: countBy(allIssues, (issue) => issue.status),
    countsByType: countBy(allIssues, (issue) => issue.issue_type),
    countsByPriority: countBy(allIssues, (issue) => `P${issue.priority}`),
  };
}

function countBy<T>(items: T[], keyForItem: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
