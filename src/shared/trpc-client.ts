/**
 * tRPC Client Factory
 *
 * Creates a type-safe tRPC client for communicating with the API server.
 * This replaces the IPC-based communication in the Electron app.
 *
 * Usage:
 *   const client = createApiClient('http://localhost:3001', 'your-api-key')
 *   const sessions = await client.session.getAll.query()
 */

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '../server/router'

/**
 * Configuration for the API client
 */
export interface ApiClientConfig {
  /** Server URL (e.g., 'http://localhost:3001') */
  serverUrl: string
  /** API key for authentication */
  apiKey?: string
  /** Active session ID (sent with each request) */
  sessionId?: string
}

/**
 * Type-safe tRPC client
 */
export type ApiClient = ReturnType<typeof createTRPCProxyClient<AppRouter>>

/**
 * Creates a tRPC client configured for the Task Planner API.
 *
 * @param config - Client configuration
 * @returns Type-safe tRPC client
 *
 * @example
 * ```typescript
 * const client = createApiClient({
 *   serverUrl: 'http://192.168.1.100:3001',
 *   apiKey: 'my-secret-key',
 *   sessionId: 'session_12345'
 * })
 *
 * // Type-safe queries
 * const tasks = await client.task.getAll.query({ includeArchived: false })
 *
 * // Type-safe mutations
 * const newTask = await client.task.create.mutate({
 *   name: 'My Task',
 *   duration: 60,
 *   importance: 5,
 *   urgency: 5,
 *   type: 'focused'
 * })
 * ```
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return createTRPCProxyClient<AppRouter>({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `${config.serverUrl}/trpc`,
        headers() {
          const headers: Record<string, string> = {}

          if (config.apiKey) {
            headers['x-api-key'] = config.apiKey
          }

          if (config.sessionId) {
            headers['x-session-id'] = config.sessionId
          }

          return headers
        },
      }),
    ],
  })
}

/**
 * Creates a client with dynamic session ID support.
 * The session ID getter is called on each request.
 *
 * @param serverUrl - Server URL
 * @param apiKey - API key
 * @param getSessionId - Function that returns the current session ID
 */
export function createDynamicClient(
  serverUrl: string,
  apiKey: string | undefined,
  getSessionId: () => string | null,
): ApiClient {
  return createTRPCProxyClient<AppRouter>({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `${serverUrl}/trpc`,
        headers() {
          const headers: Record<string, string> = {}

          if (apiKey) {
            headers['x-api-key'] = apiKey
          }

          const sessionId = getSessionId()
          if (sessionId) {
            headers['x-session-id'] = sessionId
          }

          return headers
        },
      }),
    ],
  })
}

/**
 * Re-export the AppRouter type for consumers
 */
export type { AppRouter }
