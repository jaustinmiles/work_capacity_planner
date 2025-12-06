import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackedAsync, promiseChain, retryable } from '../decorators-async'
import { LogScope } from '../types'

// Mock the scope helper
const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
}

vi.mock('../scope-helper', () => ({
  getScopedLogger: () => mockLogger,
}))

// Mock the id generator
vi.mock('../utils/id-generator', () => ({
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
}))

describe('decorators-async', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Helper to apply decorator programmatically
  function applyDecorator(
    decorator: (target: any, key: string, desc: PropertyDescriptor) => PropertyDescriptor,
    method: (...args: any[]) => any,
  ) {
    const descriptor: PropertyDescriptor = { value: method, writable: true, configurable: true }
    const target = { constructor: { name: 'TestClass' } }
    const result = decorator(target, 'testMethod', descriptor)
    return result.value
  }

  describe('trackedAsync', () => {
    it('should track successful async method execution', async () => {
      const decorator = trackedAsync({ scope: LogScope.System })
      const originalMethod = async () => 'success'
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod()

      expect(result).toBe('success')
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('started'),
        expect.any(Object),
        expect.any(String),
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('completed'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should track failed async method execution', async () => {
      const decorator = trackedAsync({ scope: LogScope.Database })
      const originalMethod = async () => {
        throw new Error('Test error')
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await expect(wrappedMethod()).rejects.toThrow('Test error')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({ error: 'Test error' }),
        expect.any(String),
      )
    })

    it('should use default scope when not specified', async () => {
      const decorator = trackedAsync()
      const originalMethod = async () => 'default'
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod()

      expect(result).toBe('default')
    })

    it('should trigger warn timeout when method is slow', async () => {
      const decorator = trackedAsync({ warnAfterMs: 100 })
      const originalMethod = async () => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return 'slow'
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const promise = wrappedMethod()

      // Fast-forward past warning threshold
      await vi.advanceTimersByTimeAsync(150)

      // Warning should have been logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('slow'),
        expect.any(Object),
        expect.any(String),
      )

      // Complete the method
      await vi.advanceTimersByTimeAsync(100)
      const result = await promise

      expect(result).toBe('slow')
    })

    it('should trigger error timeout when method is very slow', async () => {
      const decorator = trackedAsync({ errorAfterMs: 100 })
      const originalMethod = async () => {
        await new Promise(resolve => setTimeout(resolve, 200))
        return 'very slow'
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const promise = wrappedMethod()

      // Fast-forward past error threshold
      await vi.advanceTimersByTimeAsync(150)

      // Error should have been logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('timeout exceeded'),
        expect.any(Object),
        expect.any(String),
      )

      // Complete the method
      await vi.advanceTimersByTimeAsync(100)
      const result = await promise

      expect(result).toBe('very slow')
    })

    it('should use custom tag when provided', async () => {
      const decorator = trackedAsync({ tag: 'custom-tag' })
      const originalMethod = async () => 'tagged'
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await wrappedMethod()

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'custom-tag',
      )
    })

    it('should pass arguments to original method', async () => {
      const decorator = trackedAsync()
      const originalMethod = async (a: number, b: string) => `${a}-${b}`
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod(42, 'test')

      expect(result).toBe('42-test')
    })

    it('should clear timeouts on success', async () => {
      const decorator = trackedAsync({ warnAfterMs: 1000, errorAfterMs: 2000 })
      const originalMethod = async () => 'quick'
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod()

      expect(result).toBe('quick')
      // Advance past timeout thresholds - no warnings/errors should be logged
      await vi.advanceTimersByTimeAsync(3000)
      // Only info logs, no warn/error from timeouts
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    it('should clear timeouts on failure', async () => {
      const decorator = trackedAsync({ warnAfterMs: 1000, errorAfterMs: 2000 })
      const originalMethod = async () => {
        throw new Error('Quick fail')
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await expect(wrappedMethod()).rejects.toThrow('Quick fail')
      // Advance past timeout thresholds
      await vi.advanceTimersByTimeAsync(3000)
      // Only the failure error, not timeout errors
      expect(mockLogger.error).toHaveBeenCalledTimes(1)
    })

    it('should handle non-Error thrown values', async () => {
      const decorator = trackedAsync()
      const originalMethod = async () => {
        throw 'string error'
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await expect(wrappedMethod()).rejects.toBe('string error')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: 'string error' }),
        expect.any(String),
      )
    })

    it('should log args when present', async () => {
      const decorator = trackedAsync()
      const originalMethod = async (arg: string) => arg
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await wrappedMethod('test-arg')

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('started'),
        expect.objectContaining({ args: ['test-arg'] }),
        expect.any(String),
      )
    })
  })

  describe('promiseChain', () => {
    it('should track promise chain execution', async () => {
      const decorator = promiseChain({ scope: LogScope.System })
      const originalMethod = () => Promise.resolve('step1').then(() => 'final')
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod()

      expect(result).toBe('final')
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Promise chain started'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should track promise chain failures', async () => {
      const decorator = promiseChain()
      const originalMethod = () =>
        Promise.resolve('step1').then(() => {
          throw new Error('Chain error')
        })
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await expect(wrappedMethod()).rejects.toThrow('Chain error')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Promise chain failed'),
        expect.objectContaining({ error: 'Chain error' }),
        expect.any(String),
      )
    })

    it('should use custom tag when provided', async () => {
      const decorator = promiseChain({ tag: 'custom-chain' })
      const originalMethod = () => Promise.resolve('tagged')
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await wrappedMethod()

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'custom-chain',
      )
    })

    it('should return non-promise values unchanged', () => {
      const decorator = promiseChain()
      const originalMethod = () => 'sync value'
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = wrappedMethod()

      expect(result).toBe('sync value')
    })

    it('should handle non-Error thrown values in chain', async () => {
      const decorator = promiseChain()
      const originalMethod = () =>
        Promise.resolve().then(() => {
          throw 'string chain error'
        })
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await expect(wrappedMethod()).rejects.toBe('string chain error')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: 'string chain error' }),
        expect.any(String),
      )
    })

    it('should log trace for each promise step', async () => {
      const decorator = promiseChain()
      const originalMethod = () => Promise.resolve('done')
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await wrappedMethod()

      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining('Promise step'),
        expect.objectContaining({ step: 1 }),
        expect.any(String),
      )
    })
  })

  describe('retryable', () => {
    it('should succeed on first attempt', async () => {
      const decorator = retryable({ maxRetries: 3 })
      const originalMethod = async () => 'success'
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod()

      expect(result).toBe('success')
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('attempt 1'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should retry on failure and eventually succeed', async () => {
      vi.useRealTimers() // Use real timers for this test
      let attempts = 0
      const decorator = retryable({ maxRetries: 3, backoffMs: 1 }) // Very short backoff
      const originalMethod = async () => {
        attempts++
        if (attempts < 2) {
          throw new Error('Temporary failure')
        }
        return 'eventual success'
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod()

      expect(result).toBe('eventual success')
      expect(attempts).toBe(2)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed, retrying'),
        expect.any(Object),
        expect.any(String),
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('succeeded on attempt 2'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should fail after max retries', async () => {
      vi.useRealTimers() // Use real timers for this test
      const decorator = retryable({ maxRetries: 2, backoffMs: 1 }) // Very short backoff
      const originalMethod = async () => {
        throw new Error('Persistent failure')
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await expect(wrappedMethod()).rejects.toThrow('Persistent failure')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed after 2 attempts'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should use default options', async () => {
      const decorator = retryable()
      const originalMethod = async () => 'default'
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod()

      expect(result).toBe('default')
    })

    it('should use custom tag', async () => {
      const decorator = retryable({ tag: 'custom-retry' })
      const originalMethod = async () => 'tagged'
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await wrappedMethod()

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'custom-retry',
      )
    })

    it('should handle non-Error thrown values', async () => {
      const decorator = retryable({ maxRetries: 1 })
      const originalMethod = async () => {
        throw 'string error'
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      await expect(wrappedMethod()).rejects.toBe('string error')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ error: 'string error' }),
        expect.any(String),
      )
    })

    it('should apply exponential backoff', async () => {
      vi.useRealTimers() // Use real timers for this test
      let attempts = 0
      const decorator = retryable({ maxRetries: 3, backoffMs: 1 }) // Very short backoff
      const originalMethod = async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Need more attempts')
        }
        return 'done'
      }
      const wrappedMethod = applyDecorator(decorator, originalMethod)

      const result = await wrappedMethod()

      expect(result).toBe('done')
      expect(attempts).toBe(3)
    })
  })
})
