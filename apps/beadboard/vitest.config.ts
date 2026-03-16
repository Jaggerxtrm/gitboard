import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: false,
    // Use bun test for core/api tests, vitest for dashboard
    // Dashboard tests use happy-dom
    environment: "node",
  },
});
