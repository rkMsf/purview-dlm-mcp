import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 300_000, // 5 min — server init includes MSAL auth + module load
    hookTimeout: 300_000, // 5 min for beforeAll (server startup)
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Both test files run in the same fork — share one MSAL session
      },
    },
    fileParallelism: false, // Tests share one server session — run sequentially
    setupFiles: ["src/test-setup.ts"],
  },
});
