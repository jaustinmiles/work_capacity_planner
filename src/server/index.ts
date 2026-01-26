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
import * as trpcExpress from '@trpc/server/adapters/express'
import { appRouter } from './router'
import { createContext } from './trpc'
import { disconnectPrisma } from './prisma'

const app = express()

// CORS configuration - restrict to localhost and local network IPs
const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true // Allow requests with no origin (same-origin, curl, etc.)
  return (
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://192.168.') || // Local network Class C
    origin.startsWith('http://10.') // Local network Class A
  )
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
    onError({ error, path }) {
      console.error(`tRPC error on ${path}:`, error.message)
    },
  }),
)

// Get port from environment or default
const port = parseInt(process.env.TASK_PLANNER_PORT || '3001', 10)

// Start server
const server = app.listen(port, '0.0.0.0', () => {
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
  ╚════════════════════════════════════════════════════════════╝
  `)
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
