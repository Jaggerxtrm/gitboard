import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: false,
    environmentMatch: {
      node: ["tests/core/**", "tests/api/**"],
      "happy-dom": ["tests/dashboard/**"],
    },
  },
});
