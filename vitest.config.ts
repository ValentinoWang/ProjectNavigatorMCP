import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/*.test.ts"],
    fileParallelism: false,
    restoreMocks: true,
    testTimeout: 30_000
  }
});
