import { create } from 'zustand'
import { Task, NextScheduledItem } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskStatus } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { SchedulingService } from '@shared/scheduling-service'
import { SchedulingResult, WeeklySchedule } from '@shared/scheduling-models'
import { WorkSettings, DEFAULT_WORK_SETTINGS } from '@shared/work-settings-types'
import { UnifiedWorkSession } from '@shared/unified-work-session-types'
import { UnifiedSchedulerAdapter } from '@shared/unified-scheduler-adapter'
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
  currentSchedule: SchedulingResult | null
  currentWeeklySchedule: WeeklySchedule | null
  optimalSchedule: any | null
  isScheduling: boolean
  schedulingError: string | null

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
  generateSchedule: (__options?: { startDate?: Date; tieBreaking?: 'creation_date' | 'duration_shortest' | 'duration_longest' | 'alphabetical' }) => Promise<void>
  generateWeeklySchedule: (weekStartDate: Date) => Promise<void>
  clearSchedule: () => void
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


// Create scheduling service instance
const schedulingService = new SchedulingService({
  getWorkPattern: (date: string) => getDatabase().getWorkPattern(date),
})
// Create UnifiedSchedulerAdapter instance for direct scheduling
const unifiedSchedulerAdapter = new UnifiedSchedulerAdapter()

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
      logger.ui.info('[TaskStore] Created WorkTrackingService singleton (lazy)', {
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
    currentSchedule: null,
    currentWeeklySchedule: null,
    optimalSchedule: null,
    isScheduling: false,
    schedulingError: null,

    // Progress tracking state
    activeWorkSessions: new Map(),
    workSessionHistory: [],

    // Next task widget state
    nextTaskSkipIndex: 0,

    incrementNextTaskSkipIndex: () => {
      const currentIndex = get().nextTaskSkipIndex
      logger.ui.info('[TaskStore] Incrementing next task skip index', {    isLoading: false,
      })
    }
  },

  loadSequencedTasks: async () => {
    try {
      logger.ui.info('[TaskStore] Loading sequenced tasks from database')
      set({ isLoading: true, error: null })
      const sequencedTasks = await getDatabase().getSequencedTasks()
      // Sequenced tasks loaded successfully
      logger.ui.info('[TaskStore] Sequenced tasks loaded successfully', {    isLoading: false,
      })
    }
  },

  loadWorkPatterns: async () => {
    try {
      logger.ui.info('[WorkPatternLifeCycle] TaskStore.loadWorkPatterns - START')
      set({ workPatternsLoading: true })

      const db = getDatabase()
      const patterns: DailyWorkPattern[] = []

      // DEBUG: Log what getCurrentTime returns
      const currentTime = getCurrentTime()
      logger.ui.info('[DEBUG] loadWorkPatterns getCurrentTime:', {    accumulated: { focus: 0, admin: 0, personal: 0 },
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

      logger.ui.info('[WorkPatternLifeCycle] TaskStore.loadWorkPatterns - COMPLETE', {    error: error instanceof Error ? error.message : 'Failed to load work patterns',
      })
    }
  },

  initializeData: async () => {
    try {
      logger.ui.info('[TaskStore] Starting data initialization...')
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
        logger.ui.info('[TaskStore] Initializing WorkTrackingService...')
        await getWorkTrackingService().initialize()
        logger.ui.info('[TaskStore] WorkTrackingService initialized successfully')

        // Sync any restored active session to task store
        const restoredSession = getWorkTrackingService().getCurrentActiveSession()
        if (restoredSession) {
          logger.ui.info('[TaskStore] Syncing restored session to store', {    isLoading: false,
      })
    }
  },

  addTask: async (taskData) => {
    try {
      logger.ui.info('[TaskStore] Creating new task', {    error: null,
      }))
      logger.ui.info('[TaskStore] Task created successfully', {    error: error instanceof Error ? error.message : 'Failed to create task',
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
        logger.ui.info('Updated existing workflow', { workflowName: taskData.name })
      } else {
        // Create new workflow
        const sequencedTask = await getDatabase().createSequencedTask(taskData)
        set((state) => ({
          sequencedTasks: [...state.sequencedTasks, sequencedTask],
          error: null,
        }))
        logger.ui.info('Created new workflow', { workflowName: taskData.name })
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
      set((state) => ({
        tasks: state.tasks.map(task =>
          task.id === id ? updatedTask : task,
        ),
        error: null,
      }))
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
      logger.ui.info('Deleting task', {    error: null,
      }))
      logger.ui.info('[TaskStore] Task deleted successfully', { taskId: id })
    } catch (error) {
      logger.ui.error('[TaskStore] Failed to delete task', error as Error, { taskId: id })
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

      logger.ui.info('[TaskStore] Toggling task completion', {

      logger.ui.info('Toggling task completion', {    error: error instanceof Error ? error.message : 'Failed to toggle task completion',
      })
    }
  },

  selectTask: (id) => {
    const task = id ? get().tasks.find(t => t.id === id) : null
    logger.ui.info('Task selection changed', {    isScheduling: false,
        })
        return
      }

      // Use UnifiedSchedulerAdapter directly - same as Gantt chart
      const schedulingOptions = {
        startDate: options.startDate || getCurrentTime(),
        respectDeadlines: true,
        allowSplitting: true,
        debug: true,
      }

      logger.ui.info('[TaskStore] Calling unifiedSchedulerAdapter.scheduleTasks...')
      const result = unifiedSchedulerAdapter.scheduleTasks(
        state.tasks,
        state.workPatterns,
        schedulingOptions,
        state.sequencedTasks,
      )

      logger.ui.info('[TaskStore] UnifiedScheduler completed', {    wasRescheduled: false,
        })),
        unscheduledItems: result.unscheduledTasks.map(task => ({
          id: task.id,
          name: task.name,
          type: task.type,
          duration: task.duration,
          importance: task.importance,
          urgency: task.urgency,
          cognitiveComplexity: task.cognitiveComplexity || 3,
          dependsOn: task.dependencies || [],
          asyncWaitTime: task.asyncWaitTime || 0,
          isAsyncTrigger: false,
          ...(task.deadline && { deadline: task.deadline }),
          ...(task.deadlineType && { deadlineType: task.deadlineType }),
          sourceType: 'simple_task' as const,
          sourceId: task.id,
          status: 'pending' as const,
          scheduledDate: null,
          scheduledStartTime: null,
          scheduledEndTime: null,
          timeSlotId: null,
          consumesFocusedTime: task.type === 'focused',
          consumesAdminTime: task.type === 'admin',
          isOptimallyPlaced: false,
          wasRescheduled: false,
        })),
        conflicts: result.conflicts.map(conflict => ({
          type: 'capacity_exceeded' as const,
          affectedItems: [],
          description: conflict,
          severity: 'suggestion' as const,
          suggestedResolution: 'Add more capacity to the schedule',
        })),
        overCapacityDays: [],
        underUtilizedDays: [],
        suggestions: [],
        warnings: [],
        success: true,
        totalWorkDays: 0,
        totalFocusedHours: 0,
        totalAdminHours: 0,
        projectedCompletionDate: result.totalDuration > 0 ? new Date(result.totalDuration) : new Date(),
      }

      set({ currentSchedule: schedule, isScheduling: false })
      logger.ui.info('[TaskStore] Schedule set in state using UnifiedSchedulerAdapter')
    } catch (error) {
      logger.ui.error('[TaskStore] Failed to generate schedule', error as Error)
      logger.ui.info('[TaskStore] Error details:', {    isScheduling: false,
      })
    }
  },

  generateWeeklySchedule: async (weekStartDate: Date) => {
    set({ isScheduling: true, schedulingError: null })
    try {
      const state = get()
      const weeklySchedule = await schedulingService.createWeeklySchedule(
        state.tasks,
        state.sequencedTasks,
        weekStartDate,
      )
      set({ currentWeeklySchedule: weeklySchedule, isScheduling: false })
    } catch (error) {
      set({
        schedulingError: error instanceof Error ? error.message : 'Unknown scheduling error',
        isScheduling: false,
      })
    }
  },

  clearSchedule: () => set({
    currentSchedule: null,
    currentWeeklySchedule: null,
    optimalSchedule: null,
    schedulingError: null,
  }),

  setOptimalSchedule: (schedule: any) => {
    logger.ui.info('[TaskStore] Setting optimal schedule', {    startedAt: activeSession ? undefined : new Date(),
      })

      logger.ui.info('[TaskStore] Started work on step', {    overallStatus: TaskStatus.InProgress,
      })

      logger.ui.info('[TaskStore] Started work on task', {    error: error instanceof Error ? error.message : 'Failed to complete step',
      })
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
          logger.ui.info(`Appending notes to step ${stepId}: "${notes}"`)
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
      logger.ui.info('[TaskStore] Getting next scheduled item...', {    error: error instanceof Error ? error.message : 'Failed to get next scheduled item',
      })
      return null
    }
  },

  startNextTask: async () => {
    try {
      // Check if any work is already active
      if (getWorkTrackingService().isAnyWorkActive()) {
        logger.ui.warn('[TaskStore] Cannot start next task: work session already active')
        return
      }

      // Get the next scheduled item
      const nextItem = await get().getNextScheduledItem()

      if (!nextItem) {
        logger.ui.info('[TaskStore] No next task available to start')
        return
      }

      logger.ui.info('[TaskStore] Starting next task', {    error: error instanceof Error ? error.message : 'Failed to start next task',
      })
    }
  },
}
})
