import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^lucide-react$/, replacement: path.resolve(__dirname, "src/lucide-icons.ts") }],
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
