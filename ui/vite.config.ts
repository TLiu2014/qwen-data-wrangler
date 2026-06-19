import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Our React-Flow-based pipeline-canvas module. Lives in src/flow.
      // Files inside that tree use "@flow/…" so they don't collide with our
      // app's "@/…" (which points at src/).
      "@flow": path.resolve(__dirname, "./src/flow"),
    },
  },
  server: {
    port: 5173,
    // npm run dev should land directly on the workspace, skipping the
    // marketing landing at `/`. Navigating to `/` still serves it.
    open: "/app",
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
