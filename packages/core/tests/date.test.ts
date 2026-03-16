import { describe, it, expect } from "vitest";
import { relativeTime, formatDuration, isRecent } from "../src/utils/date.ts";

describe("relativeTime", () => {
  it("returns 'just now' for times less than a minute ago", () => {
    const now = new Date();
    expect(relativeTime(now)).toBe("just now");
    expect(relativeTime(new Date(now.getTime() - 30000))).toBe("just now");
  });

  it("returns minutes ago for times less than an hour ago", () => {
    const now = new Date();
    expect(relativeTime(new Date(now.getTime() - 60000))).toBe("1m ago");
    expect(relativeTime(new Date(now.getTime() - 300000))).toBe("5m ago");
    expect(relativeTime(new Date(now.getTime() - 3500000))).toBe("58m ago");
  });

  it("returns hours ago for times less than a day ago", () => {
    const now = new Date();
    expect(relativeTime(new Date(now.getTime() - 3600000))).toBe("1h ago");
    expect(relativeTime(new Date(now.getTime() - 7200000))).toBe("2h ago");
    expect(relativeTime(new Date(now.getTime() - 82800000))).toBe("23h ago");
  });

  it("returns days ago for times less than a week ago", () => {
    const now = new Date();
    expect(relativeTime(new Date(now.getTime() - 86400000))).toBe("1d ago");
    expect(relativeTime(new Date(now.getTime() - 259200000))).toBe("3d ago");
    expect(relativeTime(new Date(now.getTime() - 604800000))).toBe("7d ago");
  });

  it("returns date string for times older than a week", () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 691200000); // 8 days
    const result = relativeTime(oldDate);
    // Should return a date like "Mar 7" or similar
    expect(result).not.toMatch(/\d+[mhd] ago/);
    expect(result).not.toBe("just now");
  });

  it("handles string input", () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe("just now");
  });

  it("handles null/undefined gracefully", () => {
    expect(relativeTime(null as unknown as Date)).toBe("");
    expect(relativeTime(undefined as unknown as Date)).toBe("");
  });
});

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3599)).toBe("59m 59s");
  });

  it("formats hours, minutes, seconds", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3661)).toBe("1h 1m 1s");
    expect(formatDuration(7322)).toBe("2h 2m 2s");
  });
});

describe("isRecent", () => {
  it("returns true for times within threshold", () => {
    const now = new Date();
    expect(isRecent(now, 60000)).toBe(true);
    expect(isRecent(new Date(now.getTime() - 30000), 60000)).toBe(true);
  });

  it("returns false for times outside threshold", () => {
    const now = new Date();
    expect(isRecent(new Date(now.getTime() - 120000), 60000)).toBe(false);
  });

  it("uses default threshold of 1 hour", () => {
    const now = new Date();
    expect(isRecent(new Date(now.getTime() - 3000000))).toBe(true);
    expect(isRecent(new Date(now.getTime() - 4000000))).toBe(false);
  });
});
