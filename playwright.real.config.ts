import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  testMatch: /(?:planning|roadmap|review)\.real\.ts$/,
});
