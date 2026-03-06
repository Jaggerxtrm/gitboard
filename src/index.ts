import { createDatabase } from "./core/store.ts";
import { getRepos } from "./core/github-store.ts";
import { GithubPoller, getGithubToken } from "./core/github-poller.ts";
import { startServer } from "./api/server.ts";

const DB_PATH = process.env.AGENT_FORGE_DB ?? `${process.env.HOME}/.agent-forge/state.db`;
const PORT = Number(process.env.PORT ?? 3000);

const db = createDatabase(DB_PATH);
console.log(`[agent-forge] Database initialized at ${DB_PATH}`);

startServer(db, { port: PORT });

try {
  const token = getGithubToken();
  const repos = getRepos(db)
    .filter((r) => r.tracked)
    .map((r) => r.full_name);

  const poller = new GithubPoller(db, token);

  if (repos.length > 0) {
    console.log(`[agent-forge] Backfilling ${repos.length} tracked repos...`);
    for (const repo of repos) {
      await poller.backfill(repo);
    }
    poller.start(repos);
    console.log(`[agent-forge] GitHub poller running for ${repos.length} repos`);
  } else {
    console.log("[agent-forge] No tracked repos. Add repos via /api/github/repos to start polling.");
  }

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
