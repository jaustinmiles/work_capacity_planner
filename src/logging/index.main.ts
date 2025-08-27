/**
 * Main process logging exports
 */

// Types
export * from './types'

// Core
export { Logger } from './core/Logger'
export { RingBuffer } from './core/RingBuffer'
export { Sampler } from './core/Sampler'
export { StructuredLogger } from './core/StructuredLogger'

// Main process
export { MainLogger, getMainLogger } from './main/MainLogger'

// Transports
export { ConsoleTransport } from './transports/ConsoleTransport'
export { IPCTransport } from './transports/IPCTransport'
export { PrismaTransport } from './transports/PrismaTransport'

// Middleware
export { wrapIPCHandler, registerIPCHandlers } from './middleware/ipc'

// Convenience factory for main process
import { getMainLogger } from './main/MainLogger'

export function createLogger(config?: import('./types').LoggerConfig) {
  return getMainLogger(config)
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
