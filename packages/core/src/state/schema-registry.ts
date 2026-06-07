export interface StateSchemaDefinition {
  name: string;
  version: number;
  tables: readonly string[];
  description?: string;
}

export class StateSchemaRegistry {
  private readonly definitions = new Map<string, StateSchemaDefinition>();

  constructor(definitions: readonly StateSchemaDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: StateSchemaDefinition): void {
    if (!definition.name.trim()) throw new Error("schema name is required");
    if (!Number.isInteger(definition.version) || definition.version < 1) throw new Error(`invalid schema version for ${definition.name}`);
    this.definitions.set(definition.name, Object.freeze({ ...definition, tables: [...definition.tables] }));
  }

  get(name: string): StateSchemaDefinition | undefined {
    return this.definitions.get(name);
  }

  list(): StateSchemaDefinition[] {
    return [...this.definitions.values()].sort((left, right) => left.name.localeCompare(right.name));
  }
}

export function createDefaultStateSchemaRegistry(): StateSchemaRegistry {
  return new StateSchemaRegistry([
    {
      name: "runtime",
      version: 1,
      tables: ["sources", "materialization_state", "xtrm_forensic_events", "xtrm_evidence_refs"],
      description: "Local runtime state and materializer cursor/evidence tables.",
    },
    {
      name: "console-read-models",
      version: 1,
      tables: ["substrate_issues", "substrate_dependencies", "substrate_issue_edges", "specialist_jobs", "specialist_job_events"],
      description: "Bridge-era Console read models that will be replaced by native daemon projections.",
    },
    {
      name: "github-adapter",
      version: 1,
      tables: ["github_events", "github_commits", "github_repos", "github_prs", "github_issues", "github_releases", "github_repo_poll_state"],
      description: "Durable GitHub adapter state; not part of temporary Beads/Specialists bridge retirement.",
    },
  ]);
}
