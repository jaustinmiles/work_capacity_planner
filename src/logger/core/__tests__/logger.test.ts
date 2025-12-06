import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Logger } from '../logger'
import { Transport, ConsoleTransport } from '../transport'
import { LogLevel, LogScope, LogEntry } from '../../types'

// Mock transport for testing
class MockTransport extends Transport {
  public writtenEntries: LogEntry[] = []

  constructor() {
    super('mock')
  }

  write(entry: LogEntry): void {
    if (this.isEnabled()) {
      this.writtenEntries.push(entry)
    }
  }

  clear(): void {
    this.writtenEntries = []
  }
}

describe('Logger', () => {
  let logger: Logger
  let mockTransport: MockTransport

  beforeEach(() => {
    // Reset singleton before each test
    Logger.reset()
    logger = Logger.getInstance({
      level: LogLevel.TRACE, // Enable all log levels
      enableDecorators: true,
      enableStackTrace: false,
      stackTraceDepth: 5,
      enableDatabase: false,
      enableConsole: false,
      enableAggregation: false,
      aggregationWindowMs: 1000,
    })
    mockTransport = new MockTransport()
    logger.addTransport(mockTransport)
  })

  afterEach(() => {
    Logger.reset()
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = Logger.getInstance()
      const instance2 = Logger.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should reset the singleton instance', () => {
      const instance1 = Logger.getInstance()
      Logger.reset()
      const instance2 = Logger.getInstance()
      // After reset, a new instance is created
      expect(instance1).not.toBe(instance2)
    })

    it('should use default config when none provided', () => {
      Logger.reset()
      const newLogger = Logger.getInstance()
      const config = newLogger.getConfig()
      expect(config.level).toBe(LogLevel.INFO)
      expect(config.enableConsole).toBe(true)
    })
  })

  describe('Log Level Methods', () => {
    it('should log error messages', () => {
      logger.error('Test error message', { code: 500 })
      expect(mockTransport.writtenEntries).toHaveLength(1)
      expect(mockTransport.writtenEntries[0].level).toBe(LogLevel.ERROR)
      expect(mockTransport.writtenEntries[0].message).toBe('Test error message')
    })

    it('should log warn messages', () => {
      logger.warn('Test warning', { severity: 'medium' })
      expect(mockTransport.writtenEntries).toHaveLength(1)
      expect(mockTransport.writtenEntries[0].level).toBe(LogLevel.WARN)
    })

    it('should log info messages', () => {
      logger.info('Test info', { operation: 'test' })
      expect(mockTransport.writtenEntries).toHaveLength(1)
      expect(mockTransport.writtenEntries[0].level).toBe(LogLevel.INFO)
    })

    it('should log debug messages', () => {
      logger.debug('Test debug', { variable: 'value' })
      expect(mockTransport.writtenEntries).toHaveLength(1)
      expect(mockTransport.writtenEntries[0].level).toBe(LogLevel.DEBUG)
    })

    it('should log trace messages', () => {
      logger.trace('Test trace', { detail: 'verbose' })
      expect(mockTransport.writtenEntries).toHaveLength(1)
      expect(mockTransport.writtenEntries[0].level).toBe(LogLevel.TRACE)
    })

    it('should include tag in log messages', () => {
      logger.info('Tagged message', { data: 1 }, 'custom-tag')
      expect(mockTransport.writtenEntries[0].context.tag).toBe('custom-tag')
    })
  })

  describe('Level Filtering', () => {
    it('should filter out logs below configured level', () => {
      Logger.reset()
      const strictLogger = Logger.getInstance({
        level: LogLevel.WARN,
        enableDecorators: false,
        enableStackTrace: false,
        stackTraceDepth: 0,
        enableDatabase: false,
        enableConsole: false,
        enableAggregation: false,
        aggregationWindowMs: 1000,
      })

      const transport = new MockTransport()
      strictLogger.addTransport(transport)

      strictLogger.error('Error message')
      strictLogger.warn('Warn message')
      strictLogger.info('Info message') // Should be filtered
      strictLogger.debug('Debug message') // Should be filtered
      strictLogger.trace('Trace message') // Should be filtered

      expect(transport.writtenEntries).toHaveLength(2)
      expect(transport.writtenEntries[0].level).toBe(LogLevel.ERROR)
      expect(transport.writtenEntries[1].level).toBe(LogLevel.WARN)
    })

    it('should change level dynamically with setLevel', () => {
      logger.setLevel(LogLevel.ERROR)

      logger.error('Error message')
      logger.info('Info message') // Should be filtered

      expect(mockTransport.writtenEntries).toHaveLength(1)

      // Change level to INFO
      logger.setLevel(LogLevel.INFO)
      mockTransport.clear()

      logger.info('Now visible')
      expect(mockTransport.writtenEntries).toHaveLength(1)
    })
  })

  describe('Pattern Ignore Management', () => {
    it('should add patterns to ignore list', () => {
      logger.ignorePattern('noisy:component:*')
      const patterns = logger.getIgnoredPatterns()
      expect(patterns).toContain('noisy:component:*')
    })

    it('should return all ignored patterns', () => {
      logger.ignorePattern('pattern1')
      logger.ignorePattern('pattern2')
      const patterns = logger.getIgnoredPatterns()
      expect(patterns).toHaveLength(2)
      expect(patterns).toContain('pattern1')
      expect(patterns).toContain('pattern2')
    })

    it('should clear all ignored patterns', () => {
      logger.ignorePattern('pattern1')
      logger.ignorePattern('pattern2')
      logger.clearIgnoredPatterns()
      const patterns = logger.getIgnoredPatterns()
      expect(patterns).toHaveLength(0)
    })
  })

  describe('Transport Management', () => {
    it('should add transport', () => {
      const newTransport = new MockTransport()
      logger.addTransport(newTransport)
      logger.info('Test message')
      // Both transports should receive the message
      expect(mockTransport.writtenEntries).toHaveLength(1)
      expect(newTransport.writtenEntries).toHaveLength(1)
    })

    it('should remove transport', () => {
      logger.removeTransport(mockTransport)
      logger.info('Test message')
      expect(mockTransport.writtenEntries).toHaveLength(0)
    })

    it('should send logs to all active transports', () => {
      const transport1 = new MockTransport()
      const transport2 = new MockTransport()
      logger.addTransport(transport1)
      logger.addTransport(transport2)

      logger.info('Broadcast message')

      // Original + 2 new transports
      expect(mockTransport.writtenEntries).toHaveLength(1)
      expect(transport1.writtenEntries).toHaveLength(1)
      expect(transport2.writtenEntries).toHaveLength(1)
    })
  })

  describe('Scoped Loggers', () => {
    it('should provide UI scoped logger', () => {
      logger.ui.info('UI message')
      expect(mockTransport.writtenEntries[0].context.scope).toBe(LogScope.UI)
    })

    it('should provide Database scoped logger', () => {
      logger.db.info('DB message')
      expect(mockTransport.writtenEntries[0].context.scope).toBe(LogScope.Database)
    })

    it('should provide Server scoped logger', () => {
      logger.server.info('Server message')
      expect(mockTransport.writtenEntries[0].context.scope).toBe(LogScope.Server)
    })

    it('should provide IPC scoped logger', () => {
      logger.ipc.info('IPC message')
      expect(mockTransport.writtenEntries[0].context.scope).toBe(LogScope.IPC)
    })

    it('should provide System scoped logger', () => {
      logger.system.info('System message')
      expect(mockTransport.writtenEntries[0].context.scope).toBe(LogScope.System)
    })
  })

  describe('Configuration', () => {
    it('should return current config via getConfig', () => {
      const config = logger.getConfig()
      expect(config.level).toBe(LogLevel.TRACE)
      expect(config.enableAggregation).toBe(false)
    })

    it('should return a copy of config (not reference)', () => {
      const config = logger.getConfig()
      config.level = LogLevel.ERROR
      // Original config should be unchanged
      expect(logger.getConfig().level).toBe(LogLevel.TRACE)
    })
  })

  describe('Log Aggregation', () => {
    it('should aggregate repeated messages when enabled', async () => {
      Logger.reset()
      const aggregatingLogger = Logger.getInstance({
        level: LogLevel.INFO,
        enableDecorators: false,
        enableStackTrace: false,
        stackTraceDepth: 0,
        enableDatabase: false,
        enableConsole: false,
        enableAggregation: true,
        aggregationWindowMs: 100,
      })

      const transport = new MockTransport()
      aggregatingLogger.addTransport(transport)

      // Send same message multiple times rapidly
      aggregatingLogger.info('Repeated message')
      aggregatingLogger.info('Repeated message')
      aggregatingLogger.info('Repeated message')

      // Only first should be written (others aggregated)
      expect(transport.writtenEntries.length).toBe(1)
    })
  })
})

