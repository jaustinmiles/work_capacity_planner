import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLogger, logger } from './index'
import { MainLogger } from './main/MainLogger'
import { RendererLogger } from './renderer/RendererLogger'

// Mock the MainLogger and RendererLogger
vi.mock('./main/MainLogger', () => ({
  MainLogger: {
    getInstance: vi.fn(() => ({
      child: vi.fn(() => ({ info: vi.fn(), debug: vi.fn() })),
    })),
  },
}))

vi.mock('./renderer/RendererLogger', () => ({
  RendererLogger: {
    getInstance: vi.fn(() => ({
      child: vi.fn(() => ({ info: vi.fn(), debug: vi.fn() })),
    })),
  },
}))

describe('logging/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createLogger', () => {
    it('should create MainLogger in main process', () => {
      // Mock main process environment
      const originalWindow = global.window
      // @ts-expect-error - Deleting window for test
      delete global.window

      const config = { level: 'debug' as const }
      createLogger(config)

      expect(MainLogger.getInstance).toHaveBeenCalledWith(config)
      expect(RendererLogger.getInstance).not.toHaveBeenCalled()

      // Restore window
      global.window = originalWindow
    })

    it('should create RendererLogger in renderer process', () => {
      // Ensure window is defined (renderer process)
      global.window = {} as any

      const config = { level: 'info' as const }
      createLogger(config)

      expect(RendererLogger.getInstance).toHaveBeenCalledWith(config)
      expect(MainLogger.getInstance).not.toHaveBeenCalled()
    })

    it('should work without config', () => {
      global.window = {} as any
      createLogger()

      expect(RendererLogger.getInstance).toHaveBeenCalledWith(undefined)
    })
  })

  describe('logger categories', () => {
    beforeEach(() => {
      global.window = {} as any
    })

    it('should provide main logger', () => {
      const mainLogger = logger.main
      expect(mainLogger).toBeDefined()
      expect(RendererLogger.getInstance).toHaveBeenCalled()
    })

    it('should provide database logger', () => {
      const dbLogger = logger.db
      expect(dbLogger).toBeDefined()
      expect(RendererLogger.getInstance).toHaveBeenCalled()
    })

    it('should provide api logger', () => {
      const apiLogger = logger.api
      expect(apiLogger).toBeDefined()
      expect(RendererLogger.getInstance).toHaveBeenCalled()
    })

    it('should provide ui logger', () => {
      const uiLogger = logger.ui
      expect(uiLogger).toBeDefined()
      expect(RendererLogger.getInstance).toHaveBeenCalled()
    })

    it('should provide ipc logger', () => {
      const ipcLogger = logger.ipc
      expect(ipcLogger).toBeDefined()
      expect(RendererLogger.getInstance).toHaveBeenCalled()
    })

    it('should provide scheduler logger', () => {
      const schedulerLogger = logger.scheduler
      expect(schedulerLogger).toBeDefined()
      expect(RendererLogger.getInstance).toHaveBeenCalled()
    })

    it('should provide ai logger', () => {
      const aiLogger = logger.ai
      expect(aiLogger).toBeDefined()
      expect(RendererLogger.getInstance).toHaveBeenCalled()
    })

    it('should provide performance logger', () => {
      const perfLogger = logger.performance
      expect(perfLogger).toBeDefined()
      expect(RendererLogger.getInstance).toHaveBeenCalled()
    })

    it('should create child loggers with correct category', () => {
      const mockChild = vi.fn(() => ({ info: vi.fn() }))
      const mockLogger = { child: mockChild }
      vi.mocked(RendererLogger.getInstance).mockReturnValue(mockLogger as any)

      // Access db logger
      const _dbLogger = logger.db
      expect(mockChild).toHaveBeenCalledWith({ category: 'database' })

      // Clear and access api logger
      mockChild.mockClear()
      const _apiLogger = logger.api
      expect(mockChild).toHaveBeenCalledWith({ category: 'api' })
    })
  })

  describe('exports', () => {
    it('should export all necessary functions', () => {
      // Just verify the functions are exported from the module
      expect(createLogger).toBeDefined()
      expect(typeof createLogger).toBe('function')
      expect(logger).toBeDefined()
      expect(typeof logger).toBe('object')
    })
  })
})
