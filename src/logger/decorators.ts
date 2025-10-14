/**
 * Decorators for automatic logging
 */

import { LogScope } from './types'
import { getScopedLogger } from './scope-helper'

/**
 * DECORATOR #1: Basic Method Logger
 *
 * This decorator wraps a method and logs when it's called.
 *
 * How it works:
 * 1. The decorator receives the class prototype, method name, and descriptor
 * 2. It saves the original method
 * 3. Replaces it with a wrapper that logs, then calls the original
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

  return function (
    target: any,           // The prototype of the class
    propertyKey: string,   // The name of the method
    descriptor: PropertyDescriptor,  // The method descriptor
  ) {
    console.log('🎯 DECORATOR APPLIED TO:', propertyKey, 'on class', target.constructor.name)
    const originalMethod = descriptor.value
    const className = target.constructor.name

    // Replace the method with our wrapper
    descriptor.value = async function (...args: any[]) {
      console.log('🔥 DECORATOR WRAPPER CALLED for', propertyKey)
      const scopedLogger = getScopedLogger(scope)
      const methodTag = tag || `${className}.${propertyKey}`

      // Log method entry
      scopedLogger.debug(`→ ${propertyKey}`, { method: propertyKey }, methodTag)

      try {
        // Call the original method
        const result = await originalMethod.apply(this, args)

        // Log method exit
        scopedLogger.debug(`← ${propertyKey}`, { method: propertyKey }, methodTag)

        return result
      } catch (error) {
        // Log errors
        scopedLogger.error(
          `✗ ${propertyKey} failed`,
          {
            method: propertyKey,
            error: error instanceof Error ? error.message : String(error),
          },
          methodTag,
        )
        throw error
      }
    }

    return descriptor as any
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

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value
    const className = target.constructor.name

    descriptor.value = async function (...args: any[]) {
      const scopedLogger = getScopedLogger(scope)
      const methodTag = tag || `${className}.${propertyKey}`

      // Build entry data with optional args
      const entryData: any = { method: propertyKey }
      if (logArgs && args.length > 0) {
        entryData.args = args
      }

      scopedLogger.debug(`→ ${propertyKey}`, entryData, methodTag)

      const startTime = globalThis.performance.now()

      try {
        const result = await originalMethod.apply(this, args)

        // Build exit data with timing and optional result
        const duration = globalThis.performance.now() - startTime
        const exitData: any = {
          method: propertyKey,
          duration: `${duration.toFixed(2)}ms`,
        }
        if (logResult && result !== undefined) {
          exitData.result = result
        }

        scopedLogger.debug(`← ${propertyKey}`, exitData, methodTag)

        return result
      } catch (error) {
        const duration = globalThis.performance.now() - startTime

        scopedLogger.error(
          `✗ ${propertyKey} failed`,
          {
            method: propertyKey,
            duration: `${duration.toFixed(2)}ms`,
            error: error instanceof Error ? error.message : String(error),
          },
          methodTag,
        )
        throw error
      }
    }

    return descriptor as any
  }
}
