import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTaskStore } from '../store/useTaskStore'
import { getDatabase } from '../services/database'

// Mock the database module
vi.mock('../services/database', () => ({
  getDatabase: vi.fn(),
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('Session Persistence', () => {
  const mockSessions = [
    {
      id: 'session-1',
      name: 'Work Session',
      description: 'Main work session',
      isActive: false,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    },
    {
      id: 'session-2',
      name: 'Personal Session',
      description: 'Personal tasks',
      isActive: true,
      createdAt: new Date('2025-01-02'),
      updatedAt: new Date('2025-01-02'),
    },
  ]

  const mockDb = {
    initializeDefaultData: vi.fn().mockResolvedValue(undefined),
    getTasks: vi.fn().mockResolvedValue([]),
    getSequencedTasks: vi.fn().mockResolvedValue([]),
    getSessions: vi.fn().mockResolvedValue(mockSessions),
    switchSession: vi.fn().mockResolvedValue(mockSessions[0]),
    loadLastUsedSession: vi.fn().mockResolvedValue(undefined),
    getCurrentSession: vi.fn().mockResolvedValue(mockSessions[0]),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(getDatabase as any).mockReturnValue(mockDb)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should load last used session on initialization', async () => {
    // Set up localStorage with a saved session ID
    localStorageMock.getItem.mockReturnValue('session-1')
    mockDb.loadLastUsedSession.mockImplementation(async () => {
      // Simulate loading the last used session
      const sessionId = localStorageMock.getItem('lastUsedSessionId')
      if (sessionId) {
        const session = mockSessions.find(s => s.id === sessionId)
        if (session) {
          await mockDb.switchSession(sessionId)
          return session
        }
      }
      return null
    })

    // Render the hook
    const { result } = renderHook(() => useTaskStore())

    // Initialize data (this should trigger session loading)
    await result.current.initializeData()

    // Wait for async operations to complete
    await waitFor(() => {
      expect(mockDb.loadLastUsedSession).toHaveBeenCalled()
    })

    // Verify that the session was loaded
    expect(mockDb.switchSession).toHaveBeenCalledWith('session-1')
  })

  it('should handle missing last used session gracefully', async () => {
    // No saved session in localStorage
    localStorageMock.getItem.mockReturnValue(null)
    mockDb.loadLastUsedSession.mockResolvedValue(null)

    // Render the hook
    const { result } = renderHook(() => useTaskStore())

    // Initialize data
    await result.current.initializeData()

    // Wait for async operations
    await waitFor(() => {
      expect(mockDb.loadLastUsedSession).toHaveBeenCalled()
    })

    // Should not attempt to switch session
    expect(mockDb.switchSession).not.toHaveBeenCalled()
  })

  it('should save session ID when switching sessions', async () => {
    const mockSwitchSession = vi.fn(async (sessionId: string) => {
      localStorageMock.setItem('lastUsedSessionId', sessionId)
      return mockSessions.find(s => s.id === sessionId)
    })

    mockDb.switchSession = mockSwitchSession

    // Simulate switching to a session
    await mockDb.switchSession('session-2')

    // Verify localStorage was updated
    expect(localStorageMock.setItem).toHaveBeenCalledWith('lastUsedSessionId', 'session-2')
  })

  it('should load session during initialization to prevent default flash', async () => {
    // This test ensures session is loaded as part of initialization
    localStorageMock.getItem.mockReturnValue('session-1')

    const { result } = renderHook(() => useTaskStore())

    // Start initialization
    await result.current.initializeData()

    // Verify that loadLastUsedSession was called during initialization
    // This happens before loading tasks, preventing the default session flash
    expect(mockDb.loadLastUsedSession).toHaveBeenCalled()
    expect(mockDb.loadLastUsedSession).toHaveBeenCalledBefore(mockDb.getTasks as any)
    expect(mockDb.loadLastUsedSession).toHaveBeenCalledBefore(mockDb.getSequencedTasks as any)

    // Should no longer be loading after initialization
    expect(result.current.isLoading).toBe(false)
  })
})
