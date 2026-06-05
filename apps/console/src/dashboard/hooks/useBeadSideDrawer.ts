import { create } from "zustand";
import type { BeadIssue, Memory } from "../../types/beads.ts";

export type BeadInspectorTab = "overview" | "lineage" | "activity" | "evidence" | "github" | "memories" | "followups";

export interface BeadInspectorTarget {
  beadId: string;
  jobId?: string | null;
  issue?: BeadIssue | null;
}

interface BeadSideDrawerState {
  beadId: string | null;
  jobId: string | null;
  projectId: string | null;
  issueById: Map<string, BeadIssue>;
  fallbackIssue: BeadIssue | null;
  memories: Memory[];
  tab: BeadInspectorTab;
  backStack: BeadInspectorTarget[];
  open: (target: string | BeadInspectorTarget) => void;
  back: () => void;
  close: () => void;
  setTab: (tab: BeadInspectorTab) => void;
  setContext: (projectId: string | null, issueById: Map<string, BeadIssue>, memories?: Memory[]) => void;
}

export const useBeadSideDrawer = create<BeadSideDrawerState>((set) => ({
  beadId: null,
  jobId: null,
  projectId: null,
  issueById: new Map(),
  fallbackIssue: null,
  memories: [],
  tab: "overview",
  backStack: [],
  open: (target) => set((state) => {
    const next = typeof target === "string" ? { beadId: target } : target;
    const current = state.beadId ? { beadId: state.beadId, jobId: state.jobId, issue: state.fallbackIssue } : null;
    const backStack = current && current.beadId !== next.beadId ? [...state.backStack, current] : state.backStack;
    return {
      beadId: next.beadId,
      jobId: next.jobId ?? null,
      fallbackIssue: next.issue ?? null,
      tab: "overview",
      backStack,
    };
  }),
  back: () => set((state) => {
    const previous = state.backStack.at(-1);
    if (!previous) return state;
    return {
      beadId: previous.beadId,
      jobId: previous.jobId ?? null,
      fallbackIssue: previous.issue ?? null,
      tab: "overview",
      backStack: state.backStack.slice(0, -1),
    };
  }),
  close: () => set({ beadId: null, jobId: null, fallbackIssue: null, backStack: [] }),
  setTab: (tab) => set({ tab }),
  setContext: (projectId, issueById, memories = []) => set({ projectId, issueById, memories }),
}));

export const beadSideDrawer = {
  open: (target: string | BeadInspectorTarget) => useBeadSideDrawer.getState().open(target),
  close: () => useBeadSideDrawer.getState().close(),
};
