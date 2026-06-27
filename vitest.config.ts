import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Unit suite (`npm test`): pure tests, no database, no Docker. Integration
// tests (*.integration.test.ts) are excluded — run them with
// `npm run test:integration` (see vitest.integration.config.ts).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.{test,spec}.{ts,tsx}", "lib/**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "**/*.integration.test.*"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
