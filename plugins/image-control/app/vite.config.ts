import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  server: {
    host: "127.0.0.1",
    port: 4318,
    proxy: {
      "/api": "http://127.0.0.1:4317",
      "/media": "http://127.0.0.1:4317",
      "/health": "http://127.0.0.1:4317"
    }
  },
  build: {
    target: "es2022",
    assetsInlineLimit: 100000000,
    cssCodeSplit: false
  }
});
