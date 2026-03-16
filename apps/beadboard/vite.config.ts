import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/dashboard",
  publicDir: false,
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../../dist/dashboard",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  // Allow .ts and .tsx extensions in imports
  optimizeDeps: {
    esbuildOptions: {
      resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    },
  },
});