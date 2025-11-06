import { create } from 'zustand'
import { Task, NextScheduledItem } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskStatus, StepStatus } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { WorkSettings, DEFAULT_WORK_SETTINGS } from '@shared/work-settings-types'
import { UnifiedWorkSession } from '@shared/unified-work-session-types'
import { UnifiedScheduler, OptimizationMode } from '@shared/unified-scheduler'
import { getDatabase } from '../services/database'
import { appEvents, EVENTS } from '../utils/events'
import { logger } from '@/logger'
import { WorkTrackingService } from '../services/workTrackingService'
import dayjs from 'dayjs'
import { getCurrentTime } from '../../shared/time-provider'


interface TaskStore {
  tasks: Task[]
  sequencedTasks: SequencedTask[]
  selectedTaskId: string | null
  isLoading: boolean
  error: string | null
  workSettings: WorkSettings
  workPatterns: DailyWorkPattern[]
  workPatternsLoading: boolean

  // Scheduling state
  optimalSchedule: any | null

  // Progress tracking state
  activeWorkSessions: Map<string, UnifiedWorkSession>
  workSessionHistory: UnifiedWorkSession[]

  // Next task widget state (session-scoped, resets on app restart)
  nextTaskSkipIndex: number
  incrementNextTaskSkipIndex: () => void
  resetNextTaskSkipIndex: () => void

  // Data loading actions
  loadTasks: (includeArchived?: boolean) => Promise<void>
  loadSequencedTasks: () => Promise<void>
  refreshAllData: () => Promise<void>
  loadWorkPatterns: () => Promise<void>
  initializeData: () => Promise<void>

