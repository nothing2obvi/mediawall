import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-mediawall-logos",
      closeBundle() {
        fs.cpSync(path.resolve("src/logos"), path.resolve("dist/public/logos"), { recursive: true });
      }
    }
  ],
  build: {
    outDir: "dist/public",
    emptyOutDir: false
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:1221"
    }
  }
});
