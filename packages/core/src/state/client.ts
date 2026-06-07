import { createDefaultStateSchemaRegistry, type StateSchemaDefinition, type StateSchemaRegistry } from "./schema-registry.ts";
import { resolveStateDaemonPaths, type StateDaemonPathOptions, type StateDaemonPaths } from "./paths.ts";
import { SerializedTransactionBoundary, type StateTransactionContext, type StateTransactionMode } from "./transaction.ts";

export interface StateSocketOwnership {
  socketPath: string;
  owner: "xt-daemon";
  transport: "unix";
  lifecycle: "daemon-owned";
}

export interface StateClientOptions extends StateDaemonPathOptions {
  registry?: StateSchemaRegistry;
  transactions?: SerializedTransactionBoundary;
}

export interface StateRuntimeDescription {
  paths: StateDaemonPaths;
  socket: StateSocketOwnership;
  schemas: StateSchemaDefinition[];
}

export class StateClient {
  readonly paths: StateDaemonPaths;
  readonly registry: StateSchemaRegistry;
  private readonly transactions: SerializedTransactionBoundary;

  constructor(options: StateClientOptions = {}) {
    this.paths = resolveStateDaemonPaths(options);
    this.registry = options.registry ?? createDefaultStateSchemaRegistry();
    this.transactions = options.transactions ?? new SerializedTransactionBoundary();
  }

  describeRuntime(): StateRuntimeDescription {
    return {
      paths: this.paths,
      socket: {
        socketPath: this.paths.socketPath,
        owner: "xt-daemon",
        transport: "unix",
        lifecycle: "daemon-owned",
      },
      schemas: this.registry.list(),
    };
  }

  transaction<T>(mode: StateTransactionMode, fn: (context: StateTransactionContext) => Promise<T> | T): Promise<T> {
    return this.transactions.run(mode, fn);
  }
}

export function createStateClient(options: StateClientOptions = {}): StateClient {
  return new StateClient(options);
}
