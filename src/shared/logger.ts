// Check if we're in main process or renderer
const isMainProcess = typeof process !== 'undefined' && (process as any).type === 'browser'
const isRenderer = typeof window !== 'undefined' && !isMainProcess

let log: any

if (isMainProcess) {
  // Main process - use electron-log
  log = require('electron-log')
  const path = require('path')

  // Configure log levels
  log.transports.file.level = 'info'
  log.transports.console.level = 'debug'

  // Set log file location
  const electron = require('electron')
  const logPath = path.join(electron.app.getPath('userData'), 'logs')
  log.transports.file.resolvePathFn = () => path.join(logPath, 'main.log')
} else {
  // Renderer process or shared context - create a simple console logger
  const createScope = (scopeName: string) => ({
    info: (...args: any[]) => console.info(`[${scopeName}]`, ...args),
    debug: (...args: any[]) => console.debug(`[${scopeName}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${scopeName}]`, ...args),
    error: (...args: any[]) => console.error(`[${scopeName}]`, ...args),
  })

  log = {
    scope: (name: string) => createScope(name),
  }
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

  // Error tracking
  error: log.scope('error'),
}

// Export convenience methods
export const logInfo = (scope: keyof typeof logger, message: string, ...args: any[]) => {
  logger[scope].info(message, ...args)
}

export const logDebug = (scope: keyof typeof logger, message: string, ...args: any[]) => {
  logger[scope].debug(message, ...args)
}

export const logWarn = (scope: keyof typeof logger, message: string, ...args: any[]) => {
  logger[scope].warn(message, ...args)
}

export const logError = (scope: keyof typeof logger, message: string, error?: Error | unknown, ...args: any[]) => {
  if (error instanceof Error) {
    logger[scope].error(message, {
      error: error.message,
      stack: error.stack,
      ...args,
    })
  } else {
    logger[scope].error(message, error, ...args)
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
  log.info('EVENT', {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  })
}

export default logger
