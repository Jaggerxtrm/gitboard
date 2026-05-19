import { describe, expect, it } from "vitest";
import { getShellProviderNoticeHint, getShellProviderNoticeMessage } from "../../../../src/dashboard/components/console/shell-provider-notice.ts";

describe("shell provider notice helpers", () => {
  it("renders disabled text", () => {
    const status = { enabled: false, disabledReason: "disabled by default", policy: {} } as const;
    expect(getShellProviderNoticeMessage(status)).toBe("disabled by default");
    expect(getShellProviderNoticeHint(status)).toBe("Disabled state enforced server-side.");
  });
});
