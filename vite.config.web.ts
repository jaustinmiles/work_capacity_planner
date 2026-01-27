/**
 * Vite configuration for web client build
 *
 * This config builds the renderer as a standalone web application
 * that can be served from the Express server or any static file host.
 *
 * Key differences from Electron config:
 * - Root is src/web (web-specific entry point)
 * - Base path is '/' for HTTP serving (not './' for file://)
 * - Output goes to dist/web
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  root: './src/web',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  // Use absolute path for web serving (HTTP)
  base: '/',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    sourcemap: true,
    // Use esbuild for minification (built into Vite, no extra dependency needed)
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          react: ['react', 'react-dom'],
          arco: ['@arco-design/web-react'],
        },
      },
    },
  },
  server: {
    // Different port for web dev server
    port: 5175,
    strictPort: true,
    // Expose to network for iPad/mobile access
    host: true,
    // Proxy API requests to the backend during development
    proxy: {
      '/trpc': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
    // Also proxy in preview mode
    proxy: {
      '/trpc': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
