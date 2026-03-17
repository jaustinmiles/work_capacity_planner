/**
 * Tests for usePomodoroStore
 *
 * Tests the Pomodoro timer engine: settings, cycle lifecycle, phase transitions,
 * mid-cycle task switching, pause/resume, and timer expiry prompts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PomodoroPhase, PomodoroPromptType } from '@shared/enums'
import { createInitialTimerState } from '@shared/pomodoro-types'

// ============================================================================
// Mocks
// ============================================================================

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

const mockNow = new Date('2024-03-15T10:00:00')
vi.mock('@shared/time-provider', () => ({
  getCurrentTime: vi.fn(() => mockNow),
}))

const mockWorkTrackingService = {
  isAnyWorkActive: vi.fn(() => false),
  getCurrentActiveSession: vi.fn(() => null),
  pauseWorkSession: vi.fn().mockResolvedValue(undefined),
  stopWorkSession: vi.fn().mockResolvedValue(undefined),
}

const mockTaskStoreState = {
  startWork: vi.fn().mockResolvedValue(undefined),
  startWorkOnTask: vi.fn().mockResolvedValue(undefined),
  startWorkOnStep: vi.fn().mockResolvedValue(undefined),
  activeWorkSessions: new Map(),
  tasks: [
    { id: 'task-1', name: 'Build feature', overallStatus: 'in_progress' },
    { id: 'task-2', name: 'Fix bug', overallStatus: 'not_started' },
  ],
}

vi.mock('../useTaskStore', () => ({
  useTaskStore: {
    getState: vi.fn(() => mockTaskStoreState),
    subscribe: vi.fn(() => vi.fn()),
  },
  getWorkTrackingServiceInstance: vi.fn(() => mockWorkTrackingService),
}))

vi.mock('../useTimeSinkStore', () => ({
  useTimeSinkStore: {
    getState: vi.fn(() => ({
      activeSinkSession: null,
      startSession: vi.fn().mockResolvedValue(undefined),
      stopSession: vi.fn().mockResolvedValue(undefined),
    })),
  },
}))

// Mock NotificationService
vi.mock('@/renderer/services/notificationService', () => ({
  NotificationService: {
    getInstance: vi.fn(() => ({
      send: vi.fn().mockResolvedValue(undefined),
      sendPomodoroPhaseComplete: vi.fn().mockResolvedValue(undefined),
    })),
  },
}))

// Mock database API
const mockCycleData = {
  id: 'cycle-1',
  sessionId: 'session-1',
  cycleNumber: 1,
  status: 'work',
  workDurationMinutes: 25,
  breakDurationMinutes: 5,
  phaseStartTime: mockNow,
  startTime: mockNow,
  endTime: null,
  breakTimeSinkId: null,
  createdAt: mockNow,
}

const mockSettingsData = {
  id: 'settings-1',
  sessionId: 'session-1',
  workDurationMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreak: true,
  autoStartWork: false,
  idleReminderMinutes: null,
  soundEnabled: true,
  createdAt: mockNow,
  updatedAt: mockNow,
}

const mockDbApi = {
  getPomodoroSettings: vi.fn().mockResolvedValue(null),
  updatePomodoroSettings: vi.fn().mockResolvedValue({ ...mockSettingsData }),
  startPomodoroCycle: vi.fn().mockResolvedValue({ ...mockCycleData }),
  getActivePomodoroCycle: vi.fn().mockResolvedValue(null),
  updatePomodoroCyclePhase: vi.fn().mockResolvedValue({ ...mockCycleData }),
  endPomodoroCycle: vi.fn().mockResolvedValue({ ...mockCycleData }),
  getPomodoroCyclesByDate: vi.fn().mockResolvedValue([]),
  getPomodoroCycleWithSessions: vi.fn().mockResolvedValue(null),
  updateWorkSession: vi.fn().mockResolvedValue({}),
}

vi.mock('@renderer/services/database', () => ({
  getDatabase: vi.fn(() => mockDbApi),
}))

// Import after mocks
import { usePomodoroStore } from '../usePomodoroStore'
import { getCurrentTime } from '@shared/time-provider'

// ============================================================================
// Helpers
// ============================================================================

function resetStore(): void {
  usePomodoroStore.getState().reset()
  usePomodoroStore.setState({
    settings: null,
    timerState: createInitialTimerState(),
    activeCycle: null,
    pendingPrompt: null,
    isLoading: false,
    isInitialized: false,
    _tickTimerId: null,
  })
}

// ============================================================================
// Tests
// ============================================================================

describe('usePomodoroStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetStore()
    mockWorkTrackingService.getCurrentActiveSession.mockReturnValue(null)
    mockTaskStoreState.activeWorkSessions = new Map()
  })

  afterEach(() => {
    // Stop any running tick timers
    usePomodoroStore.getState()._stopTick()
    vi.useRealTimers()
  })

  // ==========================================================================
  // Settings
  // ==========================================================================

  describe('loadSettings', () => {
    it('should load settings from database', async () => {
      mockDbApi.getPomodoroSettings.mockResolvedValueOnce({ ...mockSettingsData })

      await usePomodoroStore.getState().loadSettings()

      const { settings } = usePomodoroStore.getState()
      expect(settings).not.toBeNull()
      expect(settings?.workDurationMinutes).toBe(25)
      expect(settings?.shortBreakMinutes).toBe(5)
    })

    it('should set null settings when none exist in database', async () => {
      mockDbApi.getPomodoroSettings.mockResolvedValueOnce(null)

      await usePomodoroStore.getState().loadSettings()

      expect(usePomodoroStore.getState().settings).toBeNull()
    })

    it('should handle load errors gracefully', async () => {
      mockDbApi.getPomodoroSettings.mockRejectedValueOnce(new Error('DB error'))

      await usePomodoroStore.getState().loadSettings()

      // Should not throw — error is logged
      expect(usePomodoroStore.getState().settings).toBeNull()
    })
  })

  describe('updateSettings', () => {
    it('should update and persist settings', async () => {
      await usePomodoroStore.getState().updateSettings({
        workDurationMinutes: 30,
      })

      expect(mockDbApi.updatePomodoroSettings).toHaveBeenCalledWith({
        workDurationMinutes: 30,
      })

      const { settings } = usePomodoroStore.getState()
      expect(settings).not.toBeNull()
    })

    it('should throw on update failure', async () => {
      mockDbApi.updatePomodoroSettings.mockRejectedValueOnce(new Error('Update failed'))

      await expect(
        usePomodoroStore.getState().updateSettings({ workDurationMinutes: 30 }),
      ).rejects.toThrow('Update failed')
    })
  })

  // ==========================================================================
  // Cycle Lifecycle
  // ==========================================================================

  describe('startPomodoro', () => {
    it('should create a cycle and start timer without task', async () => {
      await usePomodoroStore.getState().startPomodoro()

      const state = usePomodoroStore.getState()
      expect(state.activeCycle).not.toBeNull()
      expect(state.activeCycle?.id).toBe('cycle-1')
      expect(state.timerState.isActive).toBe(true)
      expect(state.timerState.currentPhase).toBe(PomodoroPhase.Work)
      expect(state.timerState.currentTaskId).toBeNull()
      expect(state.timerState.currentTaskName).toBeNull()
      expect(state.timerState.remainingSeconds).toBe(25 * 60)
      expect(state.timerState.totalSeconds).toBe(25 * 60)
      expect(state.isLoading).toBe(false)

      expect(mockDbApi.startPomodoroCycle).toHaveBeenCalledOnce()
      // startPomodoro no longer starts work — user does that via existing buttons
      expect(mockTaskStoreState.startWork).not.toHaveBeenCalled()
    })

    it('should not start if cycle already active', async () => {
      await usePomodoroStore.getState().startPomodoro()
      vi.clearAllMocks()

      await usePomodoroStore.getState().startPomodoro()

      // Should not have called startPomodoroCycle again
      expect(mockDbApi.startPomodoroCycle).not.toHaveBeenCalled()
    })

    it('should handle start errors gracefully', async () => {
      mockDbApi.startPomodoroCycle.mockRejectedValueOnce(new Error('Start failed'))

      // startPomodoro catches errors internally (withStoreLogging + .catch)
      await usePomodoroStore.getState().startPomodoro()

      expect(usePomodoroStore.getState().isLoading).toBe(false)
      expect(usePomodoroStore.getState().activeCycle).toBeNull()
    })
  })

  describe('setActiveTask', () => {
    it('should update timer state with task info when cycle is active', async () => {
      await usePomodoroStore.getState().startPomodoro()

      usePomodoroStore.getState().setActiveTask('task-1', 'Build feature')

      const { timerState } = usePomodoroStore.getState()
      expect(timerState.currentTaskId).toBe('task-1')
      expect(timerState.currentTaskName).toBe('Build feature')
    })

    it('should be a no-op when no cycle is active', () => {
      usePomodoroStore.getState().setActiveTask('task-1', 'Build feature')

      const { timerState } = usePomodoroStore.getState()
      expect(timerState.currentTaskId).toBeNull()
    })
  })

  describe('transitionToBreak', () => {
    beforeEach(async () => {
      // Start a cycle first
      await usePomodoroStore.getState().startPomodoro()
      vi.clearAllMocks()
    })

    it('should transition from work to break phase', async () => {
      await usePomodoroStore.getState().transitionToBreak()

      const state = usePomodoroStore.getState()
      expect(state.timerState.currentPhase).toBe(PomodoroPhase.ShortBreak)
      expect(state.timerState.remainingSeconds).toBe(5 * 60)
      expect(state.timerState.currentTaskId).toBeNull()
      expect(state.pendingPrompt).toBeNull()

      expect(mockDbApi.updatePomodoroCyclePhase).toHaveBeenCalledWith(
        expect.objectContaining({
          cycleId: 'cycle-1',
          status: PomodoroPhase.ShortBreak,
        }),
      )
    })

    it('should start TimeSink session when sinkId provided', async () => {
      const { useTimeSinkStore } = await import('../useTimeSinkStore')
      const mockStartSession = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useTimeSinkStore.getState).mockReturnValue({
        activeSinkSession: null,
        startSession: mockStartSession,
        stopSession: vi.fn().mockResolvedValue(undefined),
      } as ReturnType<typeof useTimeSinkStore.getState>)

      await usePomodoroStore.getState().transitionToBreak('sink-coffee')

      expect(mockStartSession).toHaveBeenCalledWith('sink-coffee')
    })

    it('should stop active work session', async () => {
      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue({ id: 'ws-active' })

      await usePomodoroStore.getState().transitionToBreak()

      expect(mockWorkTrackingService.pauseWorkSession).toHaveBeenCalledWith('ws-active')
    })

    it('should not transition if no active cycle', async () => {
      usePomodoroStore.setState({ activeCycle: null })

      await usePomodoroStore.getState().transitionToBreak()

      expect(mockDbApi.updatePomodoroCyclePhase).not.toHaveBeenCalled()
    })
  })

  describe('transitionToWork', () => {
    beforeEach(async () => {
      // Start a cycle and transition to break
      await usePomodoroStore.getState().startPomodoro()
      vi.clearAllMocks()

      // Manually set break state (avoid full transition to simplify)
      usePomodoroStore.setState({
        activeCycle: {
          ...usePomodoroStore.getState().activeCycle!,
          status: PomodoroPhase.ShortBreak,
        },
        timerState: {
          ...usePomodoroStore.getState().timerState,
          currentPhase: PomodoroPhase.ShortBreak,
          currentTaskId: null,
        },
      })
    })

    it('should transition from break to work phase', async () => {
      await usePomodoroStore.getState().transitionToWork('task-2')

      const state = usePomodoroStore.getState()
      expect(state.timerState.currentPhase).toBe(PomodoroPhase.Work)
      expect(state.timerState.remainingSeconds).toBe(25 * 60)

      // transitionToWork now starts work via useTaskStore (dynamic import)
      // which goes through WorkTrackingService → auto-links to cycle
      expect(mockTaskStoreState.startWorkOnTask).toHaveBeenCalledWith('task-2')
    })

    it('should stop TimeSink session if active', async () => {
      const { useTimeSinkStore } = await import('../useTimeSinkStore')
      const mockStopSession = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useTimeSinkStore.getState).mockReturnValue({
        activeSinkSession: { id: 'ts-active' },
        startSession: vi.fn(),
        stopSession: mockStopSession,
      } as unknown as ReturnType<typeof useTimeSinkStore.getState>)

      await usePomodoroStore.getState().transitionToWork('task-1')

      expect(mockStopSession).toHaveBeenCalled()
    })
  })

  describe('switchTaskWithinCycle', () => {
    beforeEach(async () => {
      await usePomodoroStore.getState().startPomodoro()
      vi.clearAllMocks()
    })

    it('should update timer display without resetting timer', () => {
      const remainingBefore = usePomodoroStore.getState().timerState.remainingSeconds

      usePomodoroStore.getState().switchTaskWithinCycle('task-2', 'Fix bug')

      const state = usePomodoroStore.getState()
      expect(state.timerState.currentTaskId).toBe('task-2')
      expect(state.timerState.currentTaskName).toBe('Fix bug')
      // Timer should NOT have been reset
      expect(state.timerState.remainingSeconds).toBe(remainingBefore)
      expect(state.pendingPrompt).toBeNull()
    })

    it('should not update if not in work phase', () => {
      usePomodoroStore.setState({
        activeCycle: {
          ...usePomodoroStore.getState().activeCycle!,
          status: PomodoroPhase.ShortBreak,
        },
      })

      usePomodoroStore.getState().switchTaskWithinCycle('task-2', 'Fix bug')

      // Should not have updated task info
      expect(usePomodoroStore.getState().timerState.currentTaskId).not.toBe('task-2')
    })
  })

  // ==========================================================================
  // Pause / Resume
  // ==========================================================================

  describe('pauseCycle', () => {
    beforeEach(async () => {
      await usePomodoroStore.getState().startPomodoro()
      vi.clearAllMocks()
    })

    it('should pause the cycle and stop timer', async () => {
      await usePomodoroStore.getState().pauseCycle()

      const state = usePomodoroStore.getState()
      expect(state.timerState.isActive).toBe(false)
      expect(state.timerState.currentPhase).toBe(PomodoroPhase.Paused)
      expect(state.activeCycle?.status).toBe(PomodoroPhase.Paused)

      expect(mockDbApi.updatePomodoroCyclePhase).toHaveBeenCalledWith(
        expect.objectContaining({
          cycleId: 'cycle-1',
          status: PomodoroPhase.Paused,
        }),
      )
    })

    it('should capture remaining time', async () => {
      await usePomodoroStore.getState().pauseCycle()

      const { timerState } = usePomodoroStore.getState()
      // computeRemainingSeconds with same phaseStartTime and now should give full duration
      expect(timerState.remainingSeconds).toBe(25 * 60)
    })
  })

  describe('resumeCycle', () => {
    beforeEach(async () => {
      await usePomodoroStore.getState().startPomodoro()
      await usePomodoroStore.getState().pauseCycle()
      vi.clearAllMocks()
    })

    it('should resume the cycle and restart timer', async () => {
      await usePomodoroStore.getState().resumeCycle()

      const state = usePomodoroStore.getState()
      expect(state.timerState.isActive).toBe(true)
      expect(state.timerState.currentPhase).toBe(PomodoroPhase.Work)
      expect(state.activeCycle?.status).toBe(PomodoroPhase.Work)
    })

    it('should not resume if not paused', async () => {
      // Resume it first
      await usePomodoroStore.getState().resumeCycle()
      vi.clearAllMocks()

      // Try resuming again — should be a no-op since status is now Work
      await usePomodoroStore.getState().resumeCycle()

      expect(mockDbApi.updatePomodoroCyclePhase).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // End Cycle
  // ==========================================================================

  describe('endCycle', () => {
    beforeEach(async () => {
      await usePomodoroStore.getState().startPomodoro()
      vi.clearAllMocks()
    })

    it('should end the cycle and reset state', async () => {
      await usePomodoroStore.getState().endCycle()

      const state = usePomodoroStore.getState()
      expect(state.activeCycle).toBeNull()
      expect(state.timerState.isActive).toBe(false)
      expect(state.timerState.remainingSeconds).toBe(0)
      expect(state.pendingPrompt).toBeNull()

      expect(mockDbApi.endPomodoroCycle).toHaveBeenCalledWith('cycle-1')
    })

    it('should stop active work session', async () => {
      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue({ id: 'ws-active' })

      await usePomodoroStore.getState().endCycle()

      expect(mockWorkTrackingService.pauseWorkSession).toHaveBeenCalledWith('ws-active')
    })

    it('should stop active TimeSink session', async () => {
      const { useTimeSinkStore } = await import('../useTimeSinkStore')
      const mockStopSession = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useTimeSinkStore.getState).mockReturnValue({
        activeSinkSession: { id: 'ts-active' },
        startSession: vi.fn(),
        stopSession: mockStopSession,
      } as unknown as ReturnType<typeof useTimeSinkStore.getState>)

      await usePomodoroStore.getState().endCycle()

      expect(mockStopSession).toHaveBeenCalled()
    })

    it('should do nothing if no active cycle', async () => {
      usePomodoroStore.setState({ activeCycle: null })
      vi.clearAllMocks()

      await usePomodoroStore.getState().endCycle()

      expect(mockDbApi.endPomodoroCycle).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Timer Engine
  // ==========================================================================

  describe('timer engine', () => {
    it('should tick and update remaining seconds', async () => {
      await usePomodoroStore.getState().startPomodoro()

      // Advance time by 5 seconds — mock getCurrentTime to return later time
      const fiveSecondsLater = new Date(mockNow.getTime() + 5000)
      vi.mocked(getCurrentTime).mockReturnValue(fiveSecondsLater)

      // Advance the fake timer to trigger one tick (1000ms interval)
      vi.advanceTimersByTime(1000)

      const { timerState } = usePomodoroStore.getState()
      expect(timerState.remainingSeconds).toBe(25 * 60 - 5)

      // Reset mock
      vi.mocked(getCurrentTime).mockReturnValue(mockNow)
    })

    it('should trigger break prompt when work timer expires', async () => {
      await usePomodoroStore.getState().startPomodoro()

      // Jump to expiry
      const expired = new Date(mockNow.getTime() + 25 * 60 * 1000)
      vi.mocked(getCurrentTime).mockReturnValue(expired)

      // Tick to detect expiry
      vi.advanceTimersByTime(1000)

      const state = usePomodoroStore.getState()
      expect(state.pendingPrompt).toBe(PomodoroPromptType.BreakActivity)
      expect(state.timerState.isActive).toBe(false)
      expect(state.timerState.remainingSeconds).toBe(0)

      vi.mocked(getCurrentTime).mockReturnValue(mockNow)
    })

    it('should trigger next task prompt when break timer expires', async () => {
      // Start and manually set up break state
      await usePomodoroStore.getState().startPomodoro()

      const breakStart = new Date(mockNow.getTime() + 25 * 60 * 1000)
      vi.mocked(getCurrentTime).mockReturnValue(breakStart)

      // Manually transition to break (with the state already set up)
      usePomodoroStore.getState()._stopTick()
      usePomodoroStore.setState({
        activeCycle: {
          ...usePomodoroStore.getState().activeCycle!,
          status: PomodoroPhase.ShortBreak,
          phaseStartTime: breakStart,
        },
        timerState: {
          ...usePomodoroStore.getState().timerState,
          currentPhase: PomodoroPhase.ShortBreak,
          isActive: true,
          remainingSeconds: 5 * 60,
          totalSeconds: 5 * 60,
        },
      })
      usePomodoroStore.getState()._startTick()

      // Jump to break expiry
      const breakExpired = new Date(breakStart.getTime() + 5 * 60 * 1000)
      vi.mocked(getCurrentTime).mockReturnValue(breakExpired)

      vi.advanceTimersByTime(1000)

      const state = usePomodoroStore.getState()
      expect(state.pendingPrompt).toBe(PomodoroPromptType.NextTask)
      expect(state.timerState.isActive).toBe(false)

      vi.mocked(getCurrentTime).mockReturnValue(mockNow)
    })
  })

  // ==========================================================================
  // Prompt Actions
  // ==========================================================================

  describe('dismissPrompt', () => {
    it('should clear the pending prompt', () => {
      usePomodoroStore.setState({ pendingPrompt: PomodoroPromptType.BreakActivity })

      usePomodoroStore.getState().dismissPrompt()

      expect(usePomodoroStore.getState().pendingPrompt).toBeNull()
    })
  })

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('initialize', () => {
    it('should load settings and check for active cycle', async () => {
      await usePomodoroStore.getState().initialize()

      expect(mockDbApi.getPomodoroSettings).toHaveBeenCalledOnce()
      expect(mockDbApi.getActivePomodoroCycle).toHaveBeenCalledOnce()
      expect(usePomodoroStore.getState().isInitialized).toBe(true)
    })

    it('should restore active cycle if one exists', async () => {
      mockDbApi.getActivePomodoroCycle.mockResolvedValueOnce({ ...mockCycleData })

      await usePomodoroStore.getState().initialize()

      const state = usePomodoroStore.getState()
      expect(state.activeCycle).not.toBeNull()
      expect(state.activeCycle?.id).toBe('cycle-1')
      expect(state.timerState.isActive).toBe(true)
    })

    it('should not restore paused cycle as active timer', async () => {
      mockDbApi.getActivePomodoroCycle.mockResolvedValueOnce({
        ...mockCycleData,
        status: PomodoroPhase.Paused,
      })

      await usePomodoroStore.getState().initialize()

      const state = usePomodoroStore.getState()
      expect(state.activeCycle).not.toBeNull()
      expect(state.timerState.isActive).toBe(false)
    })

    it('should only initialize once', async () => {
      await usePomodoroStore.getState().initialize()
      vi.clearAllMocks()

      await usePomodoroStore.getState().initialize()

      expect(mockDbApi.getPomodoroSettings).not.toHaveBeenCalled()
    })

    it('should handle initialization errors', async () => {
      mockDbApi.getPomodoroSettings.mockRejectedValueOnce(new Error('Init error'))

      await usePomodoroStore.getState().initialize()

      // Should still mark as initialized to prevent infinite retry loops
      expect(usePomodoroStore.getState().isInitialized).toBe(true)
    })
  })

  // ==========================================================================
  // Reset
  // ==========================================================================

  describe('reset', () => {
    it('should clear all state', async () => {
      await usePomodoroStore.getState().startPomodoro()

      usePomodoroStore.getState().reset()

      const state = usePomodoroStore.getState()
      expect(state.settings).toBeNull()
      expect(state.activeCycle).toBeNull()
      expect(state.timerState.isActive).toBe(false)
      expect(state.pendingPrompt).toBeNull()
      expect(state.isInitialized).toBe(false)
    })
  })
})
