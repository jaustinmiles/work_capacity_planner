/**
 * Utility functions for generating unique IDs throughout the logging system
 */

/**
 * Generates a correlation ID for tracking related operations
 * @param prefix - Optional prefix for the ID
 * @returns A unique correlation ID
 */
export function generateCorrelationId(prefix?: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 7)
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`
}

/**
 * Generates a session ID for tracking user sessions
 * @returns A unique session ID
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Generates a request ID for tracking HTTP requests
 * @returns A unique request ID
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
