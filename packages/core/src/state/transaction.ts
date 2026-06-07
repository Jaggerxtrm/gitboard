export type StateTransactionMode = "read" | "write";

export interface StateTransactionContext {
  id: string;
  mode: StateTransactionMode;
  startedAtUnixMs: number;
}

export class SerializedTransactionBoundary {
  private chain: Promise<unknown> = Promise.resolve();
  private nextId = 0;

  run<T>(mode: StateTransactionMode, fn: (context: StateTransactionContext) => Promise<T> | T): Promise<T> {
    const context: StateTransactionContext = {
      id: `txn-${++this.nextId}`,
      mode,
      startedAtUnixMs: Date.now(),
    };
    const next = this.chain.then(() => fn(context));
    this.chain = next.catch(() => undefined);
    return next;
  }
}