describe('Transport Base Class', () => {
  it('should enable/disable transport', () => {
    const transport = new MockTransport()
    expect(transport.isEnabled()).toBe(true)

    transport.disable()
    expect(transport.isEnabled()).toBe(false)

    transport.enable()
    expect(transport.isEnabled()).toBe(true)
  })

  it('should return transport name', () => {
    const transport = new MockTransport()
    expect(transport.getName()).toBe('mock')
  })

  it('should destroy and disable transport', () => {
    const transport = new MockTransport()
    transport.destroy()
    expect(transport.isEnabled()).toBe(false)
  })

  it('should not write when disabled', () => {
    const transport = new MockTransport()
    transport.disable()

    transport.write({
      timestamp: new Date(),
      level: LogLevel.INFO,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Test message',
    })

    expect(transport.writtenEntries).toHaveLength(0)
  })
})

describe('ConsoleTransport', () => {
  let consoleTransport: ConsoleTransport
  let consoleSpy: {
    error: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    info: ReturnType<typeof vi.spyOn>
    debug: ReturnType<typeof vi.spyOn>
    log: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    consoleTransport = new ConsoleTransport()
    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should write error level to console.error', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.ERROR,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Error message',
    })

    expect(consoleSpy.error).toHaveBeenCalled()
  })

  it('should write warn level to console.warn', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.WARN,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Warning message',
    })

    expect(consoleSpy.warn).toHaveBeenCalled()
  })

  it('should write info level to console.info', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.INFO,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Info message',
    })

    expect(consoleSpy.info).toHaveBeenCalled()
  })

  it('should write debug level to console.debug', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.DEBUG,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Debug message',
    })

    expect(consoleSpy.debug).toHaveBeenCalled()
  })

  it('should write trace level to console.log', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.TRACE,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Trace message',
    })

    expect(consoleSpy.log).toHaveBeenCalled()
  })

  it('should not write when disabled', () => {
    consoleTransport.disable()

    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.INFO,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Should not appear',
    })

    expect(consoleSpy.info).not.toHaveBeenCalled()
  })

  it('should include data in output when present', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.INFO,
      context: { scope: LogScope.UI, component: 'Component' },
      message: 'Message with data',
      data: { key: 'value' },
    })

    expect(consoleSpy.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'Message with data',
      { key: 'value' },
    )
  })

  it('should include stack trace when present', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.ERROR,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Error with stack',
      stack: ['at func1()', 'at func2()'],
    })

    expect(consoleSpy.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'Error with stack',
      '\nStack:',
      expect.any(Array),
    )
  })

  it('should include tag in prefix when provided', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.INFO,
      context: { scope: LogScope.System, component: 'Test', tag: 'custom-tag' },
      message: 'Tagged message',
    })

    const callArgs = consoleSpy.info.mock.calls[0]
    expect(callArgs[0]).toContain('[custom-tag]')
  })

  it('should include aggregate count in prefix when present', () => {
    consoleTransport.write({
      timestamp: new Date(),
      level: LogLevel.INFO,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Aggregated message',
      aggregateCount: 5,
    })

    const callArgs = consoleSpy.info.mock.calls[0]
    expect(callArgs[0]).toContain('(×5)')
  })

  it('should suppress rapid duplicate messages', () => {
    const entry = {
      timestamp: new Date(),
      level: LogLevel.INFO,
      context: { scope: LogScope.System, component: 'Test' },
      message: 'Repeated message',
    }

    // First call should log
    consoleTransport.write(entry)
    // Immediate second call should be suppressed
    consoleTransport.write(entry)

    expect(consoleSpy.info).toHaveBeenCalledTimes(1)
  })
})
