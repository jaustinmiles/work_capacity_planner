/**
 * Tests for useTimeSinkStore
 *
 * Tests CRUD operations, session management, and mutual exclusivity
 * between time sinks and work sessions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { TimeSink, TimeSinkSession } from '@/shared/time-sink-types'

// Mock dependencies before importing the store
vi.mock('@/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

vi.mock('@/shared/time-provider', () => ({
  getCurrentTime: vi.fn(() => new Date('2024-01-15T10:00:00')),
}))

// Mock the work tracking service singleton
const mockWorkTrackingService = {
  isAnyWorkActive: vi.fn(() => false),
  getCurrentActiveSession: vi.fn(() => null),
  stopWorkSession: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../useTaskStore', () => ({
  getWorkTrackingServiceInstance: vi.fn(() => mockWorkTrackingService),
}))

// Mock electronAPI
const mockTimeSinks: TimeSink[] = [
  {
    id: 'sink-1',
    sessionId: 'session-1',
    name: 'Phone calls',
    emoji: '📞',
    color: '#9B59B6',
    sortOrder: 0,
    createdAt: new Date('2024-01-15T09:00:00'),
    updatedAt: new Date('2024-01-15T09:00:00'),
  },
  {
    id: 'sink-2',
    sessionId: 'session-1',
    name: 'Coffee break',
    emoji: '☕',
    color: '#8B4513',
    sortOrder: 1,
    createdAt: new Date('2024-01-15T09:00:00'),
    updatedAt: new Date('2024-01-15T09:00:00'),
  },
]

const mockSession: TimeSinkSession = {
  id: 'session-123',
  timeSinkId: 'sink-1',
  startTime: new Date('2024-01-15T10:00:00'),
  createdAt: new Date('2024-01-15T10:00:00'),
}

const mockDbApi = {
  getTimeSinks: vi.fn().mockResolvedValue([...mockTimeSinks]),
  createTimeSink: vi.fn().mockImplementation((input) => Promise.resolve({
    id: 'sink-new',
    sessionId: 'session-1',
    ...input,
    sortOrder: input.sortOrder ?? 0,
    createdAt: new Date('2024-01-15T10:00:00'),
    updatedAt: new Date('2024-01-15T10:00:00'),
  })),
  updateTimeSink: vi.fn().mockImplementation((id, updates) => Promise.resolve({
    ...mockTimeSinks.find(s => s.id === id),
    ...updates,
    updatedAt: new Date('2024-01-15T10:00:00'),
  })),
  deleteTimeSink: vi.fn().mockResolvedValue(undefined),
  reorderTimeSinks: vi.fn().mockResolvedValue(undefined),
  createTimeSinkSession: vi.fn().mockResolvedValue({ ...mockSession }),
  endTimeSinkSession: vi.fn().mockImplementation((id, minutes, notes) => Promise.resolve({
    ...mockSession,
    id,
    endTime: new Date('2024-01-15T10:30:00'),
    actualMinutes: minutes,
    notes,
  })),
  getActiveTimeSinkSession: vi.fn().mockResolvedValue(null),
  getTimeSinkAccumulated: vi.fn().mockResolvedValue({ bySink: {}, total: 0 }),
}

Object.defineProperty(window, 'electronAPI', {
  value: { db: mockDbApi },
  writable: true,
})

// Import store after mocks are set up
import { useTimeSinkStore } from '../useTimeSinkStore'

describe('useTimeSinkStore', () => {
  beforeEach(() => {
    // Reset store state
    useTimeSinkStore.setState({
      sinks: [],
      activeSinkSession: null,
      isLoading: false,
      error: null,
      isInitialized: false,
    })

    // Reset all mocks
    vi.clearAllMocks()
    mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)
    mockWorkTrackingService.getCurrentActiveSession.mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('loadSinks', () => {
    it('should load time sinks from database', async () => {
      const { loadSinks } = useTimeSinkStore.getState()

      await loadSinks()

      const state = useTimeSinkStore.getState()
      expect(state.sinks).toHaveLength(2)
      expect(state.isLoading).toBe(false)
      expect(state.isInitialized).toBe(true)
      expect(mockDbApi.getTimeSinks).toHaveBeenCalledOnce()
    })

    it('should set error on failure', async () => {
      mockDbApi.getTimeSinks.mockRejectedValueOnce(new Error('DB error'))

      const { loadSinks } = useTimeSinkStore.getState()
      await loadSinks()

      const state = useTimeSinkStore.getState()
      expect(state.error).toBe('DB error')
      expect(state.isLoading).toBe(false)
      expect(state.isInitialized).toBe(true)
    })

    it('should also load active session', async () => {
      const { loadSinks } = useTimeSinkStore.getState()
      await loadSinks()

      expect(mockDbApi.getActiveTimeSinkSession).toHaveBeenCalledOnce()
    })
  })

  describe('createSink', () => {
    it('should create sink and add to state', async () => {
      const { createSink } = useTimeSinkStore.getState()

      const newSink = await createSink({
        name: 'New Sink',
        emoji: '🎉',
        color: '#FF0000',
      })

      expect(newSink.id).toBe('sink-new')
      expect(newSink.name).toBe('New Sink')

      const state = useTimeSinkStore.getState()
      expect(state.sinks).toContainEqual(newSink)
    })

    it('should throw on creation failure', async () => {
      mockDbApi.createTimeSink.mockRejectedValueOnce(new Error('Creation failed'))

      const { createSink } = useTimeSinkStore.getState()

      await expect(createSink({
        name: 'Failing Sink',
        emoji: '❌',
        color: '#FF0000',
      })).rejects.toThrow('Creation failed')
    })
  })

  describe('updateSink', () => {
    it('should update sink in state', async () => {
      // Seed initial state
      useTimeSinkStore.setState({ sinks: [...mockTimeSinks] })

      const { updateSink } = useTimeSinkStore.getState()
      const updated = await updateSink('sink-1', { name: 'Updated Name' })

      expect(updated.name).toBe('Updated Name')

      const state = useTimeSinkStore.getState()
      const sink = state.sinks.find(s => s.id === 'sink-1')
      expect(sink?.name).toBe('Updated Name')
    })
  })

  describe('deleteSink', () => {
    it('should remove sink from state', async () => {
      useTimeSinkStore.setState({ sinks: [...mockTimeSinks] })

      const { deleteSink } = useTimeSinkStore.getState()
      await deleteSink('sink-1')

      const state = useTimeSinkStore.getState()
      expect(state.sinks).toHaveLength(1)
      expect(state.sinks.find(s => s.id === 'sink-1')).toBeUndefined()
    })
  })

  describe('clearSinks', () => {
    it('should clear all state', () => {
      useTimeSinkStore.setState({
        sinks: [...mockTimeSinks],
        activeSinkSession: mockSession,
        isInitialized: true,
      })

      const { clearSinks } = useTimeSinkStore.getState()
      clearSinks()

      const state = useTimeSinkStore.getState()
      expect(state.sinks).toHaveLength(0)
      expect(state.activeSinkSession).toBeNull()
      expect(state.isInitialized).toBe(false)
    })
  })

  describe('startSession', () => {
    beforeEach(() => {
      useTimeSinkStore.setState({ sinks: [...mockTimeSinks] })
    })

    it('should create new session', async () => {
      const { startSession } = useTimeSinkStore.getState()

      const session = await startSession('sink-1', 'Test notes')

      expect(session.id).toBe('session-123')
      expect(session.timeSinkId).toBe('sink-1')

      const state = useTimeSinkStore.getState()
      expect(state.activeSinkSession).toEqual(session)
    })

    it('should stop existing time sink session first', async () => {
      // Set an existing active session
      useTimeSinkStore.setState({ activeSinkSession: mockSession })

      const { startSession } = useTimeSinkStore.getState()
      await startSession('sink-2')

      // Should have called endTimeSinkSession to stop the previous session
      expect(mockDbApi.endTimeSinkSession).toHaveBeenCalledWith(
        'session-123',
        expect.any(Number),
        undefined,
      )
    })

    it('should stop active work session for mutual exclusivity', async () => {
      // Simulate an active work session
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(true)
      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue({ id: 'work-123' })

      const { startSession } = useTimeSinkStore.getState()
      await startSession('sink-1')

      expect(mockWorkTrackingService.isAnyWorkActive).toHaveBeenCalled()
      expect(mockWorkTrackingService.stopWorkSession).toHaveBeenCalledWith('work-123')
    })

    it('should not stop work session if none active', async () => {
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)

      const { startSession } = useTimeSinkStore.getState()
      await startSession('sink-1')

      expect(mockWorkTrackingService.stopWorkSession).not.toHaveBeenCalled()
    })
  })

  describe('stopSession', () => {
    it('should stop active session and calculate duration', async () => {
      useTimeSinkStore.setState({ activeSinkSession: mockSession })

      const { stopSession } = useTimeSinkStore.getState()
      const stopped = await stopSession('Done')

      expect(stopped).toBeTruthy()
      expect(mockDbApi.endTimeSinkSession).toHaveBeenCalledWith(
        'session-123',
        expect.any(Number),
        'Done',
      )

      const state = useTimeSinkStore.getState()
      expect(state.activeSinkSession).toBeNull()
    })

    it('should return null if no active session', async () => {
      const { stopSession } = useTimeSinkStore.getState()
      const result = await stopSession()

      expect(result).toBeNull()
      expect(mockDbApi.endTimeSinkSession).not.toHaveBeenCalled()
    })
  })

  describe('helper functions', () => {
    beforeEach(() => {
      useTimeSinkStore.setState({ sinks: [...mockTimeSinks] })
    })

    it('getById should return correct sink', () => {
      const { getById } = useTimeSinkStore.getState()

      expect(getById('sink-1')?.name).toBe('Phone calls')
      expect(getById('nonexistent')).toBeUndefined()
    })

    it('getColor should return sink color or default', () => {
      const { getColor } = useTimeSinkStore.getState()

      expect(getColor('sink-1')).toBe('#9B59B6')
      expect(getColor('nonexistent')).toBe('#808080') // default gray
    })

    it('getEmoji should return sink emoji or default', () => {
      const { getEmoji } = useTimeSinkStore.getState()

      expect(getEmoji('sink-1')).toBe('📞')
      expect(getEmoji('nonexistent')).toBe('⏱️') // default timer
    })

    it('getName should return sink name or Unknown', () => {
      const { getName } = useTimeSinkStore.getState()

      expect(getName('sink-1')).toBe('Phone calls')
      expect(getName('nonexistent')).toBe('Unknown')
    })

    it('getSorted should return sinks sorted by sortOrder', () => {
      // Add a sink with higher sortOrder
      useTimeSinkStore.setState({
        sinks: [
          { ...mockTimeSinks[1] }, // sortOrder: 1
          { ...mockTimeSinks[0] }, // sortOrder: 0
        ],
      })

      const { getSorted } = useTimeSinkStore.getState()
      const sorted = getSorted()

      expect(sorted[0].sortOrder).toBe(0)
      expect(sorted[1].sortOrder).toBe(1)
    })

    it('hasSinks should return correct boolean', () => {
      const { hasSinks } = useTimeSinkStore.getState()
      expect(hasSinks()).toBe(true)

      useTimeSinkStore.setState({ sinks: [] })
      expect(useTimeSinkStore.getState().hasSinks()).toBe(false)
    })

    it('isSessionActive should return correct boolean', () => {
      const { isSessionActive } = useTimeSinkStore.getState()
      expect(isSessionActive()).toBe(false)

      useTimeSinkStore.setState({ activeSinkSession: mockSession })
      expect(useTimeSinkStore.getState().isSessionActive()).toBe(true)
    })

    it('getActiveSessionDuration should return 0 if no session', () => {
      const { getActiveSessionDuration } = useTimeSinkStore.getState()
      expect(getActiveSessionDuration()).toBe(0)
    })
  })

  describe('getAccumulatedTime', () => {
    it('should fetch accumulated time from database', async () => {
      mockDbApi.getTimeSinkAccumulated.mockResolvedValueOnce({
        bySink: { 'sink-1': 60, 'sink-2': 30 },
        total: 90,
      })

      const { getAccumulatedTime } = useTimeSinkStore.getState()
      const result = await getAccumulatedTime('2024-01-15', '2024-01-15')

      expect(result.total).toBe(90)
      expect(result.bySink['sink-1']).toBe(60)
    })

    it('should return empty result on error', async () => {
      mockDbApi.getTimeSinkAccumulated.mockRejectedValueOnce(new Error('Query failed'))

      const { getAccumulatedTime } = useTimeSinkStore.getState()
      const result = await getAccumulatedTime('2024-01-15', '2024-01-15')

      expect(result).toEqual({ bySink: {}, total: 0 })
    })
  })
})
