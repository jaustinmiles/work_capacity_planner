import { describe, it, expect, beforeEach } from 'vitest'
import { RendererLogger } from '../renderer/RendererLogger'
import { LogLevel } from '../types'

describe('Logger Integration', () => {
  let logger: RendererLogger

  beforeEach(() => {
    // Get singleton instance
    logger = RendererLogger.getInstance({
      level: LogLevel.TRACE, // Allow all levels including TRACE
      sampling: {
        errorRate: 1.0,
        warnRate: 1.0,
        infoRate: 1.0,
        debugRate: 1.0,
        traceRate: 1.0,
        adaptiveSampling: false,
        bypassInDev: false,
      },
      ringBufferSize: 100,
      flushInterval: 100,
      environment: 'test' as any,
    })

    // Clear the buffer before each test
    logger.dumpBuffer() // This doesn't clear, just gets entries
    // We need to add a clear method or recreate
  })

  describe('Basic logging', () => {
    it('should capture log entries in ring buffer', () => {
      logger.info('Test message', { testData: 'value' })

      const entries = logger.dumpBuffer()
      const lastEntry = entries[entries.length - 1]

      expect(lastEntry).toBeDefined()
      expect(lastEntry.message).toBe('Test message')
      expect(lastEntry.level).toBe(LogLevel.INFO)
      expect(lastEntry.data).toEqual({ testData: 'value' })
    })

    it('should capture all log levels', () => {
      logger.error('Error message')
      logger.warn('Warning message')
      logger.info('Info message')
      logger.debug('Debug message')
      logger.trace('Trace message')

      const entries = logger.dumpBuffer()
      const messages = entries.map(e => e.message)

      expect(messages).toContain('Error message')
      expect(messages).toContain('Warning message')
      expect(messages).toContain('Info message')
      expect(messages).toContain('Debug message')
      expect(messages).toContain('Trace message')
    })

    it('should include context in log entries', () => {
      logger.info('Context test', {
        userId: '123',
        action: 'test_action',
      })

      const entries = logger.dumpBuffer()
      const lastEntry = entries[entries.length - 1]

      expect(lastEntry.data).toMatchObject({
        userId: '123',
        action: 'test_action',
      })
      expect(lastEntry.context).toHaveProperty('timestamp')
      expect(lastEntry.context).toHaveProperty('processType', 'renderer')
    })
  })

  describe('Child loggers', () => {
    it('should share parent ring buffer', () => {
      const child1 = logger.child({ component: 'Component1' })
      const child2 = logger.child({ component: 'Component2' })

      child1.info('Message from child 1')
      child2.info('Message from child 2')
      logger.info('Message from parent')

      // All logs should be in the same buffer
      const parentEntries = logger.dumpBuffer()
      const child1Entries = child1.dumpBuffer()
      const child2Entries = child2.dumpBuffer()

      // All should have the same entries
      expect(parentEntries).toEqual(child1Entries)
      expect(parentEntries).toEqual(child2Entries)

      // Should contain all messages
      const messages = parentEntries.map(e => e.message)
      expect(messages).toContain('Message from child 1')
      expect(messages).toContain('Message from child 2')
      expect(messages).toContain('Message from parent')
    })

    it('should include child context in logs', () => {
      const child = logger.child({
        component: 'TestComponent',
        version: '1.0.0',
      })

      child.info('Child log message')

      const entries = logger.dumpBuffer()
      const lastEntry = entries[entries.length - 1]

      expect(lastEntry.data).toMatchObject({
        component: 'TestComponent',
        version: '1.0.0',
      })
    })

    it('should inherit parent context', () => {
      const parent = logger.child({ app: 'TestApp' })
      const child = parent.child({ module: 'TestModule' })

      child.info('Nested child message')

      const entries = logger.dumpBuffer()
      const lastEntry = entries[entries.length - 1]

      expect(lastEntry.data).toMatchObject({
        app: 'TestApp',
        module: 'TestModule',
      })
    })
  })

  describe('Error logging', () => {
    it('should capture error details', () => {
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at test.js:10:5'

      logger.error('An error occurred', error)

      const entries = logger.dumpBuffer()
      const errorEntry = entries.find(e => e.level === LogLevel.ERROR)

      expect(errorEntry).toBeDefined()
      expect(errorEntry?.error).toMatchObject({
        message: 'Test error',
        stack: expect.stringContaining('Test error'),
      })
    })

    it('should handle errors with additional data', () => {
      const error = new Error('Database error')

      logger.error('Failed to save', error, {
        operation: 'save',
        table: 'users',
        userId: 456,
      })

      const entries = logger.dumpBuffer()
      const errorEntry = entries.find(e => e.message === 'Failed to save')

      expect(errorEntry).toBeDefined()
      expect(errorEntry?.data).toMatchObject({
        operation: 'save',
        table: 'users',
        userId: 456,
      })
      expect(errorEntry?.error?.message).toBe('Database error')
    })
  })

  describe('Ring buffer behavior', () => {
    it('should limit entries to buffer size', () => {
      // Force recreation with small buffer for testing
      const smallLogger = RendererLogger.getInstance({
        level: LogLevel.TRACE,
        sampling: {
          errorRate: 1.0,
          warnRate: 1.0,
          infoRate: 1.0,
          debugRate: 1.0,
          traceRate: 1.0,
        },
        ringBufferSize: 5,
        flushInterval: 100,
        environment: 'test' as any,
      })

      // Clear existing entries by getting the current count
      const initialEntries = smallLogger.dumpBuffer()
      const initialCount = initialEntries.length

      // Add 10 entries to a buffer of size 5
      for (let i = 1; i <= 10; i++) {
        smallLogger.info(`Message ${i}`)
      }

      const allEntries = smallLogger.dumpBuffer()
      // Get only the new entries
      const newEntries = allEntries.slice(initialCount)

      // Should only have the last 5 entries
      expect(newEntries.length).toBeLessThanOrEqual(5)

      // Should contain the latest messages
      const messages = newEntries.map(e => e.message)
      expect(messages).toContain('Message 10')
      expect(messages).toContain('Message 9')
      expect(messages).toContain('Message 8')
      expect(messages).toContain('Message 7')
      expect(messages).toContain('Message 6')

      // Should not contain the oldest messages
      expect(messages).not.toContain('Message 1')
      expect(messages).not.toContain('Message 2')
      expect(messages).not.toContain('Message 3')
      expect(messages).not.toContain('Message 4')
      expect(messages).not.toContain('Message 5')
    })
  })

  describe('Legacy logger compatibility', () => {
    it('should capture logs from legacy logger', async () => {
      // Dynamic import to avoid circular dependency issues
      const { logger: legacyLogger } = await import('../../renderer/utils/logger')

      // Use legacy logger
      legacyLogger.ui.info('Legacy UI message', { component: 'Button' })
      legacyLogger.store.debug('Legacy store message', { action: 'UPDATE' })
      legacyLogger.scheduler.warn('Legacy scheduler warning')
      legacyLogger.ai.error('Legacy AI error', new Error('AI failed'))

      // Check that logs were captured in the new logger
      const entries = logger.dumpBuffer()
      const messages = entries.map(e => e.message)

      expect(messages).toContain('[UI] Legacy UI message')
      expect(messages).toContain('[STORE] Legacy store message')
      expect(messages).toContain('[SCHEDULER] Legacy scheduler warning')
      expect(messages).toContain('[AI] Legacy AI error')

      // Check that scope is included in context
      const uiEntry = entries.find(e => e.message.includes('Legacy UI message'))
      expect(uiEntry?.data).toMatchObject({
        scope: 'ui',
        component: 'Button',
      })
    })
  })
})
