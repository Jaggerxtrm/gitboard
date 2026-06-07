import { describe, expect, it } from "vitest";
import { createDefaultStateSchemaRegistry, createStateClient, SerializedTransactionBoundary } from "../src/state/index.ts";

describe("core state daemon scaffold", () => {
  it("resolves daemon-owned state paths and socket ownership", () => {
    const client = createStateClient({ homeDir: "/home/tester" });
    expect(client.describeRuntime()).toMatchObject({
      paths: {
        homeDir: "/home/tester",
        stateDir: "/home/tester/.xtrm",
        dbPath: "/home/tester/.xtrm/state.db",
        socketPath: "/home/tester/.xtrm/state.sock",
      },
      socket: {
        socketPath: "/home/tester/.xtrm/state.sock",
        owner: "xt-daemon",
        transport: "unix",
        lifecycle: "daemon-owned",
      },
    });
  });

  it("registers runtime, bridge read-model, and durable github schemas", () => {
    const registry = createDefaultStateSchemaRegistry();
    expect(registry.get("runtime")?.tables).toContain("materialization_state");
    expect(registry.get("console-read-models")?.tables).toContain("substrate_issues");
    expect(registry.get("github-adapter")?.tables).toContain("github_repo_poll_state");
  });

  it("serializes state transactions", async () => {
    const boundary = new SerializedTransactionBoundary();
    const order: string[] = [];

    const first = boundary.run("write", async (context) => {
      order.push(`${context.id}:start`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(`${context.id}:end`);
    });
    const second = boundary.run("read", (context) => {
      order.push(`${context.id}:start`);
      order.push(`${context.id}:end`);
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["txn-1:start", "txn-1:end", "txn-2:start", "txn-2:end"]);
  });
});
