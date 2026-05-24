import { Database } from "bun:sqlite";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BeadsSnapshotSource } from "../../../src/core/materializer/beads-snapshot-source.ts";
import { snapshotDiff, snapshotHash } from "../../../src/core/materializer/snapshot-diff.ts";

const keyFn = (row: { id: string }) => row.id;

describe("snapshotDiff", () => {
  it("handles add update delete and unchanged", () => {
    const prev = [{ id: "a", value: 1 }, { id: "b", value: 2 }, { id: "c", value: 3 }];
    const next = [{ id: "a", value: 1 }, { id: "b", value: 9 }, { id: "d", value: 4 }];
    const result = snapshotDiff(prev, next, keyFn);
    expect(result.unchanged_count).toBe(1);
    expect(result.upserts).toEqual([{ id: "b", value: 9 }, { id: "d", value: 4 }]);
    expect(result.tombstones).toEqual([{ id: "c", value: 3 }]);
  });

  it("hashes stable across row order and object key order", () => {
    const left = snapshotHash([{ id: "b", nested: { y: 2, x: 1 } }, { id: "a", nested: { b: 2, a: 1 } }], keyFn);
    const right = snapshotHash([{ nested: { a: 1, b: 2 }, id: "a" }, { nested: { x: 1, y: 2 }, id: "b" }], keyFn);
    expect(left).toBe(right);
  });
});

describe("BeadsSnapshotSource", () => {
  it("falls back to jsonl and skips only when both signals match", async () => {
    const dir = await mkdtemp(join(tmpdir(), "beads-snapshot-"));
    await writeFile(join(dir, "issues.jsonl"), [
      JSON.stringify({ _type: "issue", id: "A", title: "Alpha", status: "open", priority: 2, issue_type: "task", created_at: "2026-05-24T00:00:00.000Z", updated_at: "2026-05-24T00:00:00.000Z", dependencies: [] }),
    ].join("\n") + "\n");
    const mtimeMs = (await stat(join(dir, "issues.jsonl"))).mtimeMs;
    const db = new Database(":memory:");
    db.exec("CREATE TABLE materialization_state (source_key TEXT PRIMARY KEY, cursor TEXT, last_run_at DATETIME, last_success_at DATETIME, last_status TEXT, last_error TEXT)");
    db.query("INSERT INTO materialization_state (source_key, cursor, last_status) VALUES (?, ?, 'success')").run("beads:1", JSON.stringify({ dolt_commit_hash: "abc", jsonl_mtime_ms: mtimeMs }));
    const source = new BeadsSnapshotSource({ sourceKey: "beads:1", beadsPath: dir, doltCommitHash: "abc", xtrmDb: db });
    const rows = await source.readSnapshot();
    expect(rows).toHaveLength(1);
    expect(rows[0].dependencies).toEqual([]);
    expect(await source.shouldSkipRead()).toBe(true);
    await db.query("UPDATE materialization_state SET cursor = ? WHERE source_key = ?").run(JSON.stringify({ dolt_commit_hash: "zzz", jsonl_mtime_ms: mtimeMs }), "beads:1");
    expect(await source.shouldSkipRead()).toBe(false);
    await rm(dir, { recursive: true, force: true });
    db.close();
  });
});
