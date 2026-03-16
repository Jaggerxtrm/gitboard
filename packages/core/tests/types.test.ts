import { describe, it, expect } from "vitest";
import type { 
  Status, 
  Priority, 
  IssueType, 
  ID, 
  Timestamp,
  BeadIssue,
  LinkedPr,
  AgentSession 
} from "../src/types/common.ts";

describe("Type definitions", () => {
  it("Status type allows valid values", () => {
    const statuses: Status[] = ["open", "in_progress", "blocked", "in_review", "closed"];
    expect(statuses.length).toBe(5);
  });

  it("Priority type allows 0-4", () => {
    const priorities: Priority[] = [0, 1, 2, 3, 4];
    expect(priorities.length).toBe(5);
  });

  it("IssueType type allows valid values", () => {
    const types: IssueType[] = ["bug", "feature", "task", "epic", "chore"];
    expect(types.length).toBe(5);
  });

  it("ID type is string", () => {
    const id: ID = "forge-123";
    expect(typeof id).toBe("string");
  });

  it("Timestamp type is string", () => {
    const ts: Timestamp = new Date().toISOString();
    expect(typeof ts).toBe("string");
  });

  it("BeadIssue interface compiles", () => {
    const issue: BeadIssue = {
      id: "forge-123",
      title: "Test issue",
      description: "Test description",
      status: "open",
      priority: 2,
      issue_type: "task",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      dependencies: [],
      linkedPrs: [],
      agentSessions: [],
    };
    expect(issue.id).toBe("forge-123");
  });

  it("LinkedPr interface compiles", () => {
    const pr: LinkedPr = {
      repo: "owner/repo",
      number: 42,
      state: "open",
      url: "https://github.com/owner/repo/pull/42",
    };
    expect(pr.number).toBe(42);
  });

  it("AgentSession interface compiles", () => {
    const session: AgentSession = {
      id: "session-123",
      agent: "claude",
      model: "claude-3-opus",
      started_at: new Date().toISOString(),
      issue_ids: ["forge-123"],
      tool_calls: 5,
    };
    expect(session.agent).toBe("claude");
  });
});
