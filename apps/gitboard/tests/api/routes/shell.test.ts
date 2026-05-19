import { describe, expect, it } from "vitest";
import { getShellProviderStatus, shouldRejectShellWebSocket } from "../../../src/core/shell-provider-policy.ts";

describe("shell websocket guard", () => {
  it("refuses shell websocket path when admin-only and no admin principal", () => {
    const status = getShellProviderStatus({
      NODE_ENV: "production",
      HOST: "localhost",
      GITBOARD_SHELL_PROVIDER_ENABLED: "1",
      GITBOARD_SHELL_PROVIDER_ALLOW_REMOTE: "1",
      GITBOARD_SHELL_PROVIDER_DEV_GATE: "0",
      GITBOARD_SHELL_PROVIDER_ADMIN_ONLY: "1",
    } as NodeJS.ProcessEnv);
    expect(status.enabled).toBe(false);
    expect(shouldRejectShellWebSocket("/api/console/shell/ws", status)).toBe(true);
  });

  it("allows shell websocket path when explicitly enabled and admin verified", () => {
    const status = getShellProviderStatus({
      NODE_ENV: "production",
      HOST: "localhost",
      GITBOARD_SHELL_PROVIDER_ENABLED: "1",
      GITBOARD_SHELL_PROVIDER_ALLOW_REMOTE: "1",
      GITBOARD_SHELL_PROVIDER_DEV_GATE: "0",
      GITBOARD_SHELL_PROVIDER_ADMIN_ONLY: "1",
    } as NodeJS.ProcessEnv, { isVerifiedAdmin: true });
    expect(status.enabled).toBe(true);
    expect(shouldRejectShellWebSocket("/api/console/shell/ws", status)).toBe(false);
  });
});
