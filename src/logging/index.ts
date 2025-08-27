/**
 * Unified logging system export
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

// Renderer process
export { RendererLogger, getRendererLogger } from './renderer/RendererLogger'

// Transports
export { ConsoleTransport } from './transports/ConsoleTransport'
export { IPCTransport } from './transports/IPCTransport'
export { PrismaTransport } from './transports/PrismaTransport'

// Middleware
export { wrapIPCHandler, registerIPCHandlers, createIPCLogger } from './middleware/ipc'

// Convenience factory
import { MainLogger } from './main/MainLogger'
import { RendererLogger } from './renderer/RendererLogger'
import { LoggerConfig } from './types'

/**
 * Create appropriate logger based on process type
 */
export function createLogger(config?: LoggerConfig) {
  if (typeof window === 'undefined') {
    // Main process
    return MainLogger.getInstance(config)
  } else {
    // Renderer process
    return RendererLogger.getInstance(config)
  }
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
