import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { Task } from '@shared/types'
import { useSchedulerStore } from './useSchedulerStore'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskStatus, StepStatus } from '@shared/enums'
import { WorkSettings, DEFAULT_WORK_SETTINGS } from '@shared/work-settings-types'
import { UnifiedWorkSession } from '@shared/unified-work-session-types'
// Scheduler now handled by useSchedulerStore
import { getDatabase } from '../services/database'
// Events removed - using reactive state instead
import { logger } from '@/logger'
import { WorkTrackingService } from '../services/workTrackingService'


interface TaskStore {
  tasks: Task[]
  sequencedTasks: SequencedTask[]
  selectedTaskId: string | null
  isLoading: boolean
  error: string | null
  workSettings: WorkSettings
  includeArchived: boolean  // Track whether archived tasks should be shown

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
  // Scheduling moved to useSchedulerStore

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

export const useTaskStore = create<TaskStore>()(
  subscribeWithSelector((set, get) => {
    // Helper to get the current WorkTrackingService (lazy singleton or test injection)
    const getWorkTrackingService = () => {
    if (injectedWorkTrackingService) {
      return injectedWorkTrackingService
    }

    // Lazy creation of singleton - only create when first needed
    if (!workTrackingServiceSingleton) {
      workTrackingServiceSingleton = new WorkTrackingService()
    }

    return workTrackingServiceSingleton
  }

  return {
    tasks: [],
    sequencedTasks: [],
    selectedTaskId: null,
    isLoading: true, // Start with true to prevent premature getNextScheduledItem calls
    error: null,
    // Work patterns now in useWorkPatternStore
    includeArchived: false,  // Default to not showing archived tasks
    workSettings: (() => {
      try {
        const saved = window.localStorage.getItem('workSettings')
        return saved ? JSON.parse(saved) : DEFAULT_WORK_SETTINGS
      } catch {
        return DEFAULT_WORK_SETTINGS
      }
    })(),

    // Progress tracking state
    activeWorkSessions: new Map(),
    workSessionHistory: [],

    // Next task widget state
    nextTaskSkipIndex: 0,

    incrementNextTaskSkipIndex: () => {
      const currentIndex = get().nextTaskSkipIndex
      set({ nextTaskSkipIndex: currentIndex + 1 })
    },

    resetNextTaskSkipIndex: () => {
      set({ nextTaskSkipIndex: 0 })
    },

  // Data loading actions
  loadTasks: async (includeArchived = false) => {
    try {
      set({ isLoading: true, error: null, includeArchived })  // Store the preference
      const tasks = await getDatabase().getTasks(includeArchived)
      set({ tasks, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load tasks',
        isLoading: false,
      })
    }
  },

  loadSequencedTasks: async () => {
    try {
      set({ isLoading: true, error: null })
      const sequencedTasks = await getDatabase().getSequencedTasks()
      set({ sequencedTasks, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load sequenced tasks',
        isLoading: false,
      })
    }
  },

  // Unified refresh function that reloads all data consistently
  refreshAllData: async () => {
    try {
      // Use the stored includeArchived preference
      const { includeArchived } = get()

      // Load all data in parallel for efficiency
      const [tasks, sequencedTasks] = await Promise.all([
        getDatabase().getTasks(includeArchived),
        getDatabase().getSequencedTasks(),
      ])

      // Update store atomically
      set({
        tasks,
        sequencedTasks,
        isLoading: false,
        error: null,
      })

      // Reactive state will auto-update components
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to refresh data',
        isLoading: false,
      })
    }
  },

  // Work patterns now handled by useWorkPatternStore

  initializeData: async () => {
    try {
      // Clear existing data first to prevent stale data from showing
      // Reset skip index on app restart
      set({
        tasks: [],
        sequencedTasks: [],
        isLoading: true,
        error: null,
        nextTaskSkipIndex: 0,
      })

      // Initialize WorkTrackingService first to restore active sessions
      try {
        await getWorkTrackingService().initialize()

        // Sync any restored active session to task store
        const restoredSession = getWorkTrackingService().getCurrentActiveSession()
        if (restoredSession) {
          const sessionKey = restoredSession.workflowId || restoredSession.taskId
          const newSessions = new Map()
          newSessions.set(sessionKey, restoredSession)
          set({ activeWorkSessions: newSessions })
        }
      } catch (error) {
        logger.system.error('Failed to initialize WorkTrackingService', {
          error: error instanceof Error ? error.message : String(error),
        }, 'work-tracking-init-error')
        // Don't fail the whole initialization if work tracking fails
      }

      // Load last used session first to prevent default session flash
      await getDatabase().loadLastUsedSession()

      // Loading all data from database
      logger.ui.info('[TaskStore] Loading tasks, workflows, and work patterns from database...')
      const [tasks, sequencedTasks] = await Promise.all([
        getDatabase().getTasks(),
        getDatabase().getSequencedTasks(),
      ])

      // Load work patterns separately (it's async and sets its own state)
      // Work patterns loaded by useWorkPatternStore

      logger.ui.info('[TaskStore] Data loaded successfully', {
        taskCount: tasks.length,
        workflowCount: sequencedTasks.length,
        totalSteps: sequencedTasks.reduce((sum, workflow) => sum + workflow.steps.length, 0),
        taskNames: tasks.map(t => t.name),
        workflowNames: sequencedTasks.map(w => w.name),
      })

      // Store initialized successfully
      logger.ui.info('[TaskStore] Setting tasks in store', {
        taskCount: tasks.length,
        sequencedCount: sequencedTasks.length,
      })
      set({ tasks, sequencedTasks, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize data',
        isLoading: false,
      })
    }
  },

  addTask: async (taskData) => {
    try {
      const task = await getDatabase().createTask(taskData)
      set((state) => ({
        tasks: [...state.tasks, task],
        error: null,
      }))
    } catch (error) {
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
      } else {
        // Create new workflow
        const sequencedTask = await getDatabase().createSequencedTask(taskData)
        set((state) => ({
          sequencedTasks: [...state.sequencedTasks, sequencedTask],
          error: null,
        }))
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
      // Event removed - reactive state handles updates
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
    } catch (error) {
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



      const updates: Partial<Task> = {
        completed: !task.completed,
        ...(!task.completed ? { completedAt: new Date() } : {}),
      }

      // If task is being marked as completed, clean up any active work session BEFORE updating
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

      // Update the task
      await get().updateTask(id, updates)


      // Reset skip index when task is completed (to show the actual next task)
      // Note: task.completed is the OLD value before toggle, so !task.completed means "now completed"
      if (!task.completed) {
        get().resetNextTaskSkipIndex()
      }

      // Force schedule recomputation after task completion to ensure UI updates
      // This ensures the completed task is removed from the schedule immediately
      useSchedulerStore.getState().recomputeSchedule()

    } catch (error) {
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

  // Scheduling moved to useSchedulerStore

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
      return
    }

    if (activeSession && !activeSession.isPaused) {
      return
    }

    // Store original state for rollback
    const originalSessions = new Map(state.activeWorkSessions)
    let workSession: UnifiedWorkSession | null = null

    try {
      // Start work session in WorkTrackingService for persistence
      workSession = await getWorkTrackingService().startWorkSession(undefined, stepId, workflowId)

      // Sync the session to store's activeWorkSessions so UI can see it
      const localSession: UnifiedWorkSession = {
        ...workSession,
        isPaused: false, // Explicitly set to false for new sessions
      }

      const newSessions = new Map(get().activeWorkSessions)
      // Use workflowId as key to match WorkTrackingService's getSessionKey
      newSessions.set(sessionKey, localSession)

      set({ activeWorkSessions: newSessions })

      // Update step status in database
      await getDatabase().updateTaskStepProgress(stepId, {
        status: 'in_progress',
        startedAt: new Date(),  // Always set a valid timestamp when starting work
      })

      // Emit event to trigger UI updates
      // Event removed - reactive state handles updates
    } catch (error) {
      // Rollback UI state to prevent corruption
      set({ activeWorkSessions: originalSessions })

      // If work session was created in WorkTrackingService, try to stop it
      if (workSession?.id) {
        try {
          await getWorkTrackingService().stopWorkSession(workSession.id)
        } catch (cleanupError) {
          logger.ui.warn('Failed to cleanup work session after error', {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            sessionId: workSession.id,
          }, 'session-cleanup-error')
        }
      }

      logger.ui.error('Failed to start work on step', {
        error: error instanceof Error ? error.message : String(error),
        stepId,
        workflowId,
      }, 'step-work-start-error')

      // Re-throw error so caller knows the operation failed
      throw error
    }
  },

  startWorkOnTask: async (taskId: string) => {
    // Check if any work is active globally via WorkTrackingService
    if (getWorkTrackingService().isAnyWorkActive()) {
      return
    }

    // Starting work on task

    // Store original state for rollback
    const originalSessions = new Map(get().activeWorkSessions)
    let workSession: UnifiedWorkSession | null = null

    try {
      // Start work session in WorkTrackingService for persistence
      workSession = await getWorkTrackingService().startWorkSession(taskId, undefined, undefined)

      // Work session created successfully

      // Sync the session to store's activeWorkSessions so UI can see it
      const localSession: UnifiedWorkSession = {
        ...workSession,
        isPaused: false, // Explicitly set to false for new sessions
      }

      // Create new Map with the session
      const newSessions = new Map(get().activeWorkSessions)
      newSessions.set(taskId, localSession)

      set({ activeWorkSessions: newSessions })

      // Update task status in database
      await getDatabase().updateTask(taskId, {
        overallStatus: TaskStatus.InProgress,
      })

      // Emit event to trigger UI updates
      // Event removed - reactive state handles updates
    } catch (error) {
      // Rollback UI state to prevent corruption
      set({ activeWorkSessions: originalSessions })

      // If work session was created in WorkTrackingService, try to stop it
      if (workSession?.id) {
        try {
          await getWorkTrackingService().stopWorkSession(workSession.id)
        } catch (cleanupError) {
          logger.ui.warn('Failed to cleanup work session after error', {
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            sessionId: workSession.id,
          }, 'session-cleanup-error')
        }
      }

      logger.ui.error('Failed to start work on task', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      }, 'task-work-start-error')

      // Re-throw error so caller knows the operation failed
      throw error
    }
  },

  pauseWorkOnStep: async (stepId: string) => {
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
      return
    }

    try {
      // Use the session we already found - no need for redundant lookup
      const service = getWorkTrackingService()

      // Ensure the session has an ID
      if (!session.id) {
        logger.ui.error('Session found but has no ID', {
          stepId,
          sessionKey,
        }, 'step-work-pause-error')
        // Still remove from UI state to prevent stuck state
        const newSessions = new Map(state.activeWorkSessions)
        newSessions.delete(sessionKey)
        set({ activeWorkSessions: newSessions })
        return
      }

      // Pause via WorkTrackingService using the session we found
      await service.pauseWorkSession(session.id)

      // WorkTrackingService.pauseWorkSession already closed the session in the database
      // No need to create a duplicate work session record here

      // Remove the session from activeWorkSessions since it's now paused (closed in database)
      const newSessions = new Map(state.activeWorkSessions)
      newSessions.delete(sessionKey)

      set({ activeWorkSessions: newSessions })

      // Force schedule recomputation to show next task immediately
      useSchedulerStore.getState().recomputeSchedule()

      // Emit events to notify UI of state changes - no refresh needed
      // Event removed - reactive state handles updates
      // Event removed - reactive state handles updates
    } catch (error) {
      logger.ui.error('Failed to pause work on step', {
        error: error instanceof Error ? error.message : String(error),
        stepId,
      }, 'step-work-pause-error')

      // On error, still try to sync UI state to prevent stuck sessions
      try {
        const service = getWorkTrackingService()
        const activeSession = service.getCurrentActiveSession()

        // If service has no active session, remove from UI state
        if (!activeSession || activeSession.stepId !== stepId) {
          const newSessions = new Map(state.activeWorkSessions)
          newSessions.delete(sessionKey!)
          set({ activeWorkSessions: newSessions })
        }
      } catch (syncError) {
        // Log but don't throw - best effort sync
        logger.ui.warn('Failed to sync state after pause error', {
          error: syncError instanceof Error ? syncError.message : String(syncError),
        }, 'state-sync-error')
      }
    }
  },

