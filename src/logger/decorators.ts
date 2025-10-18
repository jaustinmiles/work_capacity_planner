/**
 * Decorators for automatic logging
 */

import { LogScope } from './types'
import { getScopedLogger } from './scope-helper'

// Re-export common decorators with better names
export { trackedAsync as AsyncTracker } from './decorators-async'
export { promiseChain as PromiseChain } from './decorators-async'
export { retryable as Retryable } from './decorators-async'


/**
 * DECORATOR #1: Basic Method Logger (Stage 3 Decorators)
 *
 * This decorator wraps a method and logs when it's called.
 *
 * How it works with Stage 3 decorators:
 * 1. The decorator receives the original method and a context object
 * 2. It returns a new function that wraps the original
 * 3. The wrapper logs entry/exit and handles errors
 *
 * @example
 * class TaskService {
 *   @logged()
 *   async loadTasks() {
 *     // This will automatically log: "→ loadTasks"
 *     return await db.getTasks()
 *     // And then log: "← loadTasks"
 *   }
 * }
 */
export function logged(options: { scope?: LogScope; tag?: string } = {}) {
  const { scope = LogScope.System, tag } = options

  return function <This, Args extends any[], Return>(
    originalMethod: (...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (...args: Args) => Return>,
  ) {
    const methodName = String(context.name)

    // Return a replacement method
    return function (this: This, ...args: Args): Return {
      const scopedLogger = getScopedLogger(scope)
      const className = (this as any).constructor.name
      const methodTag = tag || `${className}.${methodName}`

      // Log method entry
      scopedLogger.debug(`→ ${methodName}`, { method: methodName }, methodTag)

      try {
        // Call the original method
        const result = originalMethod.apply(this, args)

        // Handle both sync and async results
        if (result && typeof (result as any).then === 'function') {
          return (result as any).then(
            (value: any) => {
              scopedLogger.debug(`← ${methodName}`, { method: methodName }, methodTag)
              return value
            },
            (error: any) => {
              scopedLogger.error(
                `✗ ${methodName} failed`,
                {
                  method: methodName,
                  error: error instanceof Error ? error.message : String(error),
                },
                methodTag,
              )
              throw error
            },
          )
        }

        // Sync result
        scopedLogger.debug(`← ${methodName}`, { method: methodName }, methodTag)
        return result
      } catch (error) {
        // Log errors for sync methods
        scopedLogger.error(
          `✗ ${methodName} failed`,
          {
            method: methodName,
            error: error instanceof Error ? error.message : String(error),
          },
          methodTag,
        )
        throw error
      }
    }
  }
}

/**
 * DECORATOR #2: Advanced Logger with Detailed Options
 *
 * This is a more powerful version that can capture:
 * - Arguments passed to the method
 * - Return values from the method
 * - Execution time
 *
 * @example
 * class DatabaseService {
 *   @loggedVerbose({
 *     scope: LogScope.Database,
 *     logArgs: true,    // Captures input
 *     logResult: true,  // Captures output
 *   })
 *   async findUser(id: string) {
 *     // Logs: "→ findUser" with args: ["user-123"]
 *     const user = await db.query(...)
 *     // Logs: "← findUser (45ms)" with result: {id: "user-123", name: "John"}
 *     return user
 *   }
 * }
 */
interface VerboseLogOptions {
  scope?: LogScope
  logArgs?: boolean
  logResult?: boolean
  tag?: string
}

export function loggedVerbose(options: VerboseLogOptions = {}) {
  const {
    scope = LogScope.System,
    logArgs = false,
    logResult = false,
    tag,
  } = options

  return function <This, Args extends any[], Return>(
    originalMethod: (...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (...args: Args) => Return>,
  ) {
    const methodName = String(context.name)

    return async function (this: This, ...args: Args): Promise<any> {
      const scopedLogger = getScopedLogger(scope)
      const className = (this as any).constructor.name
      const methodTag = tag || `${className}.${methodName}`

      // Build entry data with optional args
      const entryData: any = { method: methodName }
      if (logArgs && args.length > 0) {
        entryData.args = args
      }

      scopedLogger.debug(`→ ${methodName}`, entryData, methodTag)

      const startTime = globalThis.performance.now()

      try {
        const result = await originalMethod.apply(this, args)

        // Build exit data with timing and optional result
        const duration = globalThis.performance.now() - startTime
        const exitData: any = {
          method: methodName,
          duration: `${duration.toFixed(2)}ms`,
        }
        if (logResult && result !== undefined) {
          exitData.result = result
        }

        scopedLogger.debug(`← ${methodName}`, exitData, methodTag)

        return result
      } catch (error) {
        const duration = globalThis.performance.now() - startTime

        scopedLogger.error(
          `✗ ${methodName} failed`,
          {
            method: methodName,
            duration: `${duration.toFixed(2)}ms`,
            error: error instanceof Error ? error.message : String(error),
          },
          methodTag,
        )
        throw error
      }
    }
  }
}
