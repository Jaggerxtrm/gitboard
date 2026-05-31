import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTerminalStreamEnvelope } from "../../../../../packages/core/src/terminal/protocol.ts";
import { TerminalBridge } from "../../../src/api/terminal/bridge.ts";
import { createTerminalProviderRegistry } from "../../../src/api/terminal/provider-registry.ts";

function createFeedScript(): string {
  const dir = mkdtempSync(join(tmpdir(), "specialist-feed-"));
  const script = join(dir, "fake-specialists.js");
  writeFileSync(script, `#!/bin/sh
echo "feed:$*"
`);
  chmodSync(script, 0o755);
  return script;
}

describe("specialist-feed terminal provider", () => {
  it("is readonly, validates job id, streams feed output, and exits", async () => {
    const registry = createTerminalProviderRegistry({
      GITBOARD_SPECIALISTS_BIN: createFeedScript(),
    } as NodeJS.ProcessEnv);
    const provider = registry.get("specialist-feed", { isVerifiedAdmin: true });

    expect(provider?.enabled).toBe(true);
    await expect(provider?.openSession({ sessionId: "s", capabilities: ["readonly"], jobId: "bad id" })).rejects.toThrow(/invalid specialist job id/);

    const session = await provider?.openSession({ sessionId: "s", capabilities: ["readonly"], jobId: "abc123" });
    expect(session).toBeDefined();
    const output = await new Promise<string>((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => reject(new Error("feed timed out")), 1000);
      session?.onOutput((data) => { text += data; });
      session?.onExit(() => { clearTimeout(timer); resolve(text); });
    });

    await session?.input("ignored");
    await session?.resize(120, 40);
    expect(output).toContain("feed:feed abc123 --follow");
  });

  it("requires verified admin for specialist feed", () => {
    const registry = createTerminalProviderRegistry({ GITBOARD_SHELL_PROVIDER_ENABLED: "0" } as NodeJS.ProcessEnv);

    expect(registry.get("specialist-feed")?.enabled).toBe(false);
    expect(registry.get("specialist-feed", { isVerifiedAdmin: true })?.enabled).toBe(true);
    expect(registry.get("pty")?.enabled).toBe(false);
  });

  it("denies non-admin openSession directly", async () => {
    const registry = createTerminalProviderRegistry({
      GITBOARD_SPECIALISTS_BIN: createFeedScript(),
    } as NodeJS.ProcessEnv);
    const provider = registry.get("specialist-feed");

    await expect(provider?.openSession({ sessionId: "s", capabilities: ["readonly"], jobId: "abc123" })).rejects.toThrow(/verified admin required for specialist feed/);
  });

  it("blocks non-admin attach on specialist feed even with reattach token", async () => {
    const registry = createTerminalProviderRegistry({
      GITBOARD_SPECIALISTS_BIN: createFeedScript(),
    } as NodeJS.ProcessEnv);
    const bridge = new TerminalBridge(registry);
    const adminMessages: unknown[] = [];
    const nonAdminMessages: unknown[] = [];

    const makeConnection = async (isVerifiedAdmin: boolean, sendTo: unknown[]): Promise<string> => {
      let connId = "";
      await bridge.handleUpgrade(new Request("http://localhost/api/console/terminal/ws"), { upgrade: (_req, options) => { connId = (options as { data: { connId: string } }).data.connId; return true; } }, "/api/console/terminal/ws", { isVerifiedAdmin });
      bridge.connect((payload) => sendTo.push(JSON.parse(payload)), connId);
      return connId;
    };

    const adminConn = await makeConnection(true, adminMessages);
    await bridge.handleMessage(adminConn, JSON.stringify(createTerminalStreamEnvelope("open", "stream-1", "session-1", { providerKind: "specialist-feed", capabilities: ["readonly"], jobId: "abc123" })));
    const reattachToken = (adminMessages.find((msg) => (msg as { kind?: string }).kind === "status") as { payload?: { reattachToken?: string } })?.payload?.reattachToken;
    const nonAdminConn = await makeConnection(false, nonAdminMessages);

    await bridge.handleMessage(nonAdminConn, JSON.stringify(createTerminalStreamEnvelope("attach", "stream-1", "session-1", { resume: false, reattachToken: reattachToken ?? "missing" })));

    expect(nonAdminMessages.some((msg) => (msg as { kind: string; payload: { code?: string } }).kind === "error" && (msg as { payload: { code?: string } }).payload.code === "forbidden")).toBe(true);
  });

  it("blocks non-admin terminal bridge open and allows verified admin", async () => {
    const registry = createTerminalProviderRegistry({
      GITBOARD_SPECIALISTS_BIN: createFeedScript(),
    } as NodeJS.ProcessEnv);
    const bridge = new TerminalBridge(registry);

    const makeConnection = async (isVerifiedAdmin: boolean, sendTo: unknown[]): Promise<string> => {
      let connId = "";
      await bridge.handleUpgrade(new Request("http://localhost/api/console/terminal/ws"), { upgrade: (_req, options) => { connId = (options as { data: { connId: string } }).data.connId; return true; } }, "/api/console/terminal/ws", { isVerifiedAdmin });
      bridge.connect((payload) => sendTo.push(JSON.parse(payload)), connId);
      return connId;
    };

    const nonAdminMessages: unknown[] = [];
    const adminMessages: unknown[] = [];
    const nonAdminConn = await makeConnection(false, nonAdminMessages);
    const adminConn = await makeConnection(true, adminMessages);

    await bridge.handleMessage(nonAdminConn, JSON.stringify(createTerminalStreamEnvelope("open", "stream-1", "session-1", { providerKind: "specialist-feed", capabilities: ["readonly"], jobId: "abc123" })));
    await bridge.handleMessage(adminConn, JSON.stringify(createTerminalStreamEnvelope("open", "stream-2", "session-2", { providerKind: "specialist-feed", capabilities: ["readonly"], jobId: "abc123" })));

    expect(nonAdminMessages.some((msg) => (msg as { kind: string; payload: { code?: string } }).kind === "error" && (msg as { payload: { code?: string } }).payload.code === "provider_disabled")).toBe(true);
    expect(adminMessages.some((msg) => (msg as { kind: string }).kind === "status")).toBe(true);
  });
});