  pauseWorkOnTask: async (taskId: string) => {
    const state = get()
    const session = state.activeWorkSessions.get(taskId)

    if (!session) {
      return
    }

    try {
      // Use the session we already found - no need for redundant lookup
      const service = getWorkTrackingService()

      // Ensure the session has an ID
      if (!session.id) {
        logger.ui.error('Session found but has no ID', {
          taskId,
        }, 'task-work-stop-error')
        // Still remove from UI state to prevent stuck state
        const newSessions = new Map(state.activeWorkSessions)
        newSessions.delete(taskId)
        set({ activeWorkSessions: newSessions })
        return
      }

      // Stop via WorkTrackingService using the session we found
      await service.stopWorkSession(session.id)

      // Remove from store
      const newSessions = new Map(state.activeWorkSessions)
      newSessions.delete(taskId)
      set({ activeWorkSessions: newSessions })

      // Force schedule recomputation to show next task immediately
      useSchedulerStore.getState().recomputeSchedule()

      // Emit events to notify UI of state changes - no refresh needed
      // Event removed - reactive state handles updates
      // Event removed - reactive state handles updates

    } catch (error) {
      logger.ui.error('Failed to stop work on task', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
      }, 'task-work-stop-error')

      // On error, still try to sync UI state to prevent stuck sessions
      try {
        const service = getWorkTrackingService()
        const activeSession = service.getCurrentActiveSession()

        // If service has no active session, remove from UI state
        if (!activeSession || activeSession.taskId !== taskId) {
          const newSessions = new Map(state.activeWorkSessions)
          newSessions.delete(taskId)
          set({ activeWorkSessions: newSessions })
        }
      } catch (syncError) {
        // Log but don't throw - best effort sync
        logger.ui.warn('Failed to sync state after stop error', {
          error: syncError instanceof Error ? syncError.message : String(syncError),
        }, 'state-sync-error')
      }

      // Re-throw the original error for proper error handling in UI
      throw error
    }
  },

  completeStep: async (stepId: string, actualMinutes?: number, notes?: string) => {

    const state = get()

    // Find the workflow that contains this step to get the correct session key
    const workflow = state.sequencedTasks.find(t =>
      t.steps.some(s => s.id === stepId),
    )

    // For workflow steps, the session is keyed by workflowId
    const sessionKey = workflow ? workflow.id : stepId
    const session = state.activeWorkSessions.get(sessionKey)


    let totalMinutes = actualMinutes || 0

    if (session && !actualMinutes) {
      // Calculate final duration if session is active
      const elapsed = session.isPaused ? 0 : Date.now() - session.startTime.getTime()
      totalMinutes = (session.actualMinutes || 0) + Math.floor(elapsed / 60000)
    }

    try {
      // Stop work session in WorkTrackingService if there's an active one
      const activeWorkSession = getWorkTrackingService().getCurrentActiveSession()

      if (activeWorkSession && activeWorkSession.stepId === stepId) {
        await getWorkTrackingService().stopWorkSession(activeWorkSession.id)
      }

      // Create work session record
      if (totalMinutes > 0) {
        await getDatabase().createStepWorkSession({
          taskStepId: stepId,
          // If there's a session, use its start time, otherwise calculate backward from now
          startTime: session?.startTime || new Date(Date.now() - totalMinutes * 60000),
          duration: totalMinutes,
          notes,
        })

        // Emit event to update other components
        // Event removed - reactive state handles updates
      }

      // Find the step to check if it has async wait time
      const step = state.sequencedTasks
        .flatMap(t => t.steps)
        .find(s => s.id === stepId)


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


      await getDatabase().updateTaskStepProgress(stepId, updateData)

      // Remove from active sessions (in-memory only - work session data is preserved in database)
      // For workflow steps, the session key is the workflowId, not the stepId
      const workflow = state.sequencedTasks.find(t =>
        t.steps.some(s => s.id === stepId),
      )
      const sessionKey = workflow?.id || stepId  // Use workflowId if found, fallback to stepId

      // NOTE: This only removes from the activeWorkSessions Map to stop showing as active
      // The actual work session records are preserved in the database for time tracking history
      const newSessions = new Map(state.activeWorkSessions)
      newSessions.delete(sessionKey)
      set({ activeWorkSessions: newSessions })

      // Don't emit SESSION_CHANGED here - we'll emit TASK_UPDATED at the end which covers everything

      // Update the step in memory without reloading from database
      const task = state.sequencedTasks.find(t =>
        t.steps.some(s => s.id === stepId),
      )


      if (task) {
        // Update the step status directly in the state
        const updatedTask = {
          ...task,
          steps: task.steps.map(s => {
            if (s.id === stepId) {
              // If step has async wait time, mark as waiting, otherwise completed
              const newStatus = s.asyncWaitTime && s.asyncWaitTime > 0
                ? StepStatus.Waiting
                : StepStatus.Completed

              return {
                ...s,
                status: newStatus,
                completedAt: new Date(),
                actualDuration: (s.actualDuration || 0) + (totalMinutes || 0),
              }
            }
            return s
          }),
        }

        // Check if all non-waiting steps are completed to update overall status
        const allStepsCompleted = updatedTask.steps.every(s =>
          s.status === StepStatus.Completed || s.status === StepStatus.Waiting,
        )
        if (allStepsCompleted) {
          updatedTask.overallStatus = TaskStatus.Completed
          updatedTask.completed = true
        }

        set(state => ({
          sequencedTasks: state.sequencedTasks.map(t =>
            t.id === task.id ? updatedTask : t,
          ),
        }))
      }

      // Reset skip index when a step is completed (to show the actual next task)
      get().resetNextTaskSkipIndex()

      // Force schedule recomputation to ensure UI updates immediately
      useSchedulerStore.getState().recomputeSchedule()

      // Don't call refreshAllData here - we've already updated the state directly
      // and emitted SESSION_CHANGED event. Calling refreshAllData causes unnecessary
      // re-loading from database which can cause race conditions.

      // Check if any waiting steps have completed their wait time
      await get().checkAndCompleteExpiredWaitTimes()

      // Emit event to notify that a work session has ended (triggers next task load)
      // Event removed - reactive state handles updates

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
        }

        await getDatabase().updateTaskStepProgress(stepId, {
          actualDuration: newActualDuration,
          ...(notes && { notes: updatedNotes }),
        })

        // Emit event to update other components
        // Event removed - reactive state handles updates
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

  // State reconciliation method to sync with WorkTrackingService
  reconcileActiveWorkSessions: async () => {
    try {
      const service = getWorkTrackingService()
      const activeSession = service.getCurrentActiveSession()

      const state = get()
      const newSessions = new Map<string, UnifiedWorkSession>()

      // If WorkTrackingService has an active session, ensure it's in our store
      if (activeSession) {
        // Determine the correct key based on session type
        let sessionKey: string
        if (activeSession.workflowId && activeSession.stepId) {
          // For workflow steps, use workflowId as key (consistent with WorkTrackingService)
          sessionKey = activeSession.workflowId
        } else if (activeSession.taskId) {
          // For regular tasks, use taskId as key
          sessionKey = activeSession.taskId
        } else {
          // Fallback to session ID if no task or workflow
          sessionKey = activeSession.id || 'default'
        }

        newSessions.set(sessionKey, activeSession)
      }

      // Update store only if there's a difference
      const currentKeys = Array.from(state.activeWorkSessions.keys()).sort()
      const newKeys = Array.from(newSessions.keys()).sort()

      if (JSON.stringify(currentKeys) !== JSON.stringify(newKeys)) {
        logger.ui.info('Reconciling active work sessions with WorkTrackingService', {
          previousKeys: currentKeys,
          newKeys: newKeys,
        }, 'session-reconcile')

        set({ activeWorkSessions: newSessions })

        // Trigger schedule recomputation after reconciliation
        useSchedulerStore.getState().recomputeSchedule()
      }
    } catch (error) {
      logger.ui.error('Failed to reconcile work sessions', {
        error: error instanceof Error ? error.message : String(error),
      }, 'session-reconcile-error')
    }
  },

  // Moved to useSchedulerStore for reactive scheduling

  startNextTask: async () => {
    try {
      // Check if any work is already active
      if (getWorkTrackingService().isAnyWorkActive()) {
        return
      }

      // Get the next scheduled item from the scheduler store
      const nextItem = useSchedulerStore.getState().nextScheduledItem

      if (!nextItem) {
        return
      }

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
      // Event removed - reactive state handles updates
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to start next task',
      })
    }
  },
}
  }),
)
