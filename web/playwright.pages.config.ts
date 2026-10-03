import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:4174/uniuni/"
  },
  webServer: {
    command: "PAGES_BASE_PATH=/uniuni/ npm run preview -- --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/uniuni/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
