/**
 * Zustand store for beads dashboard state
 */

import { create } from "zustand";
import type { BeadIssue, BeadsProject, Memory, AgentSession } from "../../types/beads.ts";

export interface BeadsState {
  // Projects
  projects: BeadsProject[];
  selectedProjectId: string | null;
  
  // Issues
  issues: BeadIssue[];
  closedIssues: BeadIssue[];
  selectedIssue: BeadIssue | null;
  
  // Memories
  memories: Memory[];
  
  // Agent sessions
  agentSessions: AgentSession[];
  
  // UI state
  loading: boolean;
  error: string | null;
  
  // Actions
  setProjects: (projects: BeadsProject[]) => void;
  selectProject: (id: string | null) => void;
  setIssues: (issues: BeadIssue[]) => void;
  setClosedIssues: (issues: BeadIssue[]) => void;
  selectIssue: (issue: BeadIssue | null) => void;
  setMemories: (memories: Memory[]) => void;
  setAgentSessions: (sessions: AgentSession[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useBeadsStore = create<BeadsState>((set) => ({
  projects: [],
  selectedProjectId: null,
  issues: [],
  closedIssues: [],
  selectedIssue: null,
  memories: [],
  agentSessions: [],
  loading: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setIssues: (issues) => set({ issues }),
  setClosedIssues: (closedIssues) => set({ closedIssues }),
  selectIssue: (issue) => set({ selectedIssue: issue }),
  setMemories: (memories) => set({ memories }),
  setAgentSessions: (agentSessions) => set({ agentSessions }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
