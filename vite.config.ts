import { defineConfig } from "vite";

// Tauri serves the frontend from a fixed port in development and from the
// `dist` directory in a release build.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    minify: true,
    sourcemap: false,
  },
});
