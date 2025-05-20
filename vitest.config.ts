import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60_000,
    minWorkers: 0,
    maxWorkers: 1,
  },
});
