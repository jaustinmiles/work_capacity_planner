/**
 * tRPC Server Configuration
 *
 * Sets up the tRPC router, context, and procedure builders.
 * This is the core of the API layer that replaces IPC handlers.
 */

import { initTRPC, TRPCError } from '@trpc/server'
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import superjson from 'superjson'
import { prisma } from './prisma'
import { validateApiKey, type AuthContext } from './middleware/auth'

/**
 * Context passed to every tRPC procedure.
 * Contains the Prisma client, authentication info, and active session.
 */
export interface Context {
  prisma: typeof prisma
  auth: AuthContext
  activeSessionId: string | null
}

/**
 * Creates the context for each tRPC request.
 * Extracts API key from headers and validates it.
 */
export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<Context> {
  const apiKey = opts.req.headers['x-api-key'] as string | undefined
  const auth = validateApiKey(apiKey)

  // Get active session ID from header (client sends this)
  const activeSessionId = (opts.req.headers['x-session-id'] as string) || null

  return {
    prisma,
    auth,
    activeSessionId,
  }
}

/**
 * Initialize tRPC with superjson transformer for proper Date serialization
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Add custom error data if needed
        zodError:
          error.cause instanceof Error ? error.cause.message : undefined,
      },
    }
  },
})

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router
export const middleware = t.middleware

/**
 * Public procedure - no authentication required
 * Use sparingly (e.g., health check endpoints)
 */
export const publicProcedure = t.procedure

/**
 * Authentication middleware
 * Checks that the request has a valid API key
 */
const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.auth.isAuthenticated) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Invalid or missing API key',
    })
  }
  return next({ ctx })
})

/**
 * Protected procedure - requires valid API key
 * Use for all database operations
 */
export const protectedProcedure = t.procedure.use(isAuthenticated)

/**
 * Session-scoped procedure - requires valid API key AND active session
 * Automatically injects sessionId into context for session-scoped queries
 */
const hasSession = middleware(async ({ ctx, next }) => {
  if (!ctx.activeSessionId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No active session. Set x-session-id header.',
    })
  }

  // Verify the session exists
  const session = await ctx.prisma.session.findUnique({
    where: { id: ctx.activeSessionId },
  })

  if (!session) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Session ${ctx.activeSessionId} not found`,
    })
  }

  return next({
    ctx: {
      ...ctx,
      // Type-safe sessionId (guaranteed to exist)
      sessionId: ctx.activeSessionId,
    },
  })
})

/**
 * Session procedure - requires auth AND active session
 * Most database operations should use this
 */
export const sessionProcedure = protectedProcedure.use(hasSession)
