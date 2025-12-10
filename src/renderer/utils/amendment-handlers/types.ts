/**
 * Shared types for amendment handlers
 */

import type { getDatabase } from '../../services/database'

/**
 * Context passed to all amendment handlers
 */
export interface HandlerContext {
  db: ReturnType<typeof getDatabase>
  markFailed: (error: string) => void
  createdTaskMap: Map<string, string>
}

/**
 * Result of a handler execution
 */
export interface HandlerResult {
  success: boolean
  message?: string
}
