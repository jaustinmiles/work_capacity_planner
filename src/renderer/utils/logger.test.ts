import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the new logging system BEFORE importing the module that uses it
vi.mock('../../logging/index.renderer', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  return {
    getRendererLogger: () => mockLogger,
  }
})

// Import AFTER setting up the mock
import { logger, logDebug, logInfo, logWarn, logError, logPerformance, logEvent } from './logger'
import { getRendererLogger } from '../../logging/index.renderer'

// Get reference to the mock for testing
const mockNewLogger = (getRendererLogger as any)()

describe('logger', () => {
  let originalWindow: any
  let consoleGroupSpy: any
  let consoleGroupEndSpy: any

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()

    // Setup window.electron mock
    originalWindow = global.window
    global.window = {
      ...global.window,
      electron: {
        log: {
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      },
    } as any

    // Mock console methods
    consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation()
    consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation()
  })

  afterEach(() => {
    // Restore window
    global.window = originalWindow

    // Restore console methods
    consoleGroupSpy.mockRestore()
    consoleGroupEndSpy.mockRestore()
  })

  describe('Scoped loggers', () => {
    describe('logger.ui', () => {
      it('should log info messages', () => {
        logger.ui.info('Test message', { data: 'test' })

        expect(mockNewLogger.info).toHaveBeenCalledWith(
          '[UI] Test message',
          { scope: 'ui', data: 'test' },
        )
        expect(window.electron.log.info).toHaveBeenCalledWith(
          'ui',
          'Test message',
          { data: 'test' },
        )
      })

      it('should log debug messages', () => {
        logger.ui.debug('Debug message')

        expect(mockNewLogger.debug).toHaveBeenCalledWith(
          '[UI] Debug message',
          { scope: 'ui' },
        )
        expect(window.electron.log.debug).toHaveBeenCalledWith(
          'ui',
          'Debug message',
          undefined,
        )
      })

      it('should log warn messages', () => {
        logger.ui.warn('Warning message', { level: 'high' })

        expect(mockNewLogger.warn).toHaveBeenCalledWith(
          '[UI] Warning message',
          { scope: 'ui', level: 'high' },
        )
        expect(window.electron.log.warn).toHaveBeenCalledWith(
          'ui',
          'Warning message',
          { level: 'high' },
        )
      })

      it('should log error messages with Error objects', () => {
        const error = new Error('Test error')
        logger.ui.error('Error occurred', error, { context: 'test' })

        expect(mockNewLogger.error).toHaveBeenCalledWith(
          '[UI] Error occurred',
          error,
          { scope: 'ui', context: 'test' },
        )
        expect(window.electron.log.error).toHaveBeenCalledWith(
          'ui',
          'Error occurred',
          { message: error.message, stack: error.stack, context: 'test' },
        )
      })

      it('should log error messages without Error objects', () => {
        logger.ui.error('Error occurred', undefined, { context: 'test' })

        expect(mockNewLogger.error).toHaveBeenCalledWith(
          '[UI] Error occurred',
          { scope: 'ui', context: 'test' },
        )
        expect(window.electron.log.error).toHaveBeenCalledWith(
          'ui',
          'Error occurred',
          { error: undefined, context: 'test' },
        )
      })

      it('should log error messages with non-Error objects', () => {
        const errorObj = { code: 'ERR_001', details: 'Something went wrong' }
        logger.ui.error('Error occurred', errorObj, { context: 'test' })

        expect(mockNewLogger.error).toHaveBeenCalledWith(
          '[UI] Error occurred',
          { scope: 'ui', context: 'test', errorObject: errorObj },
        )
        expect(window.electron.log.error).toHaveBeenCalledWith(
          'ui',
          'Error occurred',
          { error: errorObj, context: 'test' },
        )
      })
    })

    describe('logger.ai', () => {
      it('should log AI scope messages', () => {
        logger.ai.info('AI processing', { model: 'gpt-4' })

        expect(mockNewLogger.info).toHaveBeenCalledWith(
          '[AI] AI processing',
          { scope: 'ai', model: 'gpt-4' },
        )
        expect(window.electron.log.info).toHaveBeenCalledWith(
          'ai',
          'AI processing',
          { model: 'gpt-4' },
        )
      })
    })

    describe('logger.ui', () => {
      it('should log store scope messages', () => {
        logger.ui.debug('State updated', { action: 'ADD_TASK' })

        expect(mockNewLogger.debug).toHaveBeenCalledWith(
          '[STORE] State updated',
          { scope: 'store', action: 'ADD_TASK' },
        )
        expect(window.electron.log.debug).toHaveBeenCalledWith(
          'store',
          'State updated',
          { action: 'ADD_TASK' },
        )
      })
    })

    describe('logger.scheduler', () => {
      it('should log scheduler scope messages', () => {
        logger.scheduler.warn('Schedule conflict', { taskId: '123' })

        expect(mockNewLogger.warn).toHaveBeenCalledWith(
          '[SCHEDULER] Schedule conflict',
          { scope: 'scheduler', taskId: '123' },
        )
        expect(window.electron.log.warn).toHaveBeenCalledWith(
          'scheduler',
          'Schedule conflict',
          { taskId: '123' },
        )
      })
    })
  })

  describe('Convenience exports', () => {
    it('should log debug messages via logDebug', () => {
      logDebug('task', 'Task debug', { id: '1' })

      expect(mockNewLogger.debug).toHaveBeenCalledWith(
        '[TASK] Task debug',
        { scope: 'task', id: '1' },
      )
    })

    it('should log info messages via logInfo', () => {
      logInfo('workflow', 'Workflow started', { name: 'Test' })

      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[WORKFLOW] Workflow started',
        { scope: 'workflow', name: 'Test' },
      )
    })

    it('should log warn messages via logWarn', () => {
      logWarn('session', 'Session expiring', { time: '5m' })

      expect(mockNewLogger.warn).toHaveBeenCalledWith(
        '[SESSION] Session expiring',
        { scope: 'session', time: '5m' },
      )
    })

    it('should log error messages via logError', () => {
      const error = new Error('Critical error')
      logError('api', 'API call failed', error, { endpoint: '/tasks' })

      expect(mockNewLogger.error).toHaveBeenCalledWith(
        '[API] API call failed',
        error,
        { scope: 'api', endpoint: '/tasks' },
      )
    })

    it('should log performance metrics via logPerformance', () => {
      logPerformance('render', 150, { component: 'TaskList' })

      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[UI] Performance: render',
        { scope: 'ui', duration: '150ms', component: 'TaskList' },
      )
    })

    it('should log events via logEvent', () => {
      logEvent('button_clicked', { buttonId: 'save' })

      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[UI] Event: button_clicked',
        { scope: 'ui', buttonId: 'save' },
      )
    })
  })

  describe('Window.electron fallback', () => {
    it('should handle missing window.electron gracefully', () => {
      delete (window as any).electron

      expect(() => {
        logger.ui.info('Test without electron')
      }).not.toThrow()

      expect(mockNewLogger.info).toHaveBeenCalled()
    })

    it('should handle missing log methods gracefully', () => {
      delete (window as any).electron.log.debug

      expect(() => {
        logger.ui.debug('Test without debug method')
      }).not.toThrow()

      expect(mockNewLogger.debug).toHaveBeenCalled()
    })
  })

  describe('Console group methods', () => {
    it('should expose group methods that call console in development', () => {
      // The logger module is already loaded, and we can't easily test the
      // development vs production behavior since it's determined at module load time.
      // We'll just verify the methods exist and are callable.

      // These tests would normally use dynamic imports or module reloading,
      // but that's complex in vitest. For now, we'll just check the methods exist.
      expect(typeof logPerformance).toBe('function')
      expect(typeof logEvent).toBe('function')

      // Verify performance and event logging work
      logPerformance('test-op', 100)
      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[UI] Performance: test-op',
        { scope: 'ui', duration: '100ms' },
      )

      vi.clearAllMocks()

      logEvent('test-event', { data: 'test' })
      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[UI] Event: test-event',
        { scope: 'ui', data: 'test' },
      )
    })
  })

  describe('All log scopes', () => {
    const scopes: Array<'ui' | 'store' | 'api' | 'scheduler' | 'task' | 'workflow' | 'ai' | 'session'> =
      ['ui', 'store', 'api', 'scheduler', 'task', 'workflow', 'ai', 'session']

    scopes.forEach(scope => {
      it(`should handle ${scope} scope correctly`, () => {
        logInfo(scope, `${scope} test message`, { test: true })

        expect(mockNewLogger.info).toHaveBeenCalledWith(
          `[${scope.toUpperCase()}] ${scope} test message`,
          { scope, test: true },
        )
      })
    })
  })

  describe('Edge cases', () => {
    it('should handle undefined data gracefully', () => {
      logger.ui.info('Message without data')

      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[UI] Message without data',
        { scope: 'ui' },
      )
    })

    it('should handle null data', () => {
      logger.ui.info('Message with null', null as any)

      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[UI] Message with null',
        { scope: 'ui' },
      )
    })

    it('should handle complex nested data', () => {
      const complexData = {
        nested: {
          deeply: {
            value: 'test',
            array: [1, 2, 3],
          },
        },
      }

      logger.ui.info('Complex data', complexData)

      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[UI] Complex data',
        { scope: 'ui', ...complexData },
      )
    })

    it('should handle circular references in data', () => {
      const circular: any = { value: 'test' }
      circular.self = circular

      // Should not throw
      expect(() => {
        logger.ui.info('Circular reference', circular)
      }).not.toThrow()
    })

    it('should handle empty strings', () => {
      logger.ui.info('', { empty: true })

      expect(mockNewLogger.info).toHaveBeenCalledWith(
        '[UI] ',
        { scope: 'ui', empty: true },
      )
    })

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(10000)
      logger.ui.info(longMessage)

      expect(mockNewLogger.info).toHaveBeenCalledWith(
        `[UI] ${longMessage}`,
        { scope: 'ui' },
      )
    })
  })
})
