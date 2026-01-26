/**
 * API Key Authentication Middleware
 *
 * Simple authentication for home network use.
 * Validates the x-api-key header against the configured API key.
 */

import { TRPCError } from '@trpc/server'

export interface AuthContext {
  isAuthenticated: boolean
  apiKey: string | null
}

/**
 * Validates the provided API key against the configured key.
 *
 * @param providedKey - The API key from the request header
 * @returns AuthContext with authentication status
 */
export function validateApiKey(providedKey: string | undefined): AuthContext {
  const validKey = process.env.TASK_PLANNER_API_KEY

  // No API key configured = open access (development mode)
  if (!validKey) {
    return { isAuthenticated: true, apiKey: null }
  }

  // Validate the provided key
  if (providedKey === validKey) {
    return { isAuthenticated: true, apiKey: providedKey }
  }

  return { isAuthenticated: false, apiKey: null }
}

/**
 * Creates a TRPCError for unauthorized access
 */
export function createUnauthorizedError(): TRPCError {
  return new TRPCError({
    code: 'UNAUTHORIZED',
    message: 'Invalid or missing API key',
  })
}
