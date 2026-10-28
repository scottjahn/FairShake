import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build is turned into one self-contained HTML file (tools/single-file.mjs)
// that is opened straight from disk, so asset URLs are relative and the CSS
// stays in a single file. Dev runs at "/" so the local admin panel works at
// http://localhost:5173/admin.
export default defineConfig({
  base: "./",
  publicDir: false,
  build: { cssCodeSplit: false, modulePreload: false },
  plugins: [react()],
  server: {
    // In dev, proxy API calls to the local admin server (tools/admin-server.mjs)
    // so both the public views and the /admin panel work against live SQLite.
    proxy: {
      "/api": "http://localhost:8789",
    },
  },
});
