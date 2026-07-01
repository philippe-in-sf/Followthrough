import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
    setupFiles: ["tests/setup.ts"],
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
    fileParallelism: false,
    globals: true,
  },
});
