export interface ShellProviderPolicy {
  enabled: boolean;
  allowRemote: boolean;
  allowAdminOnly: boolean;
  devGateRequired: boolean;
  cwdAllowlist: string[];
  shellAllowlist: string[];
  envScrub: string[];
  maxSessions: number;
  idleTimeoutMs: number;
  hardTtlMs: number;
  maxInputBytesPerSecond: number;
  maxOutputBytesPerSecond: number;
  auditEnabled: boolean;
  orphanCleanupEnabled: boolean;
}

export interface ShellProviderStatus {
  enabled: boolean;
  disabledReason: string;
  policy: ShellProviderPolicy;
}

export interface ShellAccessContext {
  isVerifiedAdmin?: boolean;
}

export type ProviderPermission = "readonly" | "shell";
export type ProviderKind = "specialist-feed" | "pty" | "tmux" | "ssh";

const DEFAULT_CWD_ALLOWLIST = ["/home/dawid/dev/gitboard"];
const DEFAULT_SHELL_ALLOWLIST = ["/bin/bash", "/bin/sh"];
const DEFAULT_ENV_SCRUB = ["AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "SSH_AUTH_SOCK", "SSH_AGENT_PID", "NPM_TOKEN", "HOME", "PATH"];

export function isShellCapableProviderKind(kind: ProviderKind): boolean {
  return kind !== "specialist-feed";
}

export function getProviderPermission(kind: ProviderKind): ProviderPermission {
  return isShellCapableProviderKind(kind) ? "shell" : "readonly";
}

export function parseShellProviderPolicy(env: NodeJS.ProcessEnv = process.env): ShellProviderPolicy {
  const enabled = parseBoolean(env.GITBOARD_SHELL_PROVIDER_ENABLED);
  const allowRemote = parseBoolean(env.GITBOARD_SHELL_PROVIDER_ALLOW_REMOTE);
  const allowAdminOnly = parseBoolean(env.GITBOARD_SHELL_PROVIDER_ADMIN_ONLY, true);
  const devGateRequired = parseBoolean(env.GITBOARD_SHELL_PROVIDER_DEV_GATE, true);
  const cwdAllowlist = parseList(env.GITBOARD_SHELL_PROVIDER_CWD_ALLOWLIST, DEFAULT_CWD_ALLOWLIST);
  const shellAllowlist = parseList(env.GITBOARD_SHELL_PROVIDER_SHELL_ALLOWLIST, DEFAULT_SHELL_ALLOWLIST);
  const envScrub = parseList(env.GITBOARD_SHELL_PROVIDER_ENV_SCRUB, DEFAULT_ENV_SCRUB);

  return {
    enabled,
    allowRemote,
    allowAdminOnly,
    devGateRequired,
    cwdAllowlist,
    shellAllowlist,
    envScrub,
    maxSessions: parsePositiveInt(env.GITBOARD_SHELL_PROVIDER_MAX_SESSIONS, 1),
    idleTimeoutMs: parsePositiveInt(env.GITBOARD_SHELL_PROVIDER_IDLE_TIMEOUT_MS, 15 * 60 * 1000),
    hardTtlMs: parsePositiveInt(env.GITBOARD_SHELL_PROVIDER_HARD_TTL_MS, 60 * 60 * 1000),
    maxInputBytesPerSecond: parsePositiveInt(env.GITBOARD_SHELL_PROVIDER_MAX_INPUT_BPS, 4096),
    maxOutputBytesPerSecond: parsePositiveInt(env.GITBOARD_SHELL_PROVIDER_MAX_OUTPUT_BPS, 65536),
    auditEnabled: parseBoolean(env.GITBOARD_SHELL_PROVIDER_AUDIT, true),
    orphanCleanupEnabled: parseBoolean(env.GITBOARD_SHELL_PROVIDER_ORPHAN_CLEANUP, true),
  };
}

export function getShellProviderStatus(env: NodeJS.ProcessEnv = process.env, context: ShellAccessContext = {}): ShellProviderStatus {
  const policy = parseShellProviderPolicy(env);
  const remoteContext = isRemoteContext(env);
  const isVerifiedAdmin = context.isVerifiedAdmin === true;
  const adminDenied = policy.allowAdminOnly && !isVerifiedAdmin;
  const disabledReason = !policy.enabled
    ? "shell provider disabled by default"
    : policy.devGateRequired && env.NODE_ENV === "production"
      ? "dev gate blocks production shell access"
      : remoteContext && !policy.allowRemote
        ? "remote shell access disabled"
        : adminDenied
          ? "admin-only shell access requires verified admin"
          : "shell provider enabled";

  return {
    enabled: policy.enabled && !(policy.devGateRequired && env.NODE_ENV === "production") && (!remoteContext || policy.allowRemote) && !adminDenied,
    disabledReason,
    policy,
  };
}

export function shellProviderDisabledMessage(status: ShellProviderStatus): string {
  if (status.enabled) {
    return `shell provider enabled; cwd allowlist ${status.policy.cwdAllowlist.join(", ")}`;
  }
  return `${status.disabledReason}; provider stays off until explicit env/admin enablement`;
}

export function isShellProviderRequestAllowed(status: ShellProviderStatus): boolean {
  return status.enabled;
}

export function shouldRejectShellWebSocket(path: string, status: ShellProviderStatus): boolean {
  return path.startsWith("/api/console/shell") && !status.enabled;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function isRemoteContext(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" || env.HOST !== "localhost";
}
