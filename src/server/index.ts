/**
 * Task Planner API Server
 *
 * Express server with tRPC middleware for type-safe API access.
 * Replaces the IPC-based communication from the Electron main process.
 *
 * Usage:
 *   npm run server        - Start production server
 *   npm run server:dev    - Start with hot reload
 */

import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { URL } from 'node:url'
import * as trpcExpress from '@trpc/server/adapters/express'
import { appRouter } from './router'
import { createContext } from './trpc'
import { disconnectPrisma } from './prisma'

const app = express()

// Additional allowed origins from TASK_PLANNER_CORS_ORIGINS env var.
// Comma-separated list of origin prefixes or wildcard domain patterns.
// Examples: "https://myapp.example.com", "*.trycloudflare.com"
const extraOrigins = (process.env.TASK_PLANNER_CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true // Allow requests with no origin (same-origin, curl, etc.)

  // Built-in: localhost and private network ranges
  if (
    origin.startsWith('http://localhost') ||
    origin.startsWith('https://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://192.168.') ||
    origin.startsWith('http://10.') ||
    origin.startsWith('http://100.')
  ) {
    return true
  }

  // Check env-configured extra origins
  for (const extra of extraOrigins) {
    if (extra.startsWith('*.')) {
      // Wildcard domain match: "*.trycloudflare.com" matches "https://foo-bar.trycloudflare.com"
      try {
        const url = new URL(origin)
        if (url.hostname.endsWith(extra.slice(1))) return true
      } catch { /* invalid URL */ }
    } else if (origin.startsWith(extra)) {
      return true
    }
  }

  return false
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`))
      }
    },
    credentials: true,
  }),
)

// Parse JSON bodies with increased limit for audio transcription
// Base64-encoded audio can be large (25MB audio → ~33MB base64)
app.use(express.json({ limit: '50mb' }))

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  })
})

// Mount tRPC router
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path: errorPath }) {
      console.error(`tRPC error on ${errorPath}:`, error.message)
    },
  }),
)

// Static file serving for web client
// Serves the built web app from dist/web
const webDistPath = path.join(__dirname, '../../dist/web')
const webIndexPath = path.join(webDistPath, 'index.html')

// Only serve static files if the web build exists
if (fs.existsSync(webDistPath)) {
  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(webDistPath))

  // SPA fallback: serve index.html for any non-API routes
  // This enables client-side routing to work properly
  // Note: '/{*splat}' syntax required for path-to-regexp v8+ / Express 5
  app.get('/{*splat}', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/trpc') || req.path === '/health') {
      return next()
    }

    // Serve index.html for all other routes
    if (fs.existsSync(webIndexPath)) {
      res.sendFile(webIndexPath)
    } else {
      next()
    }
  })
}

// Get port from environment or default
const port = parseInt(process.env.TASK_PLANNER_PORT || '3001', 10)

// Check if web client is available
const hasWebClient = fs.existsSync(webDistPath) && fs.existsSync(webIndexPath)

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  const webStatus = hasWebClient ? 'Available' : 'Not built (run: npm run build:web)'
  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║                                                            ║
  ║   Task Planner API Server                                  ║
  ║                                                            ║
  ║   Local:   http://localhost:${port}                         ║
  ║   Network: http://0.0.0.0:${port}                           ║
  ║                                                            ║
  ║   Health:  http://localhost:${port}/health                  ║
  ║   tRPC:    http://localhost:${port}/trpc                    ║
  ║                                                            ║
  ║   Web Client: ${webStatus.padEnd(40)}║
  ║                                                            ║
  ╚════════════════════════════════════════════════════════════╝
  `)

  if (!process.env.TASK_PLANNER_API_KEY) {
    console.warn(
      '  ⚠️  No TASK_PLANNER_API_KEY set — all requests are unauthenticated.\n' +
        '  Set TASK_PLANNER_API_KEY in .env.server for secure remote access.\n',
    )
  }
})

// Graceful shutdown
const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received. Shutting down gracefully...`)

  server.close(async () => {
    console.log('HTTP server closed.')
    await disconnectPrisma()
    console.log('Database connection closed.')
    process.exit(0)
  })

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout.')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export { app, server }
