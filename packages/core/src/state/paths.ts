import { join } from "node:path";

export const DEFAULT_STATE_DIR_NAME = ".xtrm";
export const DEFAULT_STATE_DB_NAME = "state.db";
export const DEFAULT_STATE_SOCKET_NAME = "state.sock";

export interface StateDaemonPathOptions {
  homeDir?: string;
  stateDir?: string;
  dbName?: string;
  socketName?: string;
}

export interface StateDaemonPaths {
  homeDir: string;
  stateDir: string;
  dbPath: string;
  socketPath: string;
}

export function resolveStateDaemonPaths(options: StateDaemonPathOptions = {}): StateDaemonPaths {
  const homeDir = options.homeDir ?? process.env.HOME ?? ".";
  const stateDir = options.stateDir ?? join(homeDir, DEFAULT_STATE_DIR_NAME);
  return {
    homeDir,
    stateDir,
    dbPath: join(stateDir, options.dbName ?? DEFAULT_STATE_DB_NAME),
    socketPath: join(stateDir, options.socketName ?? DEFAULT_STATE_SOCKET_NAME),
  };
}
