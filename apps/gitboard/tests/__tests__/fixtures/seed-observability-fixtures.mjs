import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "observability");
mkdirSync(dir, { recursive: true });

seedCompat(join(dir, "repo-a.db"));
seedCompat(join(dir, "repo-b.db"));
seedMismatch(join(dir, "repo-c.db"));

function seedCompat(path) {
  const db = new Database(path, { create: true });
  try {
    db.exec("CREATE TABLE IF NOT EXISTS seed(value TEXT);");
  } finally {
    db.close();
  }
}

function seedMismatch(path) {
  writeFileSync(path, "not-sqlite");
}
