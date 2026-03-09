/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Keep warnings visible for meaningful regressions while allowing the bundled PDF worker.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('exceljs')) {
            return 'vendor-excel';
          }

          if (id.includes('pdfjs-dist')) {
            return 'vendor-pdf';
          }

          if (id.includes('@google/genai')) {
            return 'vendor-ai';
          }

          if (id.includes('@tanstack') || id.includes('zustand')) {
            return 'vendor-analysis';
          }

          if (id.includes('@radix-ui') || id.includes('lucide-react')) {
            return 'vendor-ui';
          }

          return 'vendor-core';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
