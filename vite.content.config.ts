import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/content.ts",
      name: "LinkPouchContent",
      formats: ["iife"],
      fileName: () => "assets/content.js",
    },
  },
});
