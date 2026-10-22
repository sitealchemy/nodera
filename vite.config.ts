/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { manusApiPlugin } from './server/manusPlugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The local backend. It runs inside the Vite process, so MANUS_API_KEY
    // stays server-side and one command starts both halves of the app.
    manusApiPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: {
      // Playwright writes its report, traces and screenshots into the project
      // while it runs. Vite's watcher scans those directories as they are
      // being rewritten, and the resulting FSWatcher error is unhandled —
      // it takes the whole dev server down mid-run. None of it is source.
      ignored: ['**/e2e-report/**', '**/e2e-results/**', '**/e2e-screenshots/**'],
    },
  },
  test: {
    // Unit tests only. Playwright owns e2e/, and Vitest would otherwise collect
    // those specs and fail on their @playwright/test imports.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
