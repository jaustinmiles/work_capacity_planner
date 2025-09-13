import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLogger, logger } from './index.renderer'
import { getRendererLogger } from './renderer/RendererLogger'

// Mock getRendererLogger
vi.mock('./renderer/RendererLogger', () => ({
  getRendererLogger: vi.fn(() => ({
    child: vi.fn(() => ({ info: vi.fn(), debug: vi.fn() })),
  })),
  RendererLogger: vi.fn(),
}))

describe('logging/index.renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createLogger', () => {
    it('should create logger using getRendererLogger', () => {
      const config = { level: 'debug' as const }
      createLogger(config)

      expect(getRendererLogger).toHaveBeenCalledWith(config)
    })

    it('should work without config', () => {
      createLogger()

      expect(getRendererLogger).toHaveBeenCalledWith(undefined)
    })
  })

  describe('logger categories', () => {
    it('should provide main logger', () => {
      const mainLogger = logger.main
      expect(mainLogger).toBeDefined()
      expect(getRendererLogger).toHaveBeenCalled()
    })

    it('should provide database logger with category', () => {
      const mockChild = vi.fn(() => ({ info: vi.fn() }))
      const mockLogger = { child: mockChild }
      vi.mocked(getRendererLogger).mockReturnValue(mockLogger as any)

      const dbLogger = logger.db
      expect(dbLogger).toBeDefined()
      expect(mockChild).toHaveBeenCalledWith({ category: 'database' })
    })

    it('should provide api logger with category', () => {
      const mockChild = vi.fn(() => ({ info: vi.fn() }))
      const mockLogger = { child: mockChild }
      vi.mocked(getRendererLogger).mockReturnValue(mockLogger as any)

      const apiLogger = logger.api
      expect(apiLogger).toBeDefined()
      expect(mockChild).toHaveBeenCalledWith({ category: 'api' })
    })

    it('should provide ui logger with category', () => {
      const mockChild = vi.fn(() => ({ info: vi.fn() }))
      const mockLogger = { child: mockChild }
      vi.mocked(getRendererLogger).mockReturnValue(mockLogger as any)

      const uiLogger = logger.ui
      expect(uiLogger).toBeDefined()
      expect(mockChild).toHaveBeenCalledWith({ category: 'ui' })
    })

    it('should provide ipc logger with category', () => {
      const mockChild = vi.fn(() => ({ info: vi.fn() }))
      const mockLogger = { child: mockChild }
      vi.mocked(getRendererLogger).mockReturnValue(mockLogger as any)

      const ipcLogger = logger.ipc
      expect(ipcLogger).toBeDefined()
      expect(mockChild).toHaveBeenCalledWith({ category: 'ipc' })
    })

    it('should provide scheduler logger with category', () => {
      const mockChild = vi.fn(() => ({ info: vi.fn() }))
      const mockLogger = { child: mockChild }
      vi.mocked(getRendererLogger).mockReturnValue(mockLogger as any)

      const schedulerLogger = logger.scheduler
      expect(schedulerLogger).toBeDefined()
      expect(mockChild).toHaveBeenCalledWith({ category: 'scheduler' })
    })

    it('should provide ai logger with category', () => {
      const mockChild = vi.fn(() => ({ info: vi.fn() }))
      const mockLogger = { child: mockChild }
      vi.mocked(getRendererLogger).mockReturnValue(mockLogger as any)

      const aiLogger = logger.ai
      expect(aiLogger).toBeDefined()
      expect(mockChild).toHaveBeenCalledWith({ category: 'ai' })
    })

    it('should provide performance logger with category', () => {
      const mockChild = vi.fn(() => ({ info: vi.fn() }))
      const mockLogger = { child: mockChild }
      vi.mocked(getRendererLogger).mockReturnValue(mockLogger as any)

      const perfLogger = logger.performance
      expect(perfLogger).toBeDefined()
      expect(mockChild).toHaveBeenCalledWith({ category: 'performance' })
    })
  })

  describe('exports', () => {
    it('should export necessary functions', () => {
      expect(createLogger).toBeDefined()
      expect(typeof createLogger).toBe('function')
      expect(logger).toBeDefined()
      expect(typeof logger).toBe('object')
    })
  })
})
