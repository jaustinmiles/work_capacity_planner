import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConsoleTransport } from './ConsoleTransport'
import { LogEntry, LogLevel } from '../types'
import { StructuredLogger } from '../core/StructuredLogger'

// Mock StructuredLogger
vi.mock('../core/StructuredLogger', () => ({
  StructuredLogger: vi.fn().mockImplementation(() => ({
    toConsole: vi.fn((entry) => `[${entry.level}] ${entry.message}`),
  })),
}))

describe('ConsoleTransport', () => {
  let consoleLogSpy: any
  let consoleWarnSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('constructor', () => {
    it('should use default options', () => {
      const transport = new ConsoleTransport()

      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        data: {},
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should accept custom options', () => {
      const transport = new ConsoleTransport({
        enabled: false,
        minLevel: LogLevel.ERROR,
      })

      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        data: {},
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])
      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should detect main process environment', () => {
      const originalWindow = global.window
      // @ts-expect-error - Deleting window for test
      delete global.window

      // Creating transport triggers constructor
      new ConsoleTransport()
      expect(StructuredLogger).toHaveBeenCalledWith('main')

      global.window = originalWindow
    })

    it('should detect renderer process environment', () => {
      global.window = {} as any

      // Creating transport triggers constructor
      new ConsoleTransport()
      expect(StructuredLogger).toHaveBeenCalledWith('renderer')
    })
  })

  describe('write', () => {
    it('should write INFO logs to console.log', () => {
      const transport = new ConsoleTransport()

      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Info message',
        data: {},
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])

      expect(consoleLogSpy).toHaveBeenCalledWith('[2] Info message')
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('should write WARN logs to console.warn', () => {
      const transport = new ConsoleTransport()

      const entry: LogEntry = {
        level: LogLevel.WARN,
        message: 'Warning message',
        data: {},
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])

      expect(consoleWarnSpy).toHaveBeenCalledWith('[1] Warning message')
      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('should write ERROR logs to console.error', () => {
      const transport = new ConsoleTransport()

      const entry: LogEntry = {
        level: LogLevel.ERROR,
        message: 'Error message',
        data: {},
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])

      expect(consoleErrorSpy).toHaveBeenCalledWith('[0] Error message')
      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('should write DEBUG logs to console.log', () => {
      const transport = new ConsoleTransport()

      const entry: LogEntry = {
        level: LogLevel.DEBUG,
        message: 'Debug message',
        data: {},
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])

      expect(consoleLogSpy).toHaveBeenCalledWith('[3] Debug message')
    })

    it('should write TRACE logs to console.log', () => {
      const transport = new ConsoleTransport()

      const entry: LogEntry = {
        level: LogLevel.TRACE,
        message: 'Trace message',
        data: {},
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])

      expect(consoleLogSpy).toHaveBeenCalledWith('[4] Trace message')
    })

    it('should not write when disabled', () => {
      const transport = new ConsoleTransport({ enabled: false })

      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        data: {},
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])

      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('should respect minimum log level', () => {
      const transport = new ConsoleTransport({ minLevel: LogLevel.WARN })

      const entries: LogEntry[] = [
        {
          level: LogLevel.DEBUG,
          message: 'Debug message',
          data: {},
          context: { timestamp: new Date().toISOString(), source: 'test' },
        },
        {
          level: LogLevel.INFO,
          message: 'Info message',
          data: {},
          context: { timestamp: new Date().toISOString(), source: 'test' },
        },
        {
          level: LogLevel.WARN,
          message: 'Warning message',
          data: {},
          context: { timestamp: new Date().toISOString(), source: 'test' },
        },
        {
          level: LogLevel.ERROR,
          message: 'Error message',
          data: {},
          context: { timestamp: new Date().toISOString(), source: 'test' },
        },
      ]

      transport.write(entries)

      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple entries', () => {
      const transport = new ConsoleTransport()

      const entries: LogEntry[] = [
        {
          level: LogLevel.INFO,
          message: 'First message',
          data: {},
          context: { timestamp: new Date().toISOString(), source: 'test' },
        },
        {
          level: LogLevel.WARN,
          message: 'Second message',
          data: {},
          context: { timestamp: new Date().toISOString(), source: 'test' },
        },
        {
          level: LogLevel.ERROR,
          message: 'Third message',
          data: {},
          context: { timestamp: new Date().toISOString(), source: 'test' },
        },
      ]

      transport.write(entries)

      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    })

    it('should use StructuredLogger for formatting', () => {
      const mockToConsole = vi.fn(() => 'Formatted output')
      vi.mocked(StructuredLogger).mockImplementation(() => ({
        toConsole: mockToConsole,
      }) as any)

      const transport = new ConsoleTransport()

      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        data: { key: 'value' },
        context: { timestamp: new Date().toISOString(), source: 'test' },
      }

      transport.write([entry])

      expect(mockToConsole).toHaveBeenCalledWith(entry)
      expect(consoleLogSpy).toHaveBeenCalledWith('Formatted output')
    })
  })

  describe('close', () => {
    it('should do nothing when closed', () => {
      const transport = new ConsoleTransport()

      // Should not throw
      expect(() => transport.close()).not.toThrow()
    })
  })
})
