/**
 * Renderer-specific logging exports
 */

// Types
export * from './types'

// Core (browser-safe version only)
// Don't export Node.js Logger to avoid __dirname issues

// Renderer process
export { RendererLogger, getRendererLogger } from './renderer/RendererLogger'

// Renderer-specific React components
export { LoggerProvider, useLogger, LoggerErrorBoundary } from './renderer/LoggerProvider'

// Transports (renderer-safe only)
export { ConsoleTransport } from './transports/ConsoleTransport'
export { IPCTransport } from './transports/IPCTransport'

// Convenience factory for renderer
import { getRendererLogger } from './renderer/RendererLogger'

export function createLogger(config?: import('./types').LoggerConfig) {
  return getRendererLogger(config)
}

/**
 * Default loggers with categories
 */
export const logger = {
  // Core logger
  get main() { return createLogger() },

  // Category-specific loggers
  get db() { return createLogger().child({ category: 'database' }) },
  get api() { return createLogger().child({ category: 'api' }) },
  get ui() { return createLogger().child({ category: 'ui' }) },
  get ipc() { return createLogger().child({ category: 'ipc' }) },
  get scheduler() { return createLogger().child({ category: 'scheduler' }) },
  get ai() { return createLogger().child({ category: 'ai' }) },
  get performance() { return createLogger().child({ category: 'performance' }) },
}
