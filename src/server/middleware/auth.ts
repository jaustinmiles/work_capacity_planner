/**
 * API Key Authentication Middleware
 *
 * Simple authentication for home network use.
 * Validates the x-api-key header against the configured API key.
 */

import { TRPCError } from '@trpc/server'
import { timingSafeEqual } from 'node:crypto'

/** NODE_ENV value that marks a production deployment (`npm run server:prod`). */
const PRODUCTION_NODE_ENV = 'production'

export interface AuthContext {
  isAuthenticated: boolean
  apiKey: string | null
}

/**
 * Boot-time API key policy result.
 *
 * The API must fail CLOSED in production: with no key configured,
 * `validateApiKey` would otherwise authenticate every request, so a
 * production server must refuse to start instead of serving the open
 * internet unauthenticated (the server is published via a Cloudflare tunnel).
 */
export enum ApiKeyBootStatus {
  /** A non-empty API key is configured — normal secure operation. */
  Configured = 'configured',
  /** No key configured outside production — allowed dev convenience, warn loudly. */
  MissingDevelopment = 'missing-development',
  /** No key configured in production — the server must refuse to start. */
  MissingProduction = 'missing-production',
}

/**
 * Whether a configured API key value is usable. An empty or whitespace-only
 * value (e.g. the blank `TASK_PLANNER_API_KEY=` line in .env.server.example)
 * counts as NOT configured.
 */
function isKeyConfigured(key: string | undefined): key is string {
  return typeof key === 'string' && key.trim().length > 0
}

/**
 * Evaluates the API key configuration at server boot.
 *
 * @param nodeEnv - The current NODE_ENV value
 * @param configuredKey - The TASK_PLANNER_API_KEY value
 * @returns The boot policy decision (see ApiKeyBootStatus)
 */
export function evaluateApiKeyBootPolicy(
  nodeEnv: string | undefined,
  configuredKey: string | undefined,
): ApiKeyBootStatus {
  if (isKeyConfigured(configuredKey)) {
    return ApiKeyBootStatus.Configured
  }
  return nodeEnv === PRODUCTION_NODE_ENV
    ? ApiKeyBootStatus.MissingProduction
    : ApiKeyBootStatus.MissingDevelopment
}

/**
 * Validates the provided API key against the configured key.
 *
 * @param providedKey - The API key from the request header
 * @returns AuthContext with authentication status
 */
export function validateApiKey(providedKey: string | undefined): AuthContext {
  const validKey = process.env.TASK_PLANNER_API_KEY

  if (!isKeyConfigured(validKey)) {
    // Fail CLOSED in production: a missing/mistyped env var must never
    // grant open access. The boot guard in src/server/index.ts refuses to
    // start in this state; this is defense in depth for any other entrypoint.
    if (process.env.NODE_ENV === PRODUCTION_NODE_ENV) {
      return { isAuthenticated: false, apiKey: null }
    }
    // No API key configured outside production = open access (development mode)
    return { isAuthenticated: true, apiKey: null }
  }

  // Validate the provided key with timing-safe comparison
  if (
    providedKey &&
    providedKey.length === validKey.length &&
    timingSafeEqual(Buffer.from(providedKey), Buffer.from(validKey))
  ) {
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
