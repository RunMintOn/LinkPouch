import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        queue: new URL("queue.html", import.meta.url).pathname,
        popup: new URL("popup.html", import.meta.url).pathname,
        background: new URL("src/background.ts", import.meta.url).pathname,
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
