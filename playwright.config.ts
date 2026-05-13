import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

config(); // loads .env into process.env

const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["auth.spec.ts"],
  timeout: 60_000,
  use: {
    baseURL,
    headless: true
  }
});
