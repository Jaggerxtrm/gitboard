import { describe, it, expect } from "vitest";
import { formatNumber, formatBytes, formatPercentage, pluralize } from "../src/utils/format.ts";

describe("formatNumber", () => {
  it("formats small numbers as-is", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(100)).toBe("100");
    expect(formatNumber(999)).toBe("999");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1000)).toBe("1K");
    expect(formatNumber(1500)).toBe("1.5K");
    expect(formatNumber(999999)).toBe("1M");
  });

  it("formats millions with M suffix", () => {
    expect(formatNumber(1000000)).toBe("1M");
    expect(formatNumber(2500000)).toBe("2.5M");
  });

  it("handles negative numbers", () => {
    expect(formatNumber(-1000)).toBe("-1K");
    expect(formatNumber(-1500)).toBe("-1.5K");
  });

  it("respects precision parameter", () => {
    expect(formatNumber(1234, 0)).toBe("1K");
    expect(formatNumber(1234, 1)).toBe("1.2K");
    expect(formatNumber(1234, 2)).toBe("1.23K");
  });
});

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(100)).toBe("100 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(2621440)).toBe("2.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });
});

describe("formatPercentage", () => {
  it("formats percentages", () => {
    expect(formatPercentage(0)).toBe("0%");
    expect(formatPercentage(0.5)).toBe("50%");
    expect(formatPercentage(1)).toBe("100%");
  });

  it("respects precision", () => {
    expect(formatPercentage(0.333, 0)).toBe("33%");
    expect(formatPercentage(0.333, 1)).toBe("33.3%");
    expect(formatPercentage(0.333, 2)).toBe("33.30%");
  });

  it("handles values > 1", () => {
    expect(formatPercentage(1.5)).toBe("150%");
  });
});

describe("pluralize", () => {
  it("returns singular for count of 1", () => {
    expect(pluralize(1, "item")).toBe("item");
    expect(pluralize(1, "issue", "issues")).toBe("issue");
  });

  it("returns plural for count != 1", () => {
    expect(pluralize(0, "item")).toBe("items");
    expect(pluralize(2, "item")).toBe("items");
    expect(pluralize(1, "issue", "issues")).toBe("issue");
    expect(pluralize(2, "issue", "issues")).toBe("issues");
  });

  it("includes count when requested", () => {
    expect(pluralize(1, "item", "items", true)).toBe("1 item");
    expect(pluralize(2, "item", "items", true)).toBe("2 items");
  });
});
