// Renderer process logger - uses console with structured formatting
// In production, these will be captured by electron-log in the main process

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogScope = 'ui' | 'store' | 'api' | 'scheduler' | 'task' | 'workflow' | 'ai' | 'session'

interface LogEntry {
  timestamp: string
  level: LogLevel
  scope: LogScope
  message: string
  data?: any
}

class RendererLogger {
  private isDevelopment = process.env.NODE_ENV !== 'production'

  private formatMessage(entry: LogEntry): string {
    const prefix = `[${entry.timestamp}] [${entry.scope.toUpperCase()}]`
    return `${prefix} ${entry.message}`
  }

  private log(level: LogLevel, scope: LogScope, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      data,
    }

    const formattedMessage = this.formatMessage(entry)

    switch (level) {
      case 'debug':
        if (this.isDevelopment) {
          console.debug(formattedMessage, data || '')
        }
        break
      case 'info':
        console.info(formattedMessage, data || '')
        break
      case 'warn':
        console.warn(formattedMessage, data || '')
        break
      case 'error':
        console.error(formattedMessage, data || '')
        break
    }

    // Send to main process for file logging
    if (window.electron?.log) {
      const logMethod = window.electron.log[level as keyof typeof window.electron.log]
      if (logMethod) {
        logMethod(scope, message, data)
      }
    }
  }

  debug(scope: LogScope, message: string, data?: any): void {
    this.log('debug', scope, message, data)
  }

  info(scope: LogScope, message: string, data?: any): void {
    this.log('info', scope, message, data)
  }

  warn(scope: LogScope, message: string, data?: any): void {
    this.log('warn', scope, message, data)
  }

  error(scope: LogScope, message: string, error?: Error | unknown, data?: any): void {
    if (error instanceof Error) {
      this.log('error', scope, message, {
        error: error.message,
        stack: error.stack,
        ...data,
      })
    } else {
      this.log('error', scope, message, { error, ...data })
    }
  }

  // Performance logging
  performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.info('ui', `Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...metadata,
    })
  }

  // Event logging
  event(eventName: string, data?: Record<string, any>): void {
    this.info('ui', `Event: ${eventName}`, data)
  }

  // Group logging for related operations
  group(label: string): void {
    if (this.isDevelopment) {
      console.group(label)
    }
  }

  groupEnd(): void {
    if (this.isDevelopment) {
      console.groupEnd()
    }
  }
}

const rendererLogger = new RendererLogger()

// Create scoped loggers to match the main process API
export const logger = {
  ui: {
    info: (message: string, data?: any) => rendererLogger.info('ui', message, data),
    debug: (message: string, data?: any) => rendererLogger.debug('ui', message, data),
    warn: (message: string, data?: any) => rendererLogger.warn('ui', message, data),
    error: (message: string, error?: Error | unknown, data?: any) => rendererLogger.error('ui', message, error, data),
  },
  ai: {
    info: (message: string, data?: any) => rendererLogger.info('ai', message, data),
    debug: (message: string, data?: any) => rendererLogger.debug('ai', message, data),
    warn: (message: string, data?: any) => rendererLogger.warn('ai', message, data),
    error: (message: string, error?: Error | unknown, data?: any) => rendererLogger.error('ai', message, error, data),
  },
  store: {
    info: (message: string, data?: any) => rendererLogger.info('store', message, data),
    debug: (message: string, data?: any) => rendererLogger.debug('store', message, data),
    warn: (message: string, data?: any) => rendererLogger.warn('store', message, data),
    error: (message: string, error?: Error | unknown, data?: any) => rendererLogger.error('store', message, error, data),
  },
  scheduler: {
    info: (message: string, data?: any) => rendererLogger.info('scheduler', message, data),
    debug: (message: string, data?: any) => rendererLogger.debug('scheduler', message, data),
    warn: (message: string, data?: any) => rendererLogger.warn('scheduler', message, data),
    error: (message: string, error?: Error | unknown, data?: any) => rendererLogger.error('scheduler', message, error, data),
  },
}

// Convenience exports
export const logDebug = (scope: LogScope, message: string, data?: any) => rendererLogger.debug(scope, message, data)
export const logInfo = (scope: LogScope, message: string, data?: any) => rendererLogger.info(scope, message, data)
export const logWarn = (scope: LogScope, message: string, data?: any) => rendererLogger.warn(scope, message, data)
export const logError = (scope: LogScope, message: string, error?: Error | unknown, data?: any) => rendererLogger.error(scope, message, error, data)
export const logPerformance = (operation: string, duration: number, metadata?: Record<string, any>) => rendererLogger.performance(operation, duration, metadata)
export const logEvent = (event: string, data?: Record<string, any>) => rendererLogger.event(event, data)
