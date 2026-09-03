import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                queue: resolve(__dirname, "queue.html"),
                popup: resolve(__dirname, "popup.html"),
                background: resolve(__dirname, "src/background.ts"),
            },
            output: {
                entryFileNames: "assets/[name].js",
                chunkFileNames: "assets/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]",
            },
        },
    },
});
