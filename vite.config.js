import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        dashboard: resolve(__dirname, "src/dashboard/index.html"),
        background: resolve(__dirname, "src/background/background.js"),
        content: resolve(
          __dirname,
          "src/content-scripts/contentScriptEntry.js",
        ),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background/background.js";
          }
          if (chunkInfo.name === "content") {
            return "content-scripts/contentScript.js";
          }
          return "assets/[name]-[hash].js";
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith(".css")) {
            return "assets/[name]-[hash][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
