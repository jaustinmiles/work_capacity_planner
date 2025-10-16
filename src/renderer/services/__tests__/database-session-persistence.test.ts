import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDatabase } from '../database'
import { Session } from '@shared/types'

// Mock window.electronAPI
const mockSwitchSession = vi.fn()
const mockGetSessions = vi.fn()
const mockCreateSession = vi.fn()

vi.mock('../../../shared/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

// Setup window.electronAPI mock
global.window = {
  electronAPI: {
    db: {
      switchSession: mockSwitchSession,
      getSessions: mockGetSessions,
      createSession: mockCreateSession,
    },
  },
} as any

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('Database Session Persistence', () => {
  const db = getDatabase()

  const mockSession: Session = {
    id: 'session-1',
    name: 'Test Session',
    description: 'Test description',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockSessions: Session[] = [
    mockSession,
    {
      id: 'session-2',
      name: 'Another Session',
      description: 'Another description',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('switchSession', () => {
    it('should save session ID to localStorage when switching sessions', async () => {
      mockSwitchSession.mockResolvedValue(mockSession)

      await db.switchSession('session-1')

      expect(mockSwitchSession).toHaveBeenCalledWith('session-1')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('lastUsedSessionId', 'session-1')
    })

    it('should return the switched session', async () => {
      mockSwitchSession.mockResolvedValue(mockSession)

      const result = await db.switchSession('session-1')

      expect(result).toEqual(mockSession)
    })

    it('should handle errors when switching sessions', async () => {
      const error = new Error('Failed to switch session')
      mockSwitchSession.mockRejectedValue(error)

      await expect(db.switchSession('session-1')).rejects.toThrow('Failed to switch session')

      // localStorage should not be updated on error
      expect(localStorageMock.setItem).not.toHaveBeenCalled()
    })
  })

  describe('createSession', () => {
    it('should save new session ID to localStorage after creation', async () => {
      const newSession = { ...mockSession, id: 'new-session' }
      mockCreateSession.mockResolvedValue(newSession)

      await db.createSession('New Session', 'New description')

      expect(mockCreateSession).toHaveBeenCalledWith('New Session', 'New description')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('lastUsedSessionId', 'new-session')
    })

    it('should handle session creation without description', async () => {
      const newSession = { ...mockSession, id: 'new-session', description: null }
      mockCreateSession.mockResolvedValue(newSession)

      await db.createSession('New Session')

      expect(mockCreateSession).toHaveBeenCalledWith('New Session', undefined)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('lastUsedSessionId', 'new-session')
    })
  })

  describe('loadLastUsedSession', () => {
    it('should load and switch to last used session if it exists', async () => {
      localStorageMock.setItem('lastUsedSessionId', 'session-1')
      mockGetSessions.mockResolvedValue(mockSessions)
      mockSwitchSession.mockResolvedValue(mockSession)

      await db.loadLastUsedSession()

      expect(localStorageMock.getItem).toHaveBeenCalledWith('lastUsedSessionId')
      expect(mockGetSessions).toHaveBeenCalled()
      expect(mockSwitchSession).toHaveBeenCalledWith('session-1')
    })

    it('should remove stored ID if session no longer exists', async () => {
      localStorageMock.setItem('lastUsedSessionId', 'non-existent-session')
      mockGetSessions.mockResolvedValue(mockSessions)

      await db.loadLastUsedSession()

      expect(localStorageMock.getItem).toHaveBeenCalledWith('lastUsedSessionId')
      expect(mockGetSessions).toHaveBeenCalled()
      expect(mockSwitchSession).not.toHaveBeenCalled()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('lastUsedSessionId')
    })

    it('should do nothing if no last used session is stored', async () => {
      // localStorage returns null for missing keys
      localStorageMock.getItem.mockReturnValue(null)

      await db.loadLastUsedSession()

      expect(localStorageMock.getItem).toHaveBeenCalledWith('lastUsedSessionId')
      expect(mockGetSessions).not.toHaveBeenCalled() // Should not call getSessions if no ID stored
      expect(mockSwitchSession).not.toHaveBeenCalled()
    })

    it('should handle errors when loading sessions', async () => {
      localStorageMock.setItem('lastUsedSessionId', 'session-1')
      mockGetSessions.mockRejectedValue(new Error('Failed to load sessions'))

      // Should not throw, just log error
      await expect(db.loadLastUsedSession()).resolves.toBeUndefined()

      expect(mockSwitchSession).not.toHaveBeenCalled()
    })

    it('should handle errors when switching to last used session', async () => {
      localStorageMock.setItem('lastUsedSessionId', 'session-1')
      mockGetSessions.mockResolvedValue(mockSessions)
      mockSwitchSession.mockRejectedValue(new Error('Failed to switch'))

      // Should not throw, just log error
      await expect(db.loadLastUsedSession()).resolves.toBeUndefined()

      // Should not remove the ID on switch failure
      expect(localStorageMock.removeItem).not.toHaveBeenCalled()
    })
  })

  describe('localStorage persistence across sessions', () => {
    it('should persist session ID across multiple operations', async () => {
      // First session switch
      mockSwitchSession.mockResolvedValue(mockSession)
      await db.switchSession('session-1')

      expect(localStorageMock.setItem).toHaveBeenCalledWith('lastUsedSessionId', 'session-1')

      // Setup localStorage to return the stored value
      localStorageMock.getItem.mockReturnValue('session-1')

      // Clear other mocks but not localStorage
      mockGetSessions.mockClear()
      mockSwitchSession.mockClear()

      // Load last used session
      mockGetSessions.mockResolvedValue(mockSessions)
      mockSwitchSession.mockResolvedValue(mockSession)

      await db.loadLastUsedSession()

      expect(localStorageMock.getItem).toHaveBeenCalledWith('lastUsedSessionId')
      expect(mockSwitchSession).toHaveBeenCalledWith('session-1')
    })

    it('should update localStorage when switching between sessions', async () => {
      // Switch to first session
      mockSwitchSession.mockResolvedValue(mockSession)
      await db.switchSession('session-1')
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('lastUsedSessionId', 'session-1')

      // Switch to second session
      const secondSession = { ...mockSession, id: 'session-2' }
      mockSwitchSession.mockResolvedValue(secondSession)
      await db.switchSession('session-2')
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('lastUsedSessionId', 'session-2')

      // Verify the stored value was saved
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('lastUsedSessionId', 'session-2')
    })
  })

  describe('edge cases', () => {
    it('should handle localStorage errors gracefully', async () => {
      // Make localStorage.setItem throw an error
      const originalSetItem = window.localStorage.setItem
      window.localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error('Storage error')
      })

      mockSwitchSession.mockResolvedValue(mockSession)

      // Should throw the storage error
      await expect(db.switchSession('session-1')).rejects.toThrow('Storage error')

      // But the session switch should still have been attempted
      expect(mockSwitchSession).toHaveBeenCalledWith('session-1')

      // Restore original
      window.localStorage.setItem = originalSetItem
    })

    it('should handle localStorage quota exceeded', async () => {
      // Save original implementation
      const originalSetItem = localStorageMock.setItem

      // Make setItem throw an error
      localStorageMock.setItem = vi.fn().mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      mockSwitchSession.mockResolvedValue(mockSession)

      // Should throw because localStorage fails
      await expect(db.switchSession('session-1')).rejects.toThrow('QuotaExceededError')

      // Session switch should still be called
      expect(mockSwitchSession).toHaveBeenCalledWith('session-1')

      // Restore original implementation
      localStorageMock.setItem = originalSetItem
    })

    it('should handle malformed session IDs in localStorage', async () => {
      // Set up localStorage to return invalid ID
      localStorageMock.getItem.mockReturnValue('!!!invalid-id!!!')
      mockGetSessions.mockResolvedValue(mockSessions)

      await db.loadLastUsedSession()

      // Should try to find the session but fail gracefully
      expect(mockGetSessions).toHaveBeenCalled()
      expect(mockSwitchSession).not.toHaveBeenCalled()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('lastUsedSessionId')
    })
  })
})
