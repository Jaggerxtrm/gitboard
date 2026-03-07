import { createDatabase } from "./core/store.ts";
import { GithubPoller, getGithubToken, getAuthenticatedUsername } from "./core/github-poller.ts";
import { discoverAndInsert } from "./core/github-discover.ts";
import { startServer } from "./api/server.ts";

const DB_PATH = process.env.AGENT_FORGE_DB ?? `${process.env.HOME}/.agent-forge/state.db`;
const PORT = Number(process.env.PORT ?? 3000);

const db = createDatabase(DB_PATH);
console.log(`[agent-forge] Database initialized at ${DB_PATH}`);

startServer(db, { port: PORT });

try {
  const token = getGithubToken();
  const username = await getAuthenticatedUsername(token);

  // Auto-discover repos on first run so the DB is populated
  await discoverAndInsert(db);

  const poller = new GithubPoller(db, token);

  console.log(`[agent-forge] Backfilling events for user ${username}...`);
  await poller.backfill(username);
  poller.start(username);
  console.log(`[agent-forge] GitHub poller running for ${username}`);

  process.on("SIGINT", () => {
    console.log("\n[agent-forge] Shutting down...");
    poller.stop();
    db.close();
    process.exit(0);
  });
} catch (err) {
  console.warn("[agent-forge] GitHub poller disabled:", (err as Error).message);
  process.on("SIGINT", () => {
    db.close();
    process.exit(0);
  });
}
