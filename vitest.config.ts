import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    // Unit tests are colocated under src/. e2e/ belongs to Playwright, and is
    // excluded by construction rather than by an exclude rule.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
