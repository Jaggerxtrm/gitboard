import { defineConfig } from "vitest/config";

import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
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
