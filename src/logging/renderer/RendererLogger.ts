/**
 * Renderer process logger implementation
 */

import { LoggerConfig, LogLevel } from '../types'
import { Logger } from '../core/Logger'
import { ConsoleTransport } from '../transports/ConsoleTransport'
import { IPCTransport } from '../transports/IPCTransport'

export class RendererLogger extends Logger {
  private static instance: RendererLogger

  private constructor(config: LoggerConfig) {
    super(config, 'renderer')
    this.initializeTransports()
    this.setupWindowHandlers()
  }

  static getInstance(config?: LoggerConfig): RendererLogger {
    if (!RendererLogger.instance || (config && process.env.NODE_ENV === 'test')) {
      const defaultConfig: LoggerConfig = {
        level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.TRACE,
        sampling: {
          errorRate: 1.0,
          warnRate: 1.0,
          infoRate: process.env.NODE_ENV === 'production' ? 0.8 : 1.0,
          debugRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
          traceRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
          adaptiveSampling: true,
          bypassInDev: true,
        },
        transports: [
          { type: 'console', enabled: process.env.NODE_ENV !== 'production' },
          { type: 'ipc', enabled: true },
        ],
        ringBufferSize: 1000,
        flushInterval: 100,
        environment: process.env.NODE_ENV as any || 'development',
      }

      RendererLogger.instance = new RendererLogger(config || defaultConfig)
    }

    return RendererLogger.instance
  }

  private initializeTransports(): void {
    // Console transport for development
    const consoleTransport = new ConsoleTransport({
      enabled: this.config.environment !== 'production',
    })
    this.transports.push(consoleTransport)

    // IPC transport to forward to main process
    const ipcTransport = new IPCTransport({
      enabled: true,
      isRenderer: true,
    })
    this.transports.push(ipcTransport)
  }

  private setupWindowHandlers(): void {
    // Track navigation timing
    if (typeof window !== 'undefined' && window.performance) {
      window.addEventListener('load', () => {
        const perfData = window.performance.timing
        const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart

        this.info('Page load complete', {
          loadTime: pageLoadTime,
          domContentLoaded: perfData.domContentLoadedEventEnd - perfData.navigationStart,
          domInteractive: perfData.domInteractive - perfData.navigationStart,
        })
      })
    }

    // Track visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.debug('Visibility changed', {
          visible: !document.hidden,
          visibilityState: document.visibilityState,
        })
      })
    }

    // Track online/offline
    window.addEventListener('online', () => {
      this.info('Connection restored')
    })

    window.addEventListener('offline', () => {
      this.warn('Connection lost')
    })

    // Track storage quota
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        const percentUsed = estimate.usage ? (estimate.usage / (estimate.quota || 1)) * 100 : 0

        if (percentUsed > 80) {
          this.warn('Storage quota high', {
            usage: estimate.usage,
            quota: estimate.quota,
            percentUsed: percentUsed.toFixed(2),
          })
        }
      })
    }
  }

  /**
   * Log user interactions
   */
  interaction(action: string, data?: Record<string, any>): void {
    this.info(`User interaction: ${action}`, {
      ...data,
      category: 'interaction',
    })
  }

  /**
   * Log React component lifecycle
   */
  component(name: string, event: 'mount' | 'unmount' | 'update' | 'error', data?: Record<string, any>): void {
    const level = event === 'error' ? LogLevel.ERROR : LogLevel.DEBUG
    this.log(level, `Component ${name} ${event}`, {
      ...data,
      category: 'component',
      componentName: name,
      lifecycle: event,
    })
  }

  /**
   * Log API calls
   */
  api(method: string, url: string, data?: {
    status?: number
    duration?: number
    error?: string
    request?: any
    response?: any
  }): void {
    const level = data?.error ? LogLevel.ERROR :
                  data?.status && data.status >= 400 ? LogLevel.WARN :
                  LogLevel.INFO

    this.log(level, `API ${method} ${url}`, {
      ...data,
      category: 'api',
      method,
      url,
    })
  }

  /**
   * Log navigation events
   */
  navigation(from: string, to: string, data?: Record<string, any>): void {
    this.info(`Navigate: ${from} → ${to}`, {
      ...data,
      category: 'navigation',
      from,
      to,
    })
  }

  /**
   * Log performance metrics
   */
  performance(metric: string, value: number, data?: Record<string, any>): void {
    const level = value > 1000 ? LogLevel.WARN : LogLevel.INFO

    this.log(level, `Performance: ${metric}`, {
      ...data,
      category: 'performance',
      metric,
      value,
      unit: 'ms',
    })
  }

  /**
   * Measure and log function execution time
   */
  async measure<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const startTime = window.performance.now()
    const correlationId = `${name}-${Date.now()}`

    this.trace(`${name} started`, { correlationId })

    try {
      const result = await fn()
      const duration = window.performance.now() - startTime

      this.debug(`${name} completed`, {
        correlationId,
        duration,
      })

      if (duration > 1000) {
        this.warn(`${name} slow execution`, {
          correlationId,
          duration,
        })
      }

      return result
    } catch (error) {
      const duration = window.performance.now() - startTime

      this.error(`${name} failed`, {
        correlationId,
        duration,
        error: (error as Error).message,
      })

      throw error
    }
  }
}

// Export singleton getter
export const getRendererLogger = (config?: LoggerConfig) => RendererLogger.getInstance(config)
