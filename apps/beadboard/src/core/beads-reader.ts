/**
 * Beads Reader - Reads issues and data from beads databases
 */

import { readFile } from "fs/promises";
import type { Database } from "bun:sqlite";
import type { BeadIssue, BeadDependency, Memory, Interaction, IssueFilters, BeadIssueDetail } from "../types/beads.ts";

export class BeadsReader {
  private columnCache = new Map<string, Set<string>>();

  constructor(private db: Database) {}

  async getIssues(filters: IssueFilters): Promise<BeadIssue[]> {
    const rows = this.queryIssues(filters, false);
    return rows.map((issue) => this.toIssue(issue));
  }

  async getIssue(issueId: string): Promise<BeadIssueDetail | null> {
    const rows = this.queryIssues({ limit: 1, offset: 0, search: undefined }, true, issueId);
    const issue = rows[0];
    if (!issue) return null;

    return {
      ...this.toIssue(issue),
      dependents: this.getDependents(issueId),
      source: "sqlite",
      sourceHealth: [{ kind: "sqlite", state: "available" }],
    };
  }

  async getClosedIssues(limit: number = 50): Promise<BeadIssue[]> {
    const rows = this.queryIssues({ status: ["closed"], limit, offset: 0 }, false, undefined, true);
    return rows.map((issue) => this.toIssue(issue));
  }

  async getMemories(knowledgePath: string): Promise<Memory[]> {
    try {
      const content = await readFile(knowledgePath, "utf-8");
      const lines = content.trim().split("\n");

      return lines.filter((line) => line.trim()).map((line) => {
        const data = JSON.parse(line);
        return {
          id: data.id,
          content: data.content,
          type: data.type || "learned",
          tags: data.tags || [],
          created_at: data.created_at,
          issue_id: data.issue_id,
          project_id: "",
        } as Memory;
      });
    } catch {
      return [];
    }
  }

  async getInteractions(interactionsPath: string): Promise<Interaction[]> {
    try {
      const content = await readFile(interactionsPath, "utf-8");
      const lines = content.trim().split("\n");

      return lines.filter((line) => line.trim()).map((line) => {
        const data = JSON.parse(line);
        return {
          id: data.id,
          kind: data.kind || "tool_call",
          created_at: data.created_at,
          actor: data.actor,
          issue_id: data.issue_id,
          model: data.model,
          tool_name: data.tool_name,
          exit_code: data.exit_code,
          project_id: "",
        } as Interaction;
      });
    } catch {
      return [];
    }
  }

  static inferAgent(model?: string): "claude" | "pi" | "qwen" | "gemini" | "other" {
    if (!model) return "other";
    const lower = model.toLowerCase();
    if (lower.includes("claude")) return "claude";
    if (lower.includes("qwen")) return "qwen";
    if (lower.includes("gemini")) return "gemini";
    if (lower.includes("gpt")) return "other";
    return "other";
  }

  private queryIssues(
    filters: IssueFilters,
    single: boolean,
    issueId?: string,
    closedOnly = false,
  ): Array<Record<string, unknown>> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (issueId) {
      conditions.push("id = $id");
      params.$id = issueId;
    }
    if (closedOnly) conditions.push("status = 'closed'");

    if (filters.status?.length) {
      const placeholders = filters.status.map((_, i) => `$status${i}`).join(", ");
      conditions.push(`status IN (${placeholders})`);
      filters.status.forEach((value, index) => (params[`$status${index}`] = value));
    }
    if (filters.priority?.length) {
      const placeholders = filters.priority.map((_, i) => `$priority${i}`).join(", ");
      conditions.push(`priority IN (${placeholders})`);
      filters.priority.forEach((value, index) => (params[`$priority${index}`] = value));
    }
    if (filters.issue_type?.length) {
      const placeholders = filters.issue_type.map((_, i) => `$type${i}`).join(", ");
      conditions.push(`issue_type IN (${placeholders})`);
      filters.issue_type.forEach((value, index) => (params[`$type${index}`] = value));
    }
    if (filters.search) {
      conditions.push("(title LIKE $search OR description LIKE $search)");
      params.$search = `%${filters.search}%`;
    }

    params.$limit = filters.limit ?? (single ? 1 : 100);
    params.$offset = filters.offset ?? 0;

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return (this.db
      .query(`SELECT * FROM issues ${where} ORDER BY priority ASC, created_at DESC LIMIT $limit OFFSET $offset`)
      .all(params as any) as Array<Record<string, unknown>>);
  }

  private toIssue(issue: Record<string, unknown>): BeadIssue {
    const issueId = String(issue.id ?? "");
    return {
      id: issueId,
      title: String(issue.title ?? ""),
      description: issue.description == null ? null : String(issue.description),
      status: String(issue.status ?? "open") as BeadIssue["status"],
      priority: Number(issue.priority ?? 2) as BeadIssue["priority"],
      issue_type: String(issue.issue_type ?? "task") as BeadIssue["issue_type"],
      owner: issue.owner == null ? null : String(issue.owner),
      created_at: String(issue.created_at ?? ""),
      created_by: issue.created_by == null ? null : String(issue.created_by),
      updated_at: String(issue.updated_at ?? issue.created_at ?? ""),
      closed_at: issue.closed_at == null ? undefined : String(issue.closed_at),
      close_reason: issue.close_reason == null ? undefined : String(issue.close_reason),
      project_id: "",
      dependencies: this.getDependencies(issueId),
      parent_id: issue.parent_id == null ? undefined : String(issue.parent_id),
      related_ids: this.getRelatedIds(issueId),
      labels: this.getLabels(issueId),
    };
  }

  private getDependencies(issueId: string): BeadDependency[] {
    const rows = this.db
      .query(`SELECT d.to_issue, d.dependency_type, i.title, i.status FROM dependencies d JOIN issues i ON d.to_issue = i.id WHERE d.from_issue = $id`)
      .all({ $id: issueId }) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.to_issue ?? ""),
      title: String(row.title ?? ""),
      status: String(row.status ?? "open") as BeadDependency["status"],
      dependency_type: String(row.dependency_type ?? "blocks") as BeadDependency["dependency_type"],
    }));
  }

  private getDependents(issueId: string): BeadDependency[] {
    const rows = this.db
      .query(`SELECT d.from_issue, d.dependency_type, i.title, i.status FROM dependencies d JOIN issues i ON d.from_issue = i.id WHERE d.to_issue = $id`)
      .all({ $id: issueId }) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.from_issue ?? ""),
      title: String(row.title ?? ""),
      status: String(row.status ?? "open") as BeadDependency["status"],
      dependency_type: String(row.dependency_type ?? "blocked_by") as BeadDependency["dependency_type"],
    }));
  }

  private getRelatedIds(issueId: string): string[] {
    try {
      const rows = this.db
        .query(`SELECT related_issue_id FROM issue_related WHERE issue_id = $id`)
        .all({ $id: issueId } as any) as Array<Record<string, unknown>>;

      return rows.map((row) => String(row.related_issue_id ?? "")).filter(Boolean);
    } catch {
      return [];
    }
  }

  private getLabels(issueId: string): string[] {
    const rows = this.db
      .query(`SELECT label FROM issue_labels WHERE issue_id = $id`)
      .all({ $id: issueId }) as Array<Record<string, unknown>>;

    return rows.map((row) => String(row.label ?? "")).filter(Boolean);
  }
}
