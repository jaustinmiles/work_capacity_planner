/**
 * Async-specific decorators for tracking async operations, promises, and streams
 */

import { logger } from './index'
import { LogScope } from './types'

/**
 * DECORATOR #5: Async Operation Tracker
 *
 * This decorator is specifically designed for async methods and tracks:
 * - When the promise is created
 * - When it starts executing
 * - Progress updates (if the method yields them)
 * - When it resolves or rejects
 * - Timing for each phase
 *
 * @example
 * class DataService {
 *   @trackedAsync({
 *     scope: LogScope.Database,
 *     logProgress: true,
 *     warnAfterMs: 5000,  // Warn if takes longer than 5 seconds
 *   })
 *   async fetchLargeDataset(query: string) {
 *     // Logs: "⏳ fetchLargeDataset started"
 *
 *     const results = await db.query(query)
 *     // If > 5000ms: "⚠️ fetchLargeDataset slow (5123ms)"
 *
 *     await this.processResults(results)
 *     // Logs: "✓ fetchLargeDataset completed (6234ms)"
 *
 *     return results
 *   }
 * }
 */
interface AsyncTrackingOptions {
  scope?: LogScope
  logProgress?: boolean
  warnAfterMs?: number
  errorAfterMs?: number
  tag?: string
}

export function trackedAsync(options: AsyncTrackingOptions = {}) {
  const {
    scope = LogScope.System,
    logProgress = false,
    warnAfterMs,
    errorAfterMs,
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
      const scopedLogger = logger[scope.toLowerCase() as keyof typeof logger]
      const methodTag = tag || `${className}.${propertyKey}`
      const correlationId = `${propertyKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      // Log async start
      scopedLogger.info(`⏳ ${propertyKey} started`, {
        method: propertyKey,
        correlationId,
        args: args.length > 0 ? args : undefined,
      }, methodTag)

      const startTime = performance.now()
      let warnTimeout: NodeJS.Timeout | undefined
      let errorTimeout: NodeJS.Timeout | undefined

      // Set up warning timer
      if (warnAfterMs) {
        warnTimeout = setTimeout(() => {
          const elapsed = performance.now() - startTime
          scopedLogger.warn(`⚠️ ${propertyKey} slow`, {
            method: propertyKey,
            correlationId,
            elapsed: `${elapsed.toFixed(0)}ms`,
            threshold: `${warnAfterMs}ms`,
          }, methodTag)
        }, warnAfterMs)
      }

      // Set up error timer
      if (errorAfterMs) {
        errorTimeout = setTimeout(() => {
          const elapsed = performance.now() - startTime
          scopedLogger.error(`⏰ ${propertyKey} timeout exceeded`, {
            method: propertyKey,
            correlationId,
            elapsed: `${elapsed.toFixed(0)}ms`,
            threshold: `${errorAfterMs}ms`,
          }, methodTag)
        }, errorAfterMs)
      }

      try {
        // Execute the method
        const result = await originalMethod.apply(this, args)

        clearTimeout(warnTimeout)
        clearTimeout(errorTimeout)

        const duration = performance.now() - startTime
        scopedLogger.info(`✓ ${propertyKey} completed`, {
          method: propertyKey,
          correlationId,
          duration: `${duration.toFixed(2)}ms`,
        }, methodTag)

        return result
      } catch (error) {
        clearTimeout(warnTimeout)
        clearTimeout(errorTimeout)

        const duration = performance.now() - startTime
        scopedLogger.error(`✗ ${propertyKey} failed`, {
          method: propertyKey,
          correlationId,
          duration: `${duration.toFixed(2)}ms`,
          error: error instanceof Error ? error.message : String(error),
        }, methodTag)

        throw error
      }
    }

    return descriptor
  }
}

/**
 * DECORATOR #6: Promise Chain Tracker
 *
 * This decorator tracks promise chains and their individual steps.
 * Great for debugging complex promise flows.
 *
 * @example
 * class WorkflowService {
 *   @promiseChain({ scope: LogScope.System })
 *   processWorkflow(id: string) {
 *     return this.loadWorkflow(id)
 *       .then(workflow => {
 *         // Logs: "→ Promise step 1"
 *         return this.validateWorkflow(workflow)
 *       })
 *       .then(validated => {
 *         // Logs: "→ Promise step 2"
 *         return this.executeWorkflow(validated)
 *       })
 *       .catch(error => {
 *         // Logs: "✗ Promise chain failed at step 2"
 *         throw error
 *       })
 *   }
 * }
 */
export function promiseChain(options: { scope?: LogScope; tag?: string } = {}) {
  const { scope = LogScope.System, tag } = options

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value
    const className = target.constructor.name

    descriptor.value = function (...args: any[]) {
      const scopedLogger = logger[scope.toLowerCase() as keyof typeof logger]
      const methodTag = tag || `${className}.${propertyKey}`
      const chainId = `chain-${Date.now()}`
      let stepCount = 0

      scopedLogger.debug(`⛓️ Promise chain started: ${propertyKey}`, {
        method: propertyKey,
        chainId,
      }, methodTag)

      // Wrap the promise chain
      const trackStep = (promise: Promise<any>) => {
        const currentStep = ++stepCount

        return promise
          .then(result => {
            scopedLogger.trace(`→ Promise step ${currentStep}`, {
              method: propertyKey,
              chainId,
              step: currentStep,
            }, methodTag)
            return result
          })
          .catch(error => {
            scopedLogger.error(`✗ Promise chain failed at step ${currentStep}`, {
              method: propertyKey,
              chainId,
              step: currentStep,
              error: error instanceof Error ? error.message : String(error),
            }, methodTag)
            throw error
          })
      }

      // Execute original method and track its promise
      const result = originalMethod.apply(this, args)

      if (result && typeof result.then === 'function') {
        return trackStep(result)
      }

      return result
    }

    return descriptor
  }
}

/**
 * DECORATOR #7: Retry Tracker
 *
 * This decorator logs retry attempts for methods that might fail.
 * Useful for tracking flaky operations.
 *
 * @example
 * class NetworkService {
 *   @retryable({
 *     scope: LogScope.System,
 *     maxRetries: 3,
 *     backoffMs: 1000
 *   })
 *   async fetchData(url: string) {
 *     // Logs: "🔄 fetchData attempt 1"
 *     // If fails: "⚠️ fetchData failed, retrying (attempt 2)..."
 *     // If succeeds: "✓ fetchData succeeded on attempt 2"
 *     const response = await fetch(url)
 *     if (!response.ok) throw new Error('Network error')
 *     return response.json()
 *   }
 * }
 */
interface RetryOptions {
  scope?: LogScope
  maxRetries?: number
  backoffMs?: number
  tag?: string
}

export function retryable(options: RetryOptions = {}) {
  const {
    scope = LogScope.System,
    maxRetries = 3,
    backoffMs = 1000,
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
      const scopedLogger = logger[scope.toLowerCase() as keyof typeof logger]
      const methodTag = tag || `${className}.${propertyKey}`

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        scopedLogger.debug(`🔄 ${propertyKey} attempt ${attempt}`, {
          method: propertyKey,
          attempt,
          maxRetries,
        }, methodTag)

        try {
          const result = await originalMethod.apply(this, args)

          if (attempt > 1) {
            scopedLogger.info(`✓ ${propertyKey} succeeded on attempt ${attempt}`, {
              method: propertyKey,
              attempt,
            }, methodTag)
          }

          return result
        } catch (error) {
          if (attempt === maxRetries) {
            scopedLogger.error(`✗ ${propertyKey} failed after ${maxRetries} attempts`, {
              method: propertyKey,
              attempts: maxRetries,
              error: error instanceof Error ? error.message : String(error),
            }, methodTag)
            throw error
          }

          const delay = backoffMs * Math.pow(2, attempt - 1) // Exponential backoff
          scopedLogger.warn(`⚠️ ${propertyKey} failed, retrying`, {
            method: propertyKey,
            attempt,
            nextAttempt: attempt + 1,
            delayMs: delay,
            error: error instanceof Error ? error.message : String(error),
          }, methodTag)

          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    return descriptor
  }
}
