import { describe, it, expect } from "vitest";
import { cn } from "../src/utils/cn.ts";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
    expect(cn("foo", true && "bar", "baz")).toBe("foo bar baz");
  });

  it("handles undefined and null", () => {
    expect(cn("foo", undefined, "bar")).toBe("foo bar");
    expect(cn("foo", null, "bar")).toBe("foo bar");
  });

  it("handles empty strings", () => {
    expect(cn("foo", "", "bar")).toBe("foo bar");
  });

  it("handles object syntax", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });

  it("handles mixed inputs", () => {
    expect(cn("foo", { bar: true, baz: false }, "qux")).toBe("foo bar qux");
  });

  it("handles tailwind-merge conflicts", () => {
    // Later classes should win for Tailwind classes
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("returns empty string for no input", () => {
    expect(cn()).toBe("");
    expect(cn(null, undefined, false)).toBe("");
  });
});
