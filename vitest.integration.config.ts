import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Integration suite (`npm run test:integration`): only *.integration.test.ts,
// run against a throwaway Postgres container the globalSetup provisions. The
// default config (vitest.config.ts) excludes these files from `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["app/**/*.integration.test.ts", "lib/**/*.integration.test.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
