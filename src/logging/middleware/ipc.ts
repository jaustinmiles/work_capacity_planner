/**
 * IPC middleware for automatic logging of IPC handlers
 */

import { IpcMainInvokeEvent, ipcMain } from 'electron'
import { MainLogger } from '../main/MainLogger'
import { LogLevel } from '../types'

export interface IPCHandlerOptions {
  logLevel?: LogLevel
  logArgs?: boolean
  logResult?: boolean
  timeout?: number
}

/**
 * Wrap an IPC handler with automatic logging
 */
export function wrapIPCHandler<T extends any[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: T) => Promise<R> | R,
  options: IPCHandlerOptions = {},
): void {
  const logger = MainLogger.getInstance()
  const {
    logArgs = process.env.NODE_ENV !== 'production',
    logResult = false,
    timeout = 30000,
  } = options

  ipcMain.handle(channel, async (event, ...args: T) => {
    const startTime = Date.now()
    const correlationId = `ipc-${channel}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Log the IPC call
    logger.debug(`IPC: ${channel}`, {
      correlationId,
      channel,
      args: logArgs ? args : undefined,
      webContentsId: event.sender.id,
      frameId: event.frameId,
    })

    // Set up timeout
    let timeoutHandle: NodeJS.Timeout | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new Error(`IPC handler timeout: ${channel}`)
        logger.error('IPC handler timeout', {
          correlationId,
          channel,
          duration: Date.now() - startTime,
          timeout,
        })
        reject(error)
      }, timeout)
    })

    try {
      // Race between handler and timeout
      const result = await Promise.race([
        handler(event, ...args),
        timeoutPromise,
      ])

      clearTimeout(timeoutHandle!)

      const duration = Date.now() - startTime

      // Log success
      logger.debug(`IPC completed: ${channel}`, {
        correlationId,
        channel,
        duration,
        result: logResult ? result : undefined,
      })

      // Warn if slow
      if (duration > 1000) {
        logger.warn('Slow IPC handler', {
          correlationId,
          channel,
          duration,
        })
      }

      return result
    } catch (error) {
      clearTimeout(timeoutHandle!)

      const duration = Date.now() - startTime

      // Log error
      logger.error(`IPC failed: ${channel}`, {
        correlationId,
        channel,
        duration,
        error: (error as Error).message,
        stack: (error as Error).stack,
      })

      throw error
    }
  })
}

/**
 * Batch register IPC handlers with logging
 */
export function registerIPCHandlers(
  handlers: Record<string, {
    handler: (event: IpcMainInvokeEvent, ...args: any[]) => any
    options?: IPCHandlerOptions
  }>,
): void {
  for (const [channel, config] of Object.entries(handlers)) {
    wrapIPCHandler(channel, config.handler, config.options)
  }
}

/**
 * Log IPC renderer calls (for preload script)
 */
export function createIPCLogger() {
  return {
    logCall: (channel: string, ...args: any[]) => {
      console.log(`[IPC] Calling ${channel}`, args.length > 0 ? args : '')
    },

    logSuccess: (channel: string, duration: number) => {
      console.log(`[IPC] ${channel} completed in ${duration}ms`)
    },

    logError: (channel: string, error: Error) => {
      console.error(`[IPC] ${channel} failed:`, error)
    },

    wrap: <T extends any[], R>(
      channel: string,
      fn: (...args: T) => Promise<R>,
    ) => {
      return async (...args: T): Promise<R> => {
        const startTime = Date.now()

        try {
          const result = await fn(...args)
          const duration = Date.now() - startTime

          if (duration > 100) {
            console.warn(`[IPC] Slow call: ${channel} took ${duration}ms`)
          }

          return result
        } catch (error) {
          console.error(`[IPC] ${channel} error:`, error)
          throw error
        }
      }
    },
  }
}
