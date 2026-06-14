import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Concurrency tests share a single Postgres database and a single
    // platform_settings row, so they must not run in parallel with each other.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
