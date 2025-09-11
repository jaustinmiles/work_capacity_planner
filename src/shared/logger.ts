// Unified logger for shared files
// Routes to the appropriate ring buffer logger based on environment

let loggerInstance: any

// Check environment
const isMainProcess = typeof process !== 'undefined' && (process as any).type === 'browser'
const isRenderer = typeof window !== 'undefined'

// Create a unified logger that routes to the ring buffer system
if (isMainProcess) {
  // Main process - use MainLogger from the unified system
  try {
    const { getMainLogger } = require('../logging/main/MainLogger')
    loggerInstance = getMainLogger()
  } catch (_e) {
    // Fallback for main process if unified logger not available
    const electronLog = require('electron-log')
    loggerInstance = {
      debug: (msg: string, ...args: any[]) => electronLog.debug(msg, ...args),
      info: (msg: string, ...args: any[]) => electronLog.info(msg, ...args),
      warn: (msg: string, ...args: any[]) => electronLog.warn(msg, ...args),
      error: (msg: string, ...args: any[]) => electronLog.error(msg, ...args),
    }
  }
} else if (isRenderer) {
  // Renderer process - use RendererLogger from the unified system
  // Import dynamically to avoid issues with different environments
  try {
    const { getRendererLogger } = require('../logging/renderer/RendererLogger')
    loggerInstance = getRendererLogger()
  } catch (_e) {
    // If we can't get the renderer logger, create a no-op logger
    // This prevents crashes but doesn't spam console
    loggerInstance = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }
  }
} else {
  // Other contexts (tests, node scripts) - no-op logger
  loggerInstance = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

// Create scoped loggers that match the existing interface
const createScopedLogger = (scope: string) => ({
  debug: (message: string, ...args: any[]) => {
    loggerInstance.debug(`[${scope.toUpperCase()}] ${message}`, ...args)
  },
  info: (message: string, ...args: any[]) => {
    loggerInstance.info(`[${scope.toUpperCase()}] ${message}`, ...args)
  },
  warn: (message: string, ...args: any[]) => {
    loggerInstance.warn(`[${scope.toUpperCase()}] ${message}`, ...args)
  },
  error: (message: string, ...args: any[]) => {
    loggerInstance.error(`[${scope.toUpperCase()}] ${message}`, ...args)
  },
})

// Create log object with scope method for backward compatibility
const log = {
  scope: (name: string) => createScopedLogger(name),
}

// Create scoped loggers
export const logger = {
  // Main process logger
  main: log.scope('main'),

  // Database operations
  db: log.scope('database'),

  // IPC handlers
  ipc: log.scope('ipc'),

  // AI services
  ai: log.scope('ai'),

  // Scheduling
  scheduler: log.scope('scheduler'),

  // UI/Renderer
  ui: log.scope('ui'),

  // Performance monitoring
  perf: log.scope('performance'),

  // Error tracking (as a scope, not the method)
  errorScope: log.scope('error'),

  // Top-level convenience methods for general logging
  debug: (message: string, ...args: any[]) => {
    loggerInstance.debug(`[GENERAL] ${message}`, ...args)
  },
  info: (message: string, ...args: any[]) => {
    loggerInstance.info(`[GENERAL] ${message}`, ...args)
  },
  warn: (message: string, ...args: any[]) => {
    loggerInstance.warn(`[GENERAL] ${message}`, ...args)
  },
  error: (message: string, ...args: any[]) => {
    loggerInstance.error(`[GENERAL] ${message}`, ...args)
  },
}

// Export legacy convenience methods (kept for backward compatibility)
// These are exported but not used anymore - use logger.scope.method() instead
export const logInfo = (scope: string, message: string, ...args: any[]) => {
  loggerInstance.info(`[${scope.toUpperCase()}] ${message}`, ...args)
}

export const logDebug = (scope: string, message: string, ...args: any[]) => {
  loggerInstance.debug(`[${scope.toUpperCase()}] ${message}`, ...args)
}

export const logWarn = (scope: string, message: string, ...args: any[]) => {
  loggerInstance.warn(`[${scope.toUpperCase()}] ${message}`, ...args)
}

export const logError = (scope: string, message: string, error?: Error | unknown, ...args: any[]) => {
  if (error instanceof Error) {
    loggerInstance.error(`[${scope.toUpperCase()}] ${message}`, {
      error: error.message,
      stack: error.stack,
      ...args,
    })
  } else {
    loggerInstance.error(`[${scope.toUpperCase()}] ${message}`, error, ...args)
  }
}

// Performance tracking
export const logPerformance = (operation: string, duration: number, metadata?: Record<string, any>) => {
  logger.perf.info(`Operation: ${operation}`, {
    duration: `${duration}ms`,
    ...metadata,
  })
}

// Structured logging for key events
export const logEvent = (event: string, data?: Record<string, any>) => {
  loggerInstance.info(`[EVENT] ${event}`, {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  })
}

export default logger
