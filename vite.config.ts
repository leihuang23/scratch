import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tokenPath } from "./server/paths.mjs";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4173",
        timeout: 0,
        proxyTimeout: 0,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            if (!fs.existsSync(tokenPath())) return;
            proxyReq.setHeader("x-scratch-token", fs.readFileSync(tokenPath(), "utf8").trim());
          });
        },
      },
    },
  },
  build: {
    target: ["es2021", "chrome105", "safari14"],
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          tiptap: [
            "@tiptap/react",
            "@tiptap/starter-kit",
            "@tiptap/markdown",
            "@tiptap/extension-link",
            "@tiptap/extension-image",
            "@tiptap/extension-placeholder",
            "@tiptap/extension-task-list",
            "@tiptap/extension-task-item",
            "@tiptap/extension-table",
            "@tiptap/extension-table-row",
            "@tiptap/extension-table-cell",
            "@tiptap/extension-table-header",
            "@tiptap/extension-code-block-lowlight",
          ],
          highlight: ["lowlight", "highlight.js"],
        },
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/markdown",
      "lowlight",
    ],
  },
});
