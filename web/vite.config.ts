import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || "/",
  server: {
    port: 5173,
    host: true
  }
});
