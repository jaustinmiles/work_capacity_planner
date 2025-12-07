import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from 'dotenv'
import { resolve } from 'path'
import { networkInterfaces } from 'os'

// Load environment variables from root .env and local .env
config({ path: resolve(__dirname, '../../../.env') })
config({ path: resolve(__dirname, '../.env') })

// Import routes
import { sessionRoutes } from './routes/sessions.js'
import { taskRoutes } from './routes/tasks.js'
import { workSessionRoutes } from './routes/work-sessions.js'
import { workPatternRoutes } from './routes/work-patterns.js'
import { userTaskTypeRoutes } from './routes/user-task-types.js'
import { timeSinkRoutes } from './routes/time-sinks.js'
// TODO: Add scheduling, AI, and speech routes once shared package is set up

// Import database
import { disconnectDb } from './db/index.js'

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
})

// Enable CORS for local network access (iOS app)
fastify.register(cors, {
  origin: true, // Allow all origins for local development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
})

// Health check endpoint
fastify.get('/api/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    routes: {
      sessions: ['GET /api/sessions', 'POST /api/sessions', 'PUT /api/sessions/:id/activate'],
      tasks: [
        'GET /api/tasks',
        'POST /api/tasks',
        'GET /api/tasks/:id',
        'PUT /api/tasks/:id',
        'DELETE /api/tasks/:id',
        'POST /api/tasks/:id/complete',
        'POST /api/tasks/:id/archive',
        'GET /api/tasks/:id/steps',
        'POST /api/tasks/:id/steps',
      ],
      workSessions: [
        'GET /api/work-sessions',
        'POST /api/work-sessions/start',
        'PUT /api/work-sessions/:id/stop',
        'GET /api/work-sessions/stats',
      ],
      workPatterns: [
        'GET /api/work-patterns',
        'GET /api/work-patterns/date/:date',
        'GET /api/work-patterns/templates',
        'POST /api/work-patterns',
        'PUT /api/work-patterns/:id',
        'DELETE /api/work-patterns/:id',
        'POST /api/work-patterns/:id/save-as-template',
        'POST /api/work-patterns/apply-template',
      ],
      userTaskTypes: [
        'GET /api/user-task-types',
        'GET /api/user-task-types/has-any',
        'POST /api/user-task-types',
        'PUT /api/user-task-types/:id',
        'DELETE /api/user-task-types/:id',
        'PUT /api/user-task-types/reorder',
      ],
      timeSinks: [
        'GET /api/time-sinks',
        'POST /api/time-sinks',
        'PUT /api/time-sinks/:id',
        'DELETE /api/time-sinks/:id',
        'PUT /api/time-sinks/reorder',
        'GET /api/time-sink-sessions',
        'GET /api/time-sink-sessions/active',
        'POST /api/time-sink-sessions',
        'PUT /api/time-sink-sessions/:id/end',
        'DELETE /api/time-sink-sessions/:id',
        'GET /api/time-sink-sessions/accumulated',
      ],
      // TODO: scheduling, ai, speech routes pending shared package setup
    },
  }
})

// Register API routes
fastify.register(sessionRoutes)
fastify.register(taskRoutes)
fastify.register(workSessionRoutes)
fastify.register(workPatternRoutes)
fastify.register(userTaskTypeRoutes)
fastify.register(timeSinkRoutes)
// TODO: Register scheduling, AI, and speech routes once shared package is set up

// Get local network IP for mobile access
function getLocalIP(): string {
  const nets = networkInterfaces()

  for (const name of Object.keys(nets)) {
    const netList = nets[name]
    if (!netList) continue

    for (const net of netList) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('\nShutting down server...')
  await fastify.close()
  await disconnectDb()
  console.log('Server stopped.')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const start = async (): Promise<void> => {
  try {
    const port = Number(process.env.API_PORT) || 3001
    const host = '0.0.0.0' // Listen on all interfaces for local network access

    await fastify.listen({ port, host })

    const localIP = getLocalIP()
    console.log('\n' + '='.repeat(50))
    console.log('🚀 Task Planner API Server Running!')
    console.log('='.repeat(50))
    console.log(`\n   Local:   http://localhost:${port}`)
    console.log(`   Network: http://${localIP}:${port}`)
    console.log('\n📱 Connect your iOS app to:')
    console.log(`   http://${localIP}:${port}`)
    console.log('\n' + '='.repeat(50))
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