  // Actions
  addTask: (__task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  addSequencedTask: (task: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  addOrUpdateSequencedTask: (task: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateTask: (__id: string, updates: Partial<Task>) => Promise<void>
  updateSequencedTask: (__id: string, updates: Partial<SequencedTask>) => Promise<void>
  deleteTask: (__id: string) => Promise<void>
  deleteSequencedTask: (id: string) => Promise<void>
  toggleTaskComplete: (__id: string) => Promise<void>
  selectTask: (id: string | null) => void

  // Scheduling actions
  setOptimalSchedule: (schedule: any) => void
  getOptimalSchedule: () => any

  // Settings actions
  updateWorkSettings: (__settings: WorkSettings) => Promise<void>

  // Progress tracking actions
  startWorkOnStep: (stepId: string, __workflowId: string) => Promise<void>
  startWorkOnTask: (taskId: string) => Promise<void>
  pauseWorkOnStep: (stepId: string) => Promise<void>
  pauseWorkOnTask: (taskId: string) => Promise<void>
  completeStep: (__stepId: string, actualMinutes?: number, __notes?: string) => Promise<void>
  checkAndCompleteExpiredWaitTimes: () => Promise<void>
  updateStepProgress: (stepId: string, __percentComplete: number) => Promise<void>
  logWorkSession: (stepId: string, __minutes: number, notes?: string) => Promise<void>
  loadWorkSessionHistory: (__stepId: string) => Promise<void>

  // Computed
  getTaskById: (id: string) => Task | undefined
  getSequencedTaskById: (__id: string) => SequencedTask | undefined
  getIncompleteTasks: () => Task[]
  getCompletedTasks: () => Task[]
  getActiveSequencedTasks: () => SequencedTask[]
  getCompletedSequencedTasks: () => SequencedTask[]
  getActiveWorkSession: (stepId: string) => UnifiedWorkSession | undefined
  isStepActivelyWorkedOn: (stepId: string) => boolean
  getWorkSessionProgress: (itemId: string) => {
    session: UnifiedWorkSession | null
    isActive: boolean
    isPaused: boolean
    elapsedMinutes: number
  }
  getNextScheduledItem: () => Promise<NextScheduledItem | null>
  startNextTask: () => Promise<void>
}


// Helper to generate IDs (will be replaced by database IDs later)



// Get logger instance for state change logging
// const rendererLogger = getRendererLogger()

// Lazy singleton for WorkTrackingService
// Created on first use to ensure proper initialization order
let workTrackingServiceSingleton: WorkTrackingService | null = null

// Allow injecting a custom service for testing
let injectedWorkTrackingService: WorkTrackingService | null = null

export const injectWorkTrackingServiceForTesting = (service: WorkTrackingService) => {
  injectedWorkTrackingService = service
}

export const clearInjectedWorkTrackingService = () => {
  injectedWorkTrackingService = null
}

export const useTaskStore = create<TaskStore>((set, get) => {
  // Helper to get the current WorkTrackingService (lazy singleton or test injection)
  const getWorkTrackingService = () => {
    if (injectedWorkTrackingService) {
      return injectedWorkTrackingService
    }

    // Lazy creation of singleton - only create when first needed
    if (!workTrackingServiceSingleton) {
      workTrackingServiceSingleton = new WorkTrackingService()
      // rendererLogger.info('[TaskStore] Created WorkTrackingService singleton (lazy)', {
        // instanceId: (workTrackingServiceSingleton as any).instanceId,
      // })
    }

    return workTrackingServiceSingleton
  }

  return {
    tasks: [],
    sequencedTasks: [],
    selectedTaskId: null,
    isLoading: true, // Start with true to prevent premature getNextScheduledItem calls
    error: null,
    workPatterns: [],
    workPatternsLoading: true,
    workSettings: (() => {
      try {
        const saved = window.localStorage.getItem('workSettings')
        return saved ? JSON.parse(saved) : DEFAULT_WORK_SETTINGS
      } catch {
        return DEFAULT_WORK_SETTINGS
      }
    })(),

    // Scheduling state
    optimalSchedule: null,

    // Progress tracking state
    activeWorkSessions: new Map(),
    workSessionHistory: [],

    // Next task widget state
    nextTaskSkipIndex: 0,

    incrementNextTaskSkipIndex: () => {
      const currentIndex = get().nextTaskSkipIndex
      // rendererLogger.info('[TaskStore] Incrementing next task skip index', {
        // currentIndex,
        // newIndex: currentIndex + 1,
      // })
      set({ nextTaskSkipIndex: currentIndex + 1 })
    },

    resetNextTaskSkipIndex: () => {
      const _currentIndex = get().nextTaskSkipIndex
      // rendererLogger.info('[TaskStore] Resetting next task skip index', {
        // previousIndex: _currentIndex,
      // })
      set({ nextTaskSkipIndex: 0 })
    },

  // Data loading actions
  loadTasks: async (includeArchived = false) => {
    try {
      // rendererLogger.info('[TaskStore] Loading tasks from database', { includeArchived })
      // Loading tasks from database
      set({ isLoading: true, error: null })
      const tasks = await getDatabase().getTasks(includeArchived)
      // Tasks loaded successfully
      // rendererLogger.info('[TaskStore] Tasks loaded successfully', {
        // taskCount: tasks.length,
        // incompleteCount: tasks.filter(t => !t.completed).length,
        // archivedCount: tasks.filter(t => t.archived).length,
      // })
      set({ tasks, isLoading: false })
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('Store: Error loading tasks:', error)
      // rendererLogger.error('[TaskStore] Failed to load tasks', error as Error)
      set({
        error: error instanceof Error ? error.message : 'Failed to load tasks',
        isLoading: false,
      })
    }
  },

  loadSequencedTasks: async () => {
    try {
      // rendererLogger.info('[TaskStore] Loading sequenced tasks from database')
      set({ isLoading: true, error: null })
      const sequencedTasks = await getDatabase().getSequencedTasks()
      // Sequenced tasks loaded successfully
      // rendererLogger.info('[TaskStore] Sequenced tasks loaded successfully', {
        // workflowCount: sequencedTasks.length,
        // totalSteps: sequencedTasks.reduce((sum, st) => sum + st.steps.length, 0),
      // })
      set({ sequencedTasks, isLoading: false })
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('Store: Error loading sequenced tasks:', error)
      // rendererLogger.error('[TaskStore] Failed to load sequenced tasks', error as Error)
      set({
        error: error instanceof Error ? error.message : 'Failed to load sequenced tasks',
        isLoading: false,
      })
    }
  },

  // Unified refresh function that reloads all data consistently
  refreshAllData: async () => {
    try {
      // Load all data in parallel for efficiency
      const [tasks, sequencedTasks] = await Promise.all([
        getDatabase().getTasks(false),
        getDatabase().getSequencedTasks(),
      ])

      // Update store atomically
      set({
        tasks,
        sequencedTasks,
        isLoading: false,
        error: null,
      })

      // Emit single unified event for components to listen to
      appEvents.emit(EVENTS.DATA_REFRESH_NEEDED)
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to refresh data',
        isLoading: false,
      })
    }
  },

  loadWorkPatterns: async () => {
    try {
      // rendererLogger.info('[WorkPatternLifeCycle] TaskStore.loadWorkPatterns - START')
      set({ workPatternsLoading: true })

      const db = getDatabase()
      const patterns: DailyWorkPattern[] = []

      // DEBUG: Log what getCurrentTime returns
      const currentTime = getCurrentTime()
      // rendererLogger.info('[DEBUG] loadWorkPatterns getCurrentTime:', {
        // time: currentTime.toISOString(),
        // localDate: currentTime.toLocaleDateString(),
        // localTime: currentTime.toLocaleTimeString(),
      // })

      const today = dayjs(currentTime).startOf('day')
      // rendererLogger.info('[DEBUG] loadWorkPatterns date range:', {
        // startDate: today.add(-1, 'day').format('YYYY-MM-DD'),
        // endDate: today.add(7, 'day').format('YYYY-MM-DD'),
        // todayDate: today.format('YYYY-MM-DD'),
      // })

      // Load patterns from yesterday to next 7 days (to handle late-night overrides)
      for (let i = -1; i < 8; i++) {
        const date = today.add(i, 'day')
        const dateStr = date.format('YYYY-MM-DD')

        const pattern = await db.getWorkPattern(dateStr)

        if (pattern && ((pattern.blocks && pattern.blocks.length > 0) || (pattern.meetings && pattern.meetings.length > 0))) {
          patterns.push({
            date: dateStr,
            blocks: pattern.blocks,
            meetings: pattern.meetings,
            accumulated: { focus: 0, admin: 0, personal: 0 },
          })
        } else {
          // No pattern found - no default blocks
          patterns.push({
            date: dateStr,
            blocks: [],
            meetings: [],
            accumulated: { focus: 0, admin: 0, personal: 0 },
          })
        }
      }

      // rendererLogger.info('[WorkPatternLifeCycle] TaskStore.loadWorkPatterns - COMPLETE', {
        // total: patterns.length,
        // withBlocks: patterns.filter(p => p.blocks && p.blocks.length > 0).length,
        // dates: patterns.map(p => p.date),
        // currentTime: getCurrentTime().toISOString(),
        // realTime: new Date().toISOString(),
      // })

      set({ workPatterns: patterns, workPatternsLoading: false })
    } catch (error) {
      // rendererLogger.error('[TaskStore] Failed to load work patterns', error as Error)
      set({
        workPatterns: [],
        workPatternsLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load work patterns',
      })
    }
  },

  initializeData: async () => {
    try {
      // rendererLogger.info('[TaskStore] Starting data initialization...')
      // Clear existing data first to prevent stale data from showing
      // Reset skip index on app restart
      set({
        tasks: [],
        sequencedTasks: [],
        workPatterns: [],
        workPatternsLoading: true,
        isLoading: true,
        error: null,
        nextTaskSkipIndex: 0,
      })

      // Initialize WorkTrackingService first to restore active sessions
      try {
        // rendererLogger.info('[TaskStore] Initializing WorkTrackingService...')
        await getWorkTrackingService().initialize()
        // rendererLogger.info('[TaskStore] WorkTrackingService initialized successfully')

        // Sync any restored active session to task store
        const restoredSession = getWorkTrackingService().getCurrentActiveSession()
        if (restoredSession) {
          // rendererLogger.info('[TaskStore] Syncing restored session to store', {
            // sessionId: restoredSession.id,
            // taskId: restoredSession.taskId,
            // stepId: restoredSession.stepId,
          // })

          const sessionKey = restoredSession.workflowId || restoredSession.taskId
          const newSessions = new Map()
          newSessions.set(sessionKey, restoredSession)
          set({ activeWorkSessions: newSessions })

          // rendererLogger.info('[TaskStore] Restored session synced to store')
        }
      } catch (error) {
        logger.system.error('Failed to initialize WorkTrackingService', {
          error: error instanceof Error ? error.message : String(error),
        }, 'work-tracking-init-error')
        // Don't fail the whole initialization if work tracking fails
      }

      // Load last used session first to prevent default session flash
      // rendererLogger.info('[TaskStore] Loading last used session...')
      await getDatabase().loadLastUsedSession()

      // Loading all data from database
      // rendererLogger.info('[TaskStore] Loading tasks, workflows, and work patterns from database...')
      const [tasks, sequencedTasks] = await Promise.all([
        getDatabase().getTasks(),
        getDatabase().getSequencedTasks(),
      ])

      // Load work patterns separately (it's async and sets its own state)
      await get().loadWorkPatterns()

      // rendererLogger.info('[TaskStore] Data loaded successfully', {
        // taskCount: tasks.length,
        // workflowCount: sequencedTasks.length,
        // totalSteps: sequencedTasks.reduce((sum, workflow) => sum + workflow.steps.length, 0),
        // firstTaskSessionId: tasks[0]?.sessionId,
      // })

      // Store initialized successfully
      set({ tasks, sequencedTasks, isLoading: false })

      // rendererLogger.info('[TaskStore] Store initialization completed successfully')
    } catch (error) {
      // rendererLogger.error('[TaskStore] Failed to initialize data:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize data',
        isLoading: false,
      })
    }
  },

  addTask: async (taskData) => {
    try {
      // rendererLogger.info('[TaskStore] Creating new task', {
        // taskName: taskData.name,
        // type: taskData.type,
        // duration: taskData.duration,
        // importance: taskData.importance,
        // urgency: taskData.urgency,
      // })
      const task = await getDatabase().createTask(taskData)
      set((state) => ({
        tasks: [...state.tasks, task],
        error: null,
      }))
      // rendererLogger.info('[TaskStore] Task created successfully', {
        // taskId: task.id,
        // taskName: task.name,
      // })
    } catch (error) {
      // rendererLogger.error('[TaskStore] Failed to create task', error as Error)
      set({
        error: error instanceof Error ? error.message : 'Failed to create task',
      })
      throw error // Re-throw so TaskForm can catch it
    }
  },

  addSequencedTask: async (taskData) => {
    try {
      const sequencedTask = await getDatabase().createSequencedTask(taskData)
      set((state) => ({
        sequencedTasks: [...state.sequencedTasks, sequencedTask],
        error: null,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create sequenced task',
      })
    }
  },
  addOrUpdateSequencedTask: async (taskData) => {
    try {
      // Check if a workflow with this name already exists
      const existingWorkflow = get().sequencedTasks.find(wf => wf.name === taskData.name)

      if (existingWorkflow) {
        // Update existing workflow
        const updatedTask = await getDatabase().updateSequencedTask(existingWorkflow.id, taskData)
        set((state) => ({
          sequencedTasks: state.sequencedTasks.map(task =>
            task.id === existingWorkflow.id ? updatedTask : task,
          ),
          error: null,
        }))
        // LOGGER_REMOVED: logger.ui.info('Updated existing workflow', { workflowName: taskData.name })
      } else {
        // Create new workflow
        const sequencedTask = await getDatabase().createSequencedTask(taskData)
        set((state) => ({
          sequencedTasks: [...state.sequencedTasks, sequencedTask],
          error: null,
        }))
        // LOGGER_REMOVED: logger.ui.info('Created new workflow', { workflowName: taskData.name })
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create or update sequenced task',
      })
    }
  },

  updateTask: async (id, updates) => {
    try {
      const updatedTask = await getDatabase().updateTask(id, updates)

      // If task is being marked as completed, clear its active work session
      if (updates.completed || updates.overallStatus === TaskStatus.Completed) {
        const state = get()
        const newSessions = new Map(state.activeWorkSessions)
        newSessions.delete(id)
        set({
          tasks: state.tasks.map(task =>
            task.id === id ? updatedTask : task,
          ),
          activeWorkSessions: newSessions,
          error: null,
        })
      } else {
        set((state) => ({
          tasks: state.tasks.map(task =>
            task.id === id ? updatedTask : task,
          ),
          error: null,
        }))
      }

      // Emit refresh event to ensure UI consistency
      appEvents.emit(EVENTS.DATA_REFRESH_NEEDED)
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update task',
      })
    }
  },

  updateSequencedTask: async (id, updates) => {
    try {
      const updatedTask = await getDatabase().updateSequencedTask(id, updates)
      set((state) => ({
        sequencedTasks: state.sequencedTasks.map(task =>
          task.id === id ? updatedTask : task,
        ),
        error: null,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update sequenced task',
      })
    }
  },

  deleteTask: async (id) => {
    try {
      const task = get().tasks.find(t => t.id === id)
      logger.ui.info('Deleting task', {
        taskId: id,
        taskName: task?.name,
      }, 'task-delete')
      await getDatabase().deleteTask(id)
      set((state) => ({
        tasks: state.tasks.filter(task => task.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        error: null,
      }))
      // rendererLogger.info('[TaskStore] Task deleted successfully', { taskId: id })
    } catch (error) {
      // rendererLogger.error('[TaskStore] Failed to delete task', error as Error, { taskId: id })
      set({
        error: error instanceof Error ? error.message : 'Failed to delete task',
      })
    }
  },

  deleteSequencedTask: async (id) => {
    try {
      await getDatabase().deleteSequencedTask(id)
      set((state) => ({
        sequencedTasks: state.sequencedTasks.filter(task => task.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        error: null,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete sequenced task',
      })
    }
  },

  toggleTaskComplete: async (id) => {
    try {
      const task = get().tasks.find(t => t.id === id)
      if (!task) return

      // LOGGER_REMOVED: logger.ui.info('[TaskStore] Toggling task completion', {
        // LOGGER_REMOVED: taskId: id,
        // LOGGER_REMOVED: taskName: task.name,
        // LOGGER_REMOVED: currentStatus: task.completed,
        // LOGGER_REMOVED: newStatus: !task.completed,
      // LOGGER_REMOVED: })

      // LOGGER_REMOVED: logger.ui.info('Toggling task completion', {
        // LOGGER_REMOVED: taskId: id,
        // LOGGER_REMOVED: taskName: task.name,
        // LOGGER_REMOVED: currentStatus: task.completed,
        // LOGGER_REMOVED: newStatus: !task.completed,
      // LOGGER_REMOVED: })

      const updates = {
        completed: !task.completed,
        completedAt: !task.completed ? new Date() : undefined,
      }

      await get().updateTask(id, updates)

      // If task is being marked as completed, clean up any active work session
      if (!task.completed) { // Will be completed after toggle
        const state = get()
        const activeSession = state.activeWorkSessions.get(id)
        if (activeSession) {
          try {
            // Stop session in WorkTrackingService
            await getWorkTrackingService().stopWorkSession(activeSession.id!)

            // Remove from store
            const newSessions = new Map(state.activeWorkSessions)
            newSessions.delete(id)
            set({ activeWorkSessions: newSessions })

          } catch (error) {
            logger.ui.warn('Failed to stop work session for completed task', {
              error: error instanceof Error ? error.message : String(error),
              taskId: id,
            }, 'work-session-stop-warn')
          }
        }
      }

      // LOGGER_REMOVED: logger.ui.info('Task completion toggled successfully', {
        // LOGGER_REMOVED: taskId: id,
        // LOGGER_REMOVED: isNowCompleted: !task.completed,
      // LOGGER_REMOVED: })

      // Reset skip index when task is completed (to show the actual next task)
      // Note: task.completed is the OLD value before toggle, so !task.completed means "now completed"
      if (!task.completed) {
        get().resetNextTaskSkipIndex()
      }
    } catch (error) {
      // LOGGER_REMOVED: logger.ui.error('[TaskStore] Failed to toggle task completion', error, { taskId: id })
      set({
        error: error instanceof Error ? error.message : 'Failed to toggle task completion',
      })
    }
  },

  selectTask: (id) => {
    const task = id ? get().tasks.find(t => t.id === id) : null
    logger.ui.debug('Task selection changed', {
      taskId: id,
      taskName: task?.name,
    }, 'task-select')
    set({ selectedTaskId: id })
  },

  // Scheduling actions

  setOptimalSchedule: (schedule: any) => {
    // rendererLogger.info('[TaskStore] Setting optimal schedule', {
      // scheduledItemCount: schedule?.length || 0,
    // })
    set({ optimalSchedule: schedule })
  },

  getOptimalSchedule: () => get().optimalSchedule,

  // Settings actions
  updateWorkSettings: async (settings: WorkSettings) => {
    set({ workSettings: settings })
    window.localStorage.setItem('workSettings', JSON.stringify(settings))
  },

  getTaskById: (id) => get().tasks.find(task => task.id === id),

  getSequencedTaskById: (id) => get().sequencedTasks.find(task => task.id === id),

  getIncompleteTasks: () => get().tasks.filter(task => !task.completed),

  getCompletedTasks: () => get().tasks.filter(task => task.completed),

  getActiveSequencedTasks: () => get().sequencedTasks.filter(task => !task.completed),

  getCompletedSequencedTasks: () => get().sequencedTasks.filter(task => task.completed),

  // Progress tracking actions
  startWorkOnStep: async (stepId: string, workflowId: string) => {
    const state = get()
    // Use workflowId as the key to match WorkTrackingService's getSessionKey logic
    const sessionKey = workflowId
    const activeSession = state.activeWorkSessions.get(sessionKey)

    // Starting work on workflow step

    // Check if any work is active globally via WorkTrackingService
    if (getWorkTrackingService().isAnyWorkActive()) {
      // LOGGER_REMOVED: logger.ui.warn('Cannot start work: another work session is already active')
      return
    }

    if (activeSession && !activeSession.isPaused) {
      // LOGGER_REMOVED: logger.ui.warn(`Work session for step ${stepId} is already active`)
      return
    }

    try {
      // Start work session in WorkTrackingService for persistence
      const workSession = await getWorkTrackingService().startWorkSession(undefined, stepId, workflowId)

      // Sync the session to store's activeWorkSessions so UI can see it
      const localSession: UnifiedWorkSession = {
        ...workSession,
        isPaused: false, // Explicitly set to false for new sessions
      }

      const newSessions = new Map(get().activeWorkSessions)
      // Use workflowId as key to match WorkTrackingService's getSessionKey
      newSessions.set(sessionKey, localSession)

      // rendererLogger.info('[TaskStore] Syncing workflow step session to store state', {
        // stepId,
        // workflowId,
        // sessionKey,
        // sessionId: workSession.id,
        // isPaused: localSession.isPaused,
        // sessionsBeforeUpdate: get().activeWorkSessions.size,
        // sessionsAfterUpdate: newSessions.size,
      // })

      set({ activeWorkSessions: newSessions })

      // Log after state update to verify
      // rendererLogger.info('[TaskStore] State updated, verifying activeWorkSessions', {
        // currentActiveSessionsSize: get().activeWorkSessions.size,
        // hasSession: get().activeWorkSessions.has(stepId),
        // sessionIsPaused: get().activeWorkSessions.get(stepId)?.isPaused,
      // })

      // Update step status in database
      await getDatabase().updateTaskStepProgress(stepId, {
        status: 'in_progress',
        startedAt: activeSession ? undefined : new Date(),
      })

      // rendererLogger.info('[TaskStore] Started work on step', {
        // stepId,
        // workflowId,
      // })

      // Emit event to trigger UI updates
      appEvents.emit(EVENTS.SESSION_CHANGED)
    } catch (error) {
      logger.ui.error('Failed to start work on step', {
        error: error instanceof Error ? error.message : String(error),
        stepId,
        workflowId,
      }, 'step-work-start-error')
      // Don't throw - handle gracefully
    }
  },

  startWorkOnTask: async (taskId: string) => {
    // Check if any work is active globally via WorkTrackingService
    if (getWorkTrackingService().isAnyWorkActive()) {
      // LOGGER_REMOVED: logger.ui.warn('Cannot start work: another work session is already active')
      return
    }

    // Starting work on task

    try {
      // Start work session in WorkTrackingService for persistence
      const workSession = await getWorkTrackingService().startWorkSession(taskId, undefined, undefined)

      // Work session created successfully

      // Sync the session to store's activeWorkSessions so UI can see it
      const localSession: UnifiedWorkSession = {
        ...workSession,
        isPaused: false, // Explicitly set to false for new sessions
      }

      // Create new Map with the session
      const newSessions = new Map(get().activeWorkSessions)
      newSessions.set(taskId, localSession)

      // rendererLogger.info('[TaskStore] Syncing session to store state', {
        // taskId,
        // sessionId: workSession.id,
        // isPaused: localSession.isPaused,
        // sessionsBeforeUpdate: get().activeWorkSessions.size,
        // sessionsAfterUpdate: newSessions.size,
      // })

      set({ activeWorkSessions: newSessions })

      // State updated with new work session
      // rendererLogger.debug('[TaskStore] State updated for task', {
        // taskId,
        // currentActiveSessionsSize: get().activeWorkSessions.size,
        // hasSession: get().activeWorkSessions.has(taskId),
        // sessionIsPaused: get().activeWorkSessions.get(taskId)?.isPaused,
        // allSessionKeys: Array.from(get().activeWorkSessions.keys()),
        // allSessions: Array.from(get().activeWorkSessions.values()).map(s => ({
          // id: s.id,
          // taskId: s.taskId,
          // isPaused: s.isPaused,
        // })),
      // })

      // Update task status in database
      await getDatabase().updateTask(taskId, {
        overallStatus: TaskStatus.InProgress,
      })

      // LOGGER_REMOVED: logger.ui.info('[TaskStore] Started work on task', {
      //   taskId,
      //   sessionId: workSession.id,
      //   activeSessionsInStore: get().activeWorkSessions.size,
      // })

      // Emit event to trigger UI updates
      appEvents.emit(EVENTS.SESSION_CHANGED)
    } catch (error) {
      logger.ui.error('Failed to start work on task', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      }, 'task-work-start-error')
      // Don't throw - handle gracefully
    }
  },

  pauseWorkOnStep: async (stepId: string) => {
    // rendererLogger.warn('[TaskStore] ⏸️ pauseWorkOnStep called', { stepId })

    const state = get()
    // Find session by checking all sessions for matching stepId
    let sessionKey: string | null = null
    let session: UnifiedWorkSession | undefined

    for (const [key, sess] of state.activeWorkSessions) {
      if (sess.stepId === stepId) {
        sessionKey = key
        session = sess
        break
      }
    }

    if (!session || !sessionKey || session.isPaused) {
      // LOGGER_REMOVED: logger.ui.warn(`No active work session for step ${stepId}`, {
      //   sessionFound: !!session,
      //   sessionKey,
      //   allKeys: Array.from(state.activeWorkSessions.keys()),
      // })
      return
    }

    try {
      // Get current active session from WorkTrackingService
      const service = getWorkTrackingService()
      // rendererLogger.warn('[TaskStore] 🔍 Looking for active session', {
        // stepId,
        // serviceInstanceId: (service as any).instanceId,
      // })

      const activeWorkSession = service.getCurrentActiveSession()
      // rendererLogger.warn('[TaskStore] 🎯 Active session result', {
        // foundActiveSession: !!activeWorkSession,
        // activeSessionId: activeWorkSession?.id,
        // activeSessionStepId: activeWorkSession?.stepId,
        // requestedStepId: stepId,
        // matchesStepId: activeWorkSession?.stepId === stepId,
      // })

      if (activeWorkSession && activeWorkSession.stepId === stepId) {
        // Pause via WorkTrackingService
        // rendererLogger.warn('[TaskStore] ⏸️ Attempting to pause session', {
          // sessionId: activeWorkSession.id,
          // serviceInstanceId: (service as any).instanceId,
        // })
        await service.pauseWorkSession(activeWorkSession.id)
      } else {
        // rendererLogger.error('[TaskStore] ❌ Cannot pause - no matching session found', {
          // requestedStepId: stepId,
          // foundSessionStepId: activeWorkSession?.stepId,
        // })
      }

      // WorkTrackingService.pauseWorkSession already closed the session in the database
      // No need to create a duplicate work session record here

      // Remove the session from activeWorkSessions since it's now paused (closed in database)
      const newSessions = new Map(state.activeWorkSessions)
      newSessions.delete(sessionKey!)

      set({ activeWorkSessions: newSessions })

      // LOGGER_REMOVED: logger.ui.info('[TaskStore] Removed paused session from activeWorkSessions', {
        // LOGGER_REMOVED: sessionKey,
        // LOGGER_REMOVED: remainingActiveSessions: newSessions.size,
      // LOGGER_REMOVED: })

      // Emit events to notify UI of state changes - no refresh needed
      appEvents.emit(EVENTS.SESSION_CHANGED)
      appEvents.emit(EVENTS.TIME_LOGGED)
    } catch (error) {
      logger.ui.error('Failed to pause work on step', {
        error: error instanceof Error ? error.message : String(error),
        stepId,
      }, 'step-work-pause-error')
    }
  },

  pauseWorkOnTask: async (taskId: string) => {
    // rendererLogger.info('[TaskStore] 🛑 pauseWorkOnTask called', { taskId })

    const state = get()
    const session = state.activeWorkSessions.get(taskId)

    if (!session) {
      // LOGGER_REMOVED: logger.ui.warn(`No active work session for task ${taskId}`, {
      //   allKeys: Array.from(state.activeWorkSessions.keys()),
      // })
      return
    }

    try {
      // Stop session through WorkTrackingService
      const service = getWorkTrackingService()
      const activeWorkSession = service.getCurrentActiveSession()

      // rendererLogger.info('[TaskStore] 🔍 Stopping session via WorkTrackingService', {
        // taskId,
        // sessionId: activeWorkSession?.id,
        // matchesTask: activeWorkSession?.taskId === taskId,
      // })

      if (activeWorkSession && activeWorkSession.taskId === taskId) {
        await service.stopWorkSession(activeWorkSession.id)
        // LOGGER_REMOVED: logger.ui.info('[TaskStore] ✅ Session stopped in WorkTrackingService', {
          // LOGGER_REMOVED: sessionId: activeWorkSession.id,
        // LOGGER_REMOVED: })
      } else {
        // LOGGER_REMOVED: logger.ui.warn('[TaskStore] ⚠️ No matching session in WorkTrackingService', {
          // LOGGER_REMOVED: requestedTaskId: taskId,
          // LOGGER_REMOVED: foundSessionTaskId: activeWorkSession?.taskId,
        // LOGGER_REMOVED: })
      }

      // Remove from store
      const newSessions = new Map(state.activeWorkSessions)
      newSessions.delete(taskId)
      set({ activeWorkSessions: newSessions })

      // Emit events to notify UI of state changes - no refresh needed
      appEvents.emit(EVENTS.SESSION_CHANGED)
      appEvents.emit(EVENTS.TIME_LOGGED)

      // LOGGER_REMOVED: logger.ui.info('[TaskStore] ✅ Stopped work on task', {
        // LOGGER_REMOVED: taskId,
        // LOGGER_REMOVED: remainingSessions: newSessions.size,
      // LOGGER_REMOVED: })
    } catch (error) {
      logger.ui.error('Failed to stop work on task', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      }, 'task-work-stop-error')
      throw error
    }
  },

  completeStep: async (stepId: string, actualMinutes?: number, notes?: string) => {
    logger.system.info('[useTaskStore] completeStep called', { stepId, actualMinutes, notes })

    const state = get()
    const session = state.activeWorkSessions.get(stepId)

    logger.system.info('[useTaskStore] Active session check', {
      hasSession: !!session,
      sessionDetails: session ? {
        stepId: session.stepId,
        isPaused: session.isPaused,
        actualMinutes: session.actualMinutes,
      } : null,
    })

    let totalMinutes = actualMinutes || 0

    if (session && !actualMinutes) {
      // Calculate final duration if session is active
      const elapsed = session.isPaused ? 0 : Date.now() - session.startTime.getTime()
      totalMinutes = (session.actualMinutes || 0) + Math.floor(elapsed / 60000)
      logger.system.info('[useTaskStore] Calculated total minutes', { elapsed, totalMinutes })
    }

    try {
      // Stop work session in WorkTrackingService if there's an active one
      const activeWorkSession = getWorkTrackingService().getCurrentActiveSession()
      logger.system.info('[useTaskStore] WorkTrackingService session check', {
        hasActiveSession: !!activeWorkSession,
        matchesStepId: activeWorkSession?.stepId === stepId,
      })

      if (activeWorkSession && activeWorkSession.stepId === stepId) {
        logger.system.info('[useTaskStore] Stopping work session in WorkTrackingService')
        await getWorkTrackingService().stopWorkSession(activeWorkSession.id)
      }

      // Create work session record
      if (totalMinutes > 0) {
        logger.system.info('[useTaskStore] Creating step work session record', { totalMinutes })
        await getDatabase().createStepWorkSession({
          taskStepId: stepId,
          // If there's a session, use its start time, otherwise calculate backward from now
          startTime: session?.startTime || new Date(Date.now() - totalMinutes * 60000),
          duration: totalMinutes,
          notes,
        })

        // Emit event to update other components
        appEvents.emit(EVENTS.TIME_LOGGED)
      }

      // Find the step to check if it has async wait time
      const step = state.sequencedTasks
        .flatMap(t => t.steps)
        .find(s => s.id === stepId)

      logger.system.info('[useTaskStore] Found step', {
        stepFound: !!step,
        stepName: step?.name,
        asyncWaitTime: step?.asyncWaitTime,
      })

      // If step has asyncWaitTime, transition to 'waiting' instead of 'completed'
      const hasAsyncWait = step && step.asyncWaitTime && step.asyncWaitTime > 0
      const finalStatus = hasAsyncWait ? 'waiting' : 'completed'

      // Update step progress AND notes
      const updateData = {
        status: finalStatus,
        completedAt: new Date(), // Mark when active work completed (wait time starts from here)
        actualDuration: totalMinutes,
        percentComplete: 100,
        // If the step was never started, set startedAt to when it was completed minus duration
        startedAt: session?.startTime || new Date(Date.now() - totalMinutes * 60000),
        // Save notes to the step itself, not just the work session
        ...(notes && { notes }),
      }

      logger.system.info('[useTaskStore] Updating task step progress in database', {
        stepId,
        finalStatus,
        updateData,
      })

      await getDatabase().updateTaskStepProgress(stepId, updateData)
      logger.system.info('[useTaskStore] Database update successful')

      // Remove from active sessions
      // For workflow steps, the session key is the workflowId, not the stepId
      const workflow = state.sequencedTasks.find(t =>
        t.steps.some(s => s.id === stepId),
      )
      const sessionKey = workflow?.id || stepId  // Use workflowId if found, fallback to stepId

      const newSessions = new Map(state.activeWorkSessions)
      newSessions.delete(sessionKey)
      set({ activeWorkSessions: newSessions })
      logger.system.info('[useTaskStore] Removed from active sessions', { sessionKey, workflowId: workflow?.id })

      // Emit event immediately after clearing session to update UI
      appEvents.emit(EVENTS.SESSION_CHANGED)

      // Reload the sequenced task to get updated data
      const task = state.sequencedTasks.find(t =>
        t.steps.some(s => s.id === stepId),
      )

      logger.system.info('[useTaskStore] Found parent task', {
        taskFound: !!task,
        taskId: task?.id,
        taskName: task?.name,
      })

      if (task) {
        logger.system.info('[useTaskStore] Reloading sequenced task from database')
        const updatedTask = await getDatabase().getSequencedTaskById(task.id)

        logger.system.info('[useTaskStore] Database reload result', {
          updatedTaskFound: !!updatedTask,
          updatedTaskId: updatedTask?.id,
        })

        if (!updatedTask) {
          logger.system.error('[useTaskStore] Failed to reload task - database returned null!', { taskId: task.id })
          throw new Error(`Failed to reload task ${task.id} after completing step`)
        }

        set(state => ({
          sequencedTasks: state.sequencedTasks.map(t =>
            t.id === task.id ? updatedTask : t,
          ),
        }))
        logger.system.info('[useTaskStore] Updated sequenced tasks in state')
      }

      // Reset skip index when a step is completed (to show the actual next task)
      get().resetNextTaskSkipIndex()

      // Don't call refreshAllData here - we've already updated the state directly
      // and emitted SESSION_CHANGED event. Calling refreshAllData causes unnecessary
      // re-loading from database which can cause race conditions.

      // Check if any waiting steps have completed their wait time
      await get().checkAndCompleteExpiredWaitTimes()

      // Emit final event to notify UI that task data has changed
      appEvents.emit(EVENTS.TASK_UPDATED)

      logger.system.info('[useTaskStore] completeStep finished successfully')
    } catch (error) {
      logger.system.error('[useTaskStore] completeStep failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        stepId,
      })

      set({
        error: error instanceof Error ? error.message : 'Failed to complete step',
      })

      // Re-throw the error so the calling function knows it failed
      throw error
    }
  },

  /**
   * Check for steps in 'waiting' status whose wait time has expired
   * and transition them to 'completed'
   */
  checkAndCompleteExpiredWaitTimes: async () => {
    const state = get()
    const now = new Date()

    for (const workflow of state.sequencedTasks) {
      for (const step of workflow.steps) {
        // Check if step is waiting and has expired wait time
        if (
          step.status === 'waiting' &&
          step.completedAt &&
          step.asyncWaitTime &&
          step.asyncWaitTime > 0
        ) {
          const completedTime = new Date(step.completedAt).getTime()
          const waitEndTime = completedTime + step.asyncWaitTime * 60000

          // If wait time has expired, transition to completed
          if (now.getTime() >= waitEndTime) {
            try {
              await getDatabase().updateTaskStepProgress(step.id, {
                status: 'completed',
              })

              // Reload workflow to reflect changes
              const updatedTask = await getDatabase().getSequencedTaskById(workflow.id)
              if (updatedTask) {
                set(state => ({
                  sequencedTasks: state.sequencedTasks.map(t =>
                    t.id === workflow.id ? updatedTask : t,
                  ).filter((t): t is SequencedTask => t !== null),
                }))
              }
            } catch (error) {
              logger.db.error('Failed to complete expired wait time', {
                stepId: step.id,
                error: error instanceof Error ? error.message : String(error),
              }, 'wait-time-transition-error')
            }
          }
        }
      }
    }
  },

  updateStepProgress: async (stepId: string, percentComplete: number) => {
    try {
      await getDatabase().updateTaskStepProgress(stepId, {
        percentComplete: Math.min(100, Math.max(0, percentComplete)),
      })

      // Update local state
      set(state => ({
        sequencedTasks: state.sequencedTasks.map(task => ({
          ...task,
          steps: task.steps.map(step =>
            step.id === stepId
              ? { ...step, percentComplete: Math.min(100, Math.max(0, percentComplete)) }
              : step,
          ),
        })),
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update step progress',
      })
    }
  },

  logWorkSession: async (stepId: string, minutes: number, notes?: string) => {
    try {
      await getDatabase().createStepWorkSession({
        taskStepId: stepId,
        startTime: new Date(Date.now() - minutes * 60000), // Start time is minutes ago
        duration: minutes,
        notes,
      })

      // Update step's actual duration
      const step = get().sequencedTasks
        .flatMap(t => t.steps)
        .find(s => s.id === stepId)

      if (step) {
        const newActualDuration = (step.actualDuration || 0) + minutes

        // Append notes to existing step notes if provided
        let updatedNotes = step.notes
        if (notes) {
          updatedNotes = step.notes
            ? `${step.notes}\n\n${new Date().toLocaleString()}: ${notes}`
            : `${new Date().toLocaleString()}: ${notes}`
          // LOGGER_REMOVED: logger.ui.info(`Appending notes to step ${stepId}: "${notes}"`)
        }

        await getDatabase().updateTaskStepProgress(stepId, {
          actualDuration: newActualDuration,
          ...(notes && { notes: updatedNotes }),
        })

        // Emit event to update other components
        appEvents.emit(EVENTS.TIME_LOGGED)
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to log work session',
      })
    }
  },

  loadWorkSessionHistory: async (stepId: string) => {
    try {
      const sessions = await getDatabase().getStepWorkSessions(stepId)
      set({ workSessionHistory: sessions })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load work session history',
      })
    }
  },

  getActiveWorkSession: (stepId: string) => {
    // Check WorkTrackingService first for authoritative state
    const activeWorkSession = getWorkTrackingService().getCurrentActiveSession()
    if (activeWorkSession && activeWorkSession.stepId === stepId) {
      // Return the unified work session directly
      return {
        ...activeWorkSession,
        stepId,
        isPaused: activeWorkSession.isPaused || false,
      }
    }

    // Fall back to local session state - need to search all sessions for matching stepId
    const state = get()
    for (const session of state.activeWorkSessions.values()) {
      if (session.stepId === stepId) {
        return session
      }
    }

    return undefined
  },

  isStepActivelyWorkedOn: (stepId: string) => {
    // Check if there's an active, non-paused work session for this step
    const state = get()

    // First check WorkTrackingService for authoritative state
    const activeWorkSession = getWorkTrackingService().getCurrentActiveSession()
    if (activeWorkSession && activeWorkSession.stepId === stepId && !activeWorkSession.isPaused) {
      return true
    }

    // Fallback to local state
    for (const session of state.activeWorkSessions.values()) {
      if (session.stepId === stepId && !session.isPaused) {
        return true
      }
    }

    return false
  },

  getWorkSessionProgress: (itemId: string) => {
    // UNIFIED work session accessor - all components should use this
    // Returns consistent data regardless of whether itemId is a task or step

    const state = get()
    let session: UnifiedWorkSession | null = null

    // Get session from WorkTrackingService first (authoritative source)
    const activeWorkSession = getWorkTrackingService().getCurrentActiveSession()

    // Check if current active session matches our itemId (could be taskId or stepId)
    if (activeWorkSession) {
      if (activeWorkSession.taskId === itemId || activeWorkSession.stepId === itemId) {
        session = activeWorkSession
      }
    }

    // Fallback: check store's activeWorkSessions Map
    if (!session) {
      session = state.activeWorkSessions.get(itemId) || null

      // If not found by key, search by stepId (for workflow steps)
      if (!session) {
        for (const sess of state.activeWorkSessions.values()) {
          if (sess.stepId === itemId || sess.taskId === itemId) {
            session = sess
            break
          }
        }
      }
    }

    // Calculate elapsed time consistently
    let elapsedMinutes = 0
    if (session) {
      const elapsed = session.isPaused ? 0 : Date.now() - new Date(session.startTime).getTime()
      elapsedMinutes = (session.actualMinutes || 0) + Math.floor(elapsed / 60000)
    }

    return {
      session,
      isActive: !!session && !session.isPaused,
      isPaused: !!session?.isPaused,
      elapsedMinutes,
    }
  },

  getNextScheduledItem: async () => {
    try {
      const state = get()
      const skipIndex = state.nextTaskSkipIndex
      const tasks = state.tasks
      const sequencedTasks = state.sequencedTasks
      const workPatterns = state.workPatterns
      const workSettings = state.workSettings

      if (!workPatterns || workPatterns.length === 0) {
        return null
      }

      // Use UnifiedScheduler directly
      const scheduler = new UnifiedScheduler()

      const currentTime = getCurrentTime()
      const startDateString = currentTime.toISOString().split('T')[0]

      // Build context and config for UnifiedScheduler
      const context = {
        startDate: startDateString,
        tasks,
        workflows: sequencedTasks,
        workPatterns,
        workSettings,
        currentTime,
      }

      const config = {
        startDate: currentTime,
        allowTaskSplitting: true,
        respectMeetings: true,
        optimizationMode: OptimizationMode.Realistic,
        debugMode: true,
      }

      // Combine tasks and workflows into items array
      const items = [...tasks, ...sequencedTasks]

      // Call scheduler
      const scheduleResult = scheduler.scheduleForDisplay(items, context, config)

      // Find all active wait blocks and waiting steps
      const activeWaitBlocks = new Set<string>()
      const waitingStepIds = new Set<string>()

      // First, find all workflow steps that are in waiting status
      for (const workflow of sequencedTasks) {
        for (const step of workflow.steps) {
          if (step.status === StepStatus.Waiting && step.completedAt && step.asyncWaitTime) {
            // Check if wait time hasn't expired
            const waitEndTime = new Date(step.completedAt).getTime() + (step.asyncWaitTime * 60000)
            if (waitEndTime > currentTime.getTime()) {
              waitingStepIds.add(step.id)
              // Add both possible wait block IDs
              activeWaitBlocks.add(`${step.id}-wait`)
              activeWaitBlocks.add(`${step.id}-wait-future`)
            }
          }
        }
      }

      // Also check scheduled wait blocks
      scheduleResult.scheduled.forEach(item => {
        if (item.type === 'async-wait' && item.endTime) {
          // Check if wait block is still active (hasn't expired)
          if (item.endTime.getTime() > currentTime.getTime()) {
            activeWaitBlocks.add(item.id)
            // Extract the original step ID from wait block ID
            const stepId = item.id.replace(/-wait(-future)?$/, '')
            if (stepId !== item.id) {
              waitingStepIds.add(stepId)
            }
          }
        }
      })

      // Filter out meetings, async wait blocks, waiting items, and items blocked by active wait timers
      const sortedByTime = [...scheduleResult.scheduled]
        .filter(item => {
          // Must have a start time
          if (!item.startTime) return false

          // Filter out non-work items
          if (item.type === 'meeting' || item.type === 'break' ||
              item.type === 'blocked-time' || item.type === 'async-wait') {
            return false
          }

          // Filter out items that are waiting on async work
          if (item.isWaitingOnAsync) {
            return false
          }

          // Check if this item has dependencies on active wait blocks
          if (item.dependencies && item.dependencies.length > 0) {
            // If any dependency is an active wait block, filter this item out
            const hasActiveWaitDependency = item.dependencies.some(depId =>
              activeWaitBlocks.has(depId),
            )
            if (hasActiveWaitDependency) {
              return false
            }
          }

          // For workflow steps, check the actual step status and dependencies
          if (item.type === 'workflow-step' && item.workflowId) {
            const workflow = sequencedTasks.find(seq => seq.id === item.workflowId)
            const step = workflow?.steps.find(s => s.id === item.id)

            // Filter out steps that are in waiting status
            if (step?.status === StepStatus.Waiting) {
              return false
            }

            // Also filter out if any dependency is a waiting step
            if (step?.dependsOn && step.dependsOn.length > 0) {
              const hasWaitingDependency = step.dependsOn.some(depId =>
                waitingStepIds.has(depId),
              )
              if (hasWaitingDependency) {
                return false
              }
            }
          }

          return true
        })
        .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())

      if (sortedByTime.length === 0) {
        return null
      }

      const targetIndex = Math.min(skipIndex, sortedByTime.length - 1)
      const scheduledItem = sortedByTime[targetIndex]

      if (!scheduledItem || !scheduledItem.startTime) {
        return null
      }

      // Convert to NextScheduledItem format
      const isWorkflowStep = scheduledItem.type === 'workflow-step'

      if (isWorkflowStep) {
        const workflow = sequencedTasks.find(seq =>
          seq.steps.some(step => step.id === scheduledItem.id),
        )
        const step = workflow?.steps.find(s => s.id === scheduledItem.id)

        if (step && workflow) {
          return {
            type: 'step' as const,
            id: step.id,
            workflowId: workflow.id,
            title: step.name,
            estimatedDuration: step.duration,
            scheduledStartTime: scheduledItem.startTime,
          }
        }
      }

      // Regular task
      return {
        type: 'task' as const,
        id: scheduledItem.id,
        title: scheduledItem.name,
        estimatedDuration: scheduledItem.duration,
        scheduledStartTime: scheduledItem.startTime,
      }
    } catch (error) {
      logger.ui.error('Failed to get next scheduled item', {
        error: error instanceof Error ? error.message : String(error),
      }, 'next-item-error')
      return null
    }
  },

  startNextTask: async () => {
    try {
      // Check if any work is already active
      if (getWorkTrackingService().isAnyWorkActive()) {
        // rendererLogger.warn('[TaskStore] Cannot start next task: work session already active')
        return
      }

      // Get the next scheduled item
      const nextItem = await get().getNextScheduledItem()

      if (!nextItem) {
        // rendererLogger.info('[TaskStore] No next task available to start')
        return
      }

      // rendererLogger.info('[TaskStore] Starting next task', {
        // type: nextItem.type,
        // id: nextItem.id,
        // title: nextItem.title,
        // workflowId: nextItem.workflowId,
      // })

      // Start work based on item type
      if (nextItem.type === 'step' && nextItem.workflowId) {
        await get().startWorkOnStep(nextItem.id, nextItem.workflowId)
      } else if (nextItem.type === 'task') {
        // Start work on regular task
        await get().startWorkOnTask(nextItem.id)
      }

      // Reset skip index after starting a task (to show actual next task when they finish)
      get().resetNextTaskSkipIndex()

      // Emit event to notify UI that a new work session started
      // The startWorkOnStep/startWorkOnTask methods already updated the state
      appEvents.emit(EVENTS.SESSION_CHANGED)
    } catch (error) {
      // rendererLogger.error('[TaskStore] Failed to start next task', error as Error)
      set({
        error: error instanceof Error ? error.message : 'Failed to start next task',
      })
    }
  },
}
})
