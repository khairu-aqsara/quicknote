import { defineConfig } from "vitest/config";

// The suites drive real CodeMirror state with the real Markdown grammar and
// never touch the DOM, so they run in plain Node. Anything that needs a
// document belongs in the manual pass described in CONTRIBUTING.md.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
