import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/store/**", "src/lib/auth.ts", "src/lib/withAuth.ts", "src/lib/get-session.ts", "src/lib/audioEngine.ts", "src/lib/eq.ts"],
      reportsDirectory: "./coverage",
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Optional runtime dependency, not installed — stub for tests so
      // vitest's transform doesn't fail resolving the dynamic import in
      // src/lib/rate-limit.ts.
      "@upstash/redis": path.resolve(__dirname, "./src/__tests__/stubs/upstash-redis.ts"),
    },
  },
});
