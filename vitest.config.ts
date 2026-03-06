import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
    },
    environmentMatchGlobs: [
      ["tests/dashboard/**", "happy-dom"],
    ],
    setupFiles: ["tests/dashboard/setup.ts"],
  },
});
