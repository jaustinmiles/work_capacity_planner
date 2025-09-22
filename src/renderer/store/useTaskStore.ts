import { create } from 'zustand'
import { Task, NextScheduledItem } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskStatus } from '@shared/enums'
import { DailyWorkPattern } from '@shared/work-blocks-types'
import { SchedulingService } from '@shared/scheduling-service'
import { SchedulingResult, WeeklySchedule } from '@shared/scheduling-models'
import { WorkSettings, DEFAULT_WORK_SETTINGS } from '@shared/work-settings-types'
import { WorkSession as ImportedWorkSession } from '@shared/workflow-progress-types'
import { UnifiedWorkSession, fromLocalWorkSession } from '@shared/unified-work-session-types'
import { UnifiedSchedulerAdapter } from '@shared/unified-scheduler-adapter'
import { getDatabase } from '../services/database'
import { appEvents, EVENTS } from '../utils/events'
import { logger } from '../utils/logger'
import { getRendererLogger } from '../../logging/index.renderer'
import { WorkTrackingService } from '../services/workTrackingService'
import dayjs from 'dayjs'
import { getCurrentTime } from '../../shared/time-provider'

// Legacy interface for backward compatibility during migration
export interface LocalWorkSession {
  id?: string
  taskId?: string
  stepId?: string
  workflowId?: string
  startTime: Date
  endTime?: Date
  isPaused: boolean
  duration: number
  pausedAt?: Date
  type?: 'focused' | 'admin'
  plannedDuration?: number
  actualDuration?: number
}

// Migration function to convert legacy LocalWorkSession to UnifiedWorkSession
// Currently unused but kept for potential future migration needs
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function migrateLocalSession(session: LocalWorkSession): UnifiedWorkSession {
  return fromLocalWorkSession(session)
}


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
  workSessionHistory: ImportedWorkSession[]

  // Data loading actions
  loadTasks: () => Promise<void>
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
const rendererLogger = getRendererLogger()

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
      rendererLogger.info('[TaskStore] Created WorkTrackingService singleton (lazy)', {
        instanceId: (workTrackingServiceSingleton as any).instanceId,
      })
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

  // Data loading actions
  loadTasks: async () => {
    try {
      rendererLogger.info('[TaskStore] Loading tasks from database')
      // Loading tasks from database
      set({ isLoading: true, error: null })
      const tasks = await getDatabase().getTasks()
      // Tasks loaded successfully
      rendererLogger.info('[TaskStore] Tasks loaded successfully', {
        taskCount: tasks.length,
        incompleteCount: tasks.filter(t => !t.completed).length,
      })
      set({ tasks, isLoading: false })
    } catch (error) {
      logger.ui.error('Store: Error loading tasks:', error)
      rendererLogger.error('[TaskStore] Failed to load tasks', error as Error)
      set({
        error: error instanceof Error ? error.message : 'Failed to load tasks',
        isLoading: false,
      })
    }
  },

  loadSequencedTasks: async () => {
    try {
      rendererLogger.info('[TaskStore] Loading sequenced tasks from database')
      set({ isLoading: true, error: null })
      const sequencedTasks = await getDatabase().getSequencedTasks()
      // Sequenced tasks loaded successfully
      rendererLogger.info('[TaskStore] Sequenced tasks loaded successfully', {
        workflowCount: sequencedTasks.length,
        totalSteps: sequencedTasks.reduce((sum, st) => sum + st.steps.length, 0),
      })
      set({ sequencedTasks, isLoading: false })
    } catch (error) {
      logger.ui.error('Store: Error loading sequenced tasks:', error)
      rendererLogger.error('[TaskStore] Failed to load sequenced tasks', error as Error)
      set({
        error: error instanceof Error ? error.message : 'Failed to load sequenced tasks',
        isLoading: false,
      })
    }
  },

  loadWorkPatterns: async () => {
    try {
      rendererLogger.info('[WorkPatternLifeCycle] TaskStore.loadWorkPatterns - START')
      set({ workPatternsLoading: true })

      const db = getDatabase()
      const patterns: DailyWorkPattern[] = []

      // DEBUG: Log what getCurrentTime returns
      const currentTime = getCurrentTime()
      rendererLogger.info('[DEBUG] loadWorkPatterns getCurrentTime:', {
        time: currentTime.toISOString(),
        localDate: currentTime.toLocaleDateString(),
        localTime: currentTime.toLocaleTimeString(),
      })

      const today = dayjs(currentTime).startOf('day')
      rendererLogger.info('[DEBUG] loadWorkPatterns date range:', {
        startDate: today.add(-1, 'day').format('YYYY-MM-DD'),
        endDate: today.add(7, 'day').format('YYYY-MM-DD'),
        todayDate: today.format('YYYY-MM-DD'),
      })

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
            accumulated: { focusMinutes: 0, adminMinutes: 0 },
          })
        } else {
          // No pattern found - no default blocks
          patterns.push({
            date: dateStr,
            blocks: [],
            meetings: [],
            accumulated: { focusMinutes: 0, adminMinutes: 0 },
          })
        }
      }

      rendererLogger.info('[WorkPatternLifeCycle] TaskStore.loadWorkPatterns - COMPLETE', {
        total: patterns.length,
        withBlocks: patterns.filter(p => p.blocks && p.blocks.length > 0).length,
        dates: patterns.map(p => p.date),
        currentTime: getCurrentTime().toISOString(),
        realTime: new Date().toISOString(),
      })

      set({ workPatterns: patterns, workPatternsLoading: false })
    } catch (error) {
      rendererLogger.error('[TaskStore] Failed to load work patterns', error as Error)
      set({
        workPatterns: [],
        workPatternsLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load work patterns',
      })
    }
  },

  initializeData: async () => {
    try {
      rendererLogger.info('[TaskStore] Starting data initialization...')
      // Clear existing data first to prevent stale data from showing
      set({
        tasks: [],
        sequencedTasks: [],
        workPatterns: [],
        workPatternsLoading: true,
        isLoading: true,
        error: null,
      })

      // Initialize WorkTrackingService first to restore active sessions
      try {
        rendererLogger.info('[TaskStore] Initializing WorkTrackingService...')
        await getWorkTrackingService().initialize()
        rendererLogger.info('[TaskStore] WorkTrackingService initialized successfully')
      } catch (error) {
        rendererLogger.error('[TaskStore] Failed to initialize WorkTrackingService:', error)
        // Don't fail the whole initialization if work tracking fails
      }

      // Load last used session first to prevent default session flash
      rendererLogger.info('[TaskStore] Loading last used session...')
      await getDatabase().loadLastUsedSession()

      rendererLogger.info('[TaskStore] Initializing default data...')
      await getDatabase().initializeDefaultData()

      // Loading all data from database
      rendererLogger.info('[TaskStore] Loading tasks, workflows, and work patterns from database...')
      const [tasks, sequencedTasks] = await Promise.all([
        getDatabase().getTasks(),
        getDatabase().getSequencedTasks(),
      ])

      // Load work patterns separately (it's async and sets its own state)
      await get().loadWorkPatterns()

      rendererLogger.info('[TaskStore] Data loaded successfully', {
        taskCount: tasks.length,
        workflowCount: sequencedTasks.length,
        totalSteps: sequencedTasks.reduce((sum, workflow) => sum + workflow.steps.length, 0),
        firstTaskSessionId: tasks[0]?.sessionId,
      })

      // Store initialized successfully
      set({ tasks, sequencedTasks, isLoading: false })

      rendererLogger.info('[TaskStore] Store initialization completed successfully')
    } catch (error) {
      rendererLogger.error('[TaskStore] Failed to initialize data:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize data',
        isLoading: false,
      })
    }
  },

  addTask: async (taskData) => {
    try {
      rendererLogger.info('[TaskStore] Creating new task', {
        taskName: taskData.name,
        type: taskData.type,
        duration: taskData.duration,
        importance: taskData.importance,
        urgency: taskData.urgency,
      })
      const task = await getDatabase().createTask(taskData)
      set((state) => ({
        tasks: [...state.tasks, task],
        error: null,
      }))
      rendererLogger.info('[TaskStore] Task created successfully', {
        taskId: task.id,
        taskName: task.name,
      })
    } catch (error) {
      rendererLogger.error('[TaskStore] Failed to create task', error as Error)
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
      rendererLogger.info('[TaskStore] Deleting task', {
        taskId: id,
        taskName: task?.name,
      })
      await getDatabase().deleteTask(id)
      set((state) => ({
        tasks: state.tasks.filter(task => task.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        error: null,
      }))
      rendererLogger.info('[TaskStore] Task deleted successfully', { taskId: id })
    } catch (error) {
      rendererLogger.error('[TaskStore] Failed to delete task', error as Error, { taskId: id })
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

      logger.store.info('[TaskStore] Toggling task completion', {
        taskId: id,
        taskName: task.name,
        currentStatus: task.completed,
        newStatus: !task.completed,
      })

      logger.store.info('Toggling task completion', {
        taskId: id,
        taskName: task.name,
        currentStatus: task.completed,
        newStatus: !task.completed,
      })

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

            logger.store.info('Stopped work session for completed task', { taskId: id, sessionId: activeSession.id })
          } catch (error) {
            logger.store.warn('Failed to stop work session for completed task', error)
          }
        }
      }

      logger.store.info('Task completion toggled successfully', {
        taskId: id,
        isNowCompleted: !task.completed,
      })
    } catch (error) {
      logger.store.error('[TaskStore] Failed to toggle task completion', error, { taskId: id })
      set({
        error: error instanceof Error ? error.message : 'Failed to toggle task completion',
      })
    }
  },

  selectTask: (id) => {
    const task = id ? get().tasks.find(t => t.id === id) : null
    logger.store.debug('[TaskStore] Task selection changed', {
      taskId: id,
      taskName: task?.name,
    })
    set({ selectedTaskId: id })
  },

  // Scheduling actions
  generateSchedule: async (options = {}) => {
    rendererLogger.info('[TaskStore] generateSchedule called with options:', options)
    set({ isScheduling: true, schedulingError: null })
    try {
      const state = get()
      rendererLogger.info('[TaskStore] Generating schedule using UnifiedSchedulerAdapter', {
        taskCount: state.tasks.filter(t => !t.completed).length,
        workflowCount: state.sequencedTasks.filter(st => st.overallStatus !== 'completed').length,
        workPatternsCount: state.workPatterns.length,
        options,
      })

      // Check if we have work patterns loaded
      if (!state.workPatterns || state.workPatterns.length === 0) {
        rendererLogger.warn('[TaskStore] No work patterns available, cannot generate schedule')
        set({
          schedulingError: 'No work patterns available. Please set up your work schedule.',
          isScheduling: false,
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

      rendererLogger.info('[TaskStore] Calling unifiedSchedulerAdapter.scheduleTasks...')
      const result = unifiedSchedulerAdapter.scheduleTasks(
        state.tasks,
        state.workPatterns,
        schedulingOptions,
        state.sequencedTasks,
      )

      rendererLogger.info('[TaskStore] UnifiedScheduler completed', {
        scheduledCount: result.scheduledTasks.length,
        unscheduledCount: result.unscheduledTasks.length,
        totalDuration: result.totalDuration,
        conflicts: result.conflicts.length,
      })

      // Convert to SchedulingResult format that the store expects
      // This matches what SchedulingService.convertFromSchedulingResult does
      const schedule: SchedulingResult = {
        scheduledItems: result.scheduledTasks.map(item => ({
          id: item.task.id,
          name: item.task.name,
          type: item.task.type,
          duration: item.task.duration,
          importance: item.task.importance,
          urgency: item.task.urgency,
          cognitiveComplexity: item.task.cognitiveComplexity || 3,
          dependsOn: item.task.dependencies || [],
          asyncWaitTime: item.task.asyncWaitTime || 0,
          isAsyncTrigger: false,
          ...(item.task.deadline && { deadline: item.task.deadline }),
          ...(item.task.deadlineType && { deadlineType: item.task.deadlineType }),
          sourceType: 'simple_task' as const,
          sourceId: item.task.id,
          status: 'scheduled' as const,
          scheduledDate: new Date(item.startTime.toDateString()),
          scheduledStartTime: item.startTime,
          scheduledEndTime: item.endTime,
          timeSlotId: item.blockId || 'unknown',
          consumesFocusedTime: item.task.type === 'focused',
          consumesAdminTime: item.task.type === 'admin',
          isOptimallyPlaced: true,
          wasRescheduled: false,
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
      rendererLogger.info('[TaskStore] Schedule set in state using UnifiedSchedulerAdapter')
    } catch (error) {
      rendererLogger.error('[TaskStore] Failed to generate schedule', error as Error)
      rendererLogger.error('[TaskStore] Error details:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
      })
      set({
        schedulingError: error instanceof Error ? error.message : 'Unknown scheduling error',
        isScheduling: false,
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
    rendererLogger.info('[TaskStore] Setting optimal schedule', {
      scheduledItemCount: schedule?.length || 0,
    })
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
      logger.ui.warn('Cannot start work: another work session is already active')
      return
    }

    if (activeSession && !activeSession.isPaused) {
      logger.ui.warn(`Work session for step ${stepId} is already active`)
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

      rendererLogger.info('[TaskStore] Syncing workflow step session to store state', {
        stepId,
        workflowId,
        sessionKey,
        sessionId: workSession.id,
        isPaused: localSession.isPaused,
        sessionsBeforeUpdate: get().activeWorkSessions.size,
        sessionsAfterUpdate: newSessions.size,
      })

      set({ activeWorkSessions: newSessions })

      // Log after state update to verify
      rendererLogger.info('[TaskStore] State updated, verifying activeWorkSessions', {
        currentActiveSessionsSize: get().activeWorkSessions.size,
        hasSession: get().activeWorkSessions.has(stepId),
        sessionIsPaused: get().activeWorkSessions.get(stepId)?.isPaused,
      })

      // Update step status in database
      await getDatabase().updateTaskStepProgress(stepId, {
        status: 'in_progress',
        startedAt: activeSession ? undefined : new Date(),
      })

      rendererLogger.info('[TaskStore] Started work on step', {
        stepId,
        workflowId,
      })

      // Emit event to trigger UI updates
      appEvents.emit(EVENTS.SESSION_CHANGED)
    } catch (error) {
      logger.ui.error('Failed to start work on step:', error)
      // Don't throw - handle gracefully
    }
  },

  startWorkOnTask: async (taskId: string) => {
    // Check if any work is active globally via WorkTrackingService
    if (getWorkTrackingService().isAnyWorkActive()) {
      logger.ui.warn('Cannot start work: another work session is already active')
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

      rendererLogger.info('[TaskStore] Syncing session to store state', {
        taskId,
        sessionId: workSession.id,
        isPaused: localSession.isPaused,
        sessionsBeforeUpdate: get().activeWorkSessions.size,
        sessionsAfterUpdate: newSessions.size,
      })

      set({ activeWorkSessions: newSessions })

      // State updated with new work session
      rendererLogger.debug('[TaskStore] State updated for task', {
        taskId,
        currentActiveSessionsSize: get().activeWorkSessions.size,
        hasSession: get().activeWorkSessions.has(taskId),
        sessionIsPaused: get().activeWorkSessions.get(taskId)?.isPaused,
        allSessionKeys: Array.from(get().activeWorkSessions.keys()),
        allSessions: Array.from(get().activeWorkSessions.values()).map(s => ({
          id: s.id,
          taskId: s.taskId,
          isPaused: s.isPaused,
        })),
      })

      // Update task status in database
      await getDatabase().updateTask(taskId, {
        overallStatus: TaskStatus.InProgress,
      })

      logger.store.info('[TaskStore] Started work on task', {
        taskId,
        sessionId: workSession.id,
        activeSessionsInStore: get().activeWorkSessions.size,
      })

      // Emit event to trigger UI updates
      appEvents.emit(EVENTS.SESSION_CHANGED)
    } catch (error) {
      logger.ui.error('Failed to start work on task:', error)
      // Don't throw - handle gracefully
    }
  },

  pauseWorkOnStep: async (stepId: string) => {
    rendererLogger.warn('[TaskStore] ⏸️ pauseWorkOnStep called', { stepId })

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
      logger.ui.warn(`No active work session for step ${stepId}`, {
        sessionFound: !!session,
        sessionKey,
        allKeys: Array.from(state.activeWorkSessions.keys()),
      })
      return
    }

    try {
      // Get current active session from WorkTrackingService
      const service = getWorkTrackingService()
      rendererLogger.warn('[TaskStore] 🔍 Looking for active session', {
        stepId,
        serviceInstanceId: (service as any).instanceId,
      })

      const activeWorkSession = service.getCurrentActiveSession()
      rendererLogger.warn('[TaskStore] 🎯 Active session result', {
        foundActiveSession: !!activeWorkSession,
        activeSessionId: activeWorkSession?.id,
        activeSessionStepId: activeWorkSession?.stepId,
        requestedStepId: stepId,
        matchesStepId: activeWorkSession?.stepId === stepId,
      })

      if (activeWorkSession && activeWorkSession.stepId === stepId) {
        // Pause via WorkTrackingService
        rendererLogger.warn('[TaskStore] ⏸️ Attempting to pause session', {
          sessionId: activeWorkSession.id,
          serviceInstanceId: (service as any).instanceId,
        })
        await service.pauseWorkSession(activeWorkSession.id)
      } else {
        rendererLogger.error('[TaskStore] ❌ Cannot pause - no matching session found', {
          requestedStepId: stepId,
          foundSessionStepId: activeWorkSession?.stepId,
        })
      }

      // Calculate duration since last start
      const elapsed = Date.now() - session.startTime.getTime()
      const minutesWorked = Math.floor(elapsed / 60000) // Convert to minutes
      const newDuration = (session.actualMinutes || 0) + minutesWorked

      // Create a WorkSession record for the time just worked
      if (minutesWorked > 0) {
        try {
          // Create work session that ENDS at now and extends backward
          await getDatabase().createStepWorkSession({
            taskStepId: stepId,
            startTime: session.startTime,
            duration: minutesWorked,
          })

          // Update step's actual duration
          const step = state.sequencedTasks
            .flatMap(t => t.steps)
            .find(s => s.id === stepId)

          if (step) {
            const newActualDuration = (step.actualDuration || 0) + minutesWorked
            await getDatabase().updateTaskStepProgress(stepId, {
              actualDuration: newActualDuration,
            })
          }

          // Emit event to update other components
          appEvents.emit(EVENTS.TIME_LOGGED)
          logger.store.info(`Logged ${minutesWorked} minutes for step ${stepId} on pause`)
        } catch (error) {
          logger.store.error('Failed to create work session on pause:', error)
        }
      }

      const updatedSession: UnifiedWorkSession = {
        ...session,
        isPaused: true,
        actualMinutes: newDuration,
      }

      const newSessions = new Map(state.activeWorkSessions)
      // Use the correct key that we found earlier
      newSessions.set(sessionKey!, updatedSession)

      set({ activeWorkSessions: newSessions })

      // Emit event to trigger UI updates
      appEvents.emit(EVENTS.SESSION_CHANGED)
    } catch (error) {
      logger.ui.error('Failed to pause work on step:', error)
    }
  },

  completeStep: async (stepId: string, actualMinutes?: number, notes?: string) => {
    const state = get()
    const session = state.activeWorkSessions.get(stepId)

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
        appEvents.emit(EVENTS.TIME_LOGGED)
      }

      // Update step progress AND notes
      const updateData = {
        status: 'completed',
        completedAt: new Date(),
        actualDuration: totalMinutes,
        percentComplete: 100,
        // If the step was never started, set startedAt to when it was completed minus duration
        startedAt: session?.startTime || new Date(Date.now() - totalMinutes * 60000),
        // Save notes to the step itself, not just the work session
        ...(notes && { notes }),
      }

      if (notes) {
        logger.store.info(`Saving notes to step ${stepId}: "${notes}"`)
      }

      await getDatabase().updateTaskStepProgress(stepId, updateData)

      // Remove from active sessions
      const newSessions = new Map(state.activeWorkSessions)
      newSessions.delete(stepId)
      set({ activeWorkSessions: newSessions })

      // Reload the sequenced task to get updated data
      const task = state.sequencedTasks.find(t =>
        t.steps.some(s => s.id === stepId),
      )
      if (task) {
        const updatedTask = await getDatabase().getSequencedTaskById(task.id)
        set(state => ({
          sequencedTasks: state.sequencedTasks.map(t =>
            t.id === task.id ? updatedTask : t,
          ).filter((t): t is SequencedTask => t !== null),
        }))
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to complete step',
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
          logger.store.info(`Appending notes to step ${stepId}: "${notes}"`)
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

  getNextScheduledItem: async () => {
    try {
      rendererLogger.info('[TaskStore] Getting next scheduled item...')
      const state = get()

      // First, check if we have a current schedule
      // If not, generate one (but avoid if already scheduling)
      if (!state.currentSchedule && !state.isScheduling) {
        rendererLogger.info('[TaskStore] No current schedule, generating one...')
        await get().generateSchedule()
      } else if (state.isScheduling) {
        rendererLogger.info('[TaskStore] Schedule generation already in progress, waiting...')
        // Return null if still scheduling to avoid infinite loop
        return null
      }

      // Get the updated state after potential schedule generation
      const updatedState = get()
      const schedule = updatedState.currentSchedule

      if (!schedule || !schedule.scheduledItems || schedule.scheduledItems.length === 0) {
        rendererLogger.info('[TaskStore] No scheduled items available')
        return null
      }

      // Get current tasks and workflows for finding details
      const tasks = updatedState.tasks
      const sequencedTasks = updatedState.sequencedTasks

      rendererLogger.info('[TaskStore] Using existing schedule', {
        totalScheduledItems: schedule.scheduledItems.length,
        incompleteTasks: tasks.filter(t => !t.completed).length,
        incompleteWorkflows: sequencedTasks.filter(w => w.overallStatus !== 'completed').length,
      })

      // Find the first incomplete scheduled item
      // Filter out completed items and get the first one
      for (const scheduledItem of schedule.scheduledItems) {
        // Parse the item ID to determine type and find the actual item
        let isCompleted = false
        let itemDetails: any = null

        // Check if it's a workflow step
        const isWorkflowStep = sequencedTasks.some(seq =>
          seq.steps.some(step =>
            step.id === scheduledItem.id ||
            scheduledItem.id === `workflow_${seq.id}_step_${step.id}` ||
            scheduledItem.id === `step_${step.id}`,
          ),
        )

        if (isWorkflowStep) {
          // Find the workflow and step
          const workflow = sequencedTasks.find(seq =>
            seq.steps.some(step =>
              step.id === scheduledItem.id ||
              scheduledItem.id === `workflow_${seq.id}_step_${step.id}` ||
              scheduledItem.id === `step_${step.id}`,
            ),
          )
          const step = workflow?.steps.find(s =>
            s.id === scheduledItem.id ||
            scheduledItem.id === `workflow_${workflow.id}_step_${s.id}` ||
            scheduledItem.id === `step_${s.id}`,
          )

          if (step) {
            isCompleted = step.status === 'completed' || step.status === 'skipped'
            if (!isCompleted) {
              itemDetails = {
                type: 'step' as const,
                id: step.id,
                workflowId: workflow?.id,
                title: step.name,
                estimatedDuration: step.duration,
                scheduledStartTime: scheduledItem.scheduledStartTime,
              }
            }
          }
        } else {
          // Regular task - extract ID
          let taskId = scheduledItem.id
          if (taskId.startsWith('task_')) {
            taskId = taskId.slice(5)
          }

          const task = tasks.find(t => t.id === taskId)
          if (task) {
            isCompleted = task.completed
            if (!isCompleted) {
              itemDetails = {
                type: 'task' as const,
                id: task.id,
                title: task.name,
                estimatedDuration: task.duration,
                scheduledStartTime: scheduledItem.scheduledStartTime,
              }
            }
          }
        }

        // Return the first incomplete item
        if (!isCompleted && itemDetails) {
          rendererLogger.info('[TaskStore] Found next scheduled item', itemDetails)
          return itemDetails
        }
      }

      rendererLogger.info('[TaskStore] No incomplete scheduled items found')
      return null
    } catch (error) {
      rendererLogger.error('[TaskStore] Failed to get next scheduled item', error as Error)
      set({
        error: error instanceof Error ? error.message : 'Failed to get next scheduled item',
      })
      return null
    }
  },

  startNextTask: async () => {
    try {
      // Check if any work is already active
      if (getWorkTrackingService().isAnyWorkActive()) {
        rendererLogger.warn('[TaskStore] Cannot start next task: work session already active')
        return
      }

      // Get the next scheduled item
      const nextItem = await get().getNextScheduledItem()

      if (!nextItem) {
        rendererLogger.info('[TaskStore] No next task available to start')
        return
      }

      rendererLogger.info('[TaskStore] Starting next task', {
        type: nextItem.type,
        id: nextItem.id,
        title: nextItem.title,
        workflowId: nextItem.workflowId,
      })

      // Start work based on item type
      if (nextItem.type === 'step' && nextItem.workflowId) {
        await get().startWorkOnStep(nextItem.id, nextItem.workflowId)
      } else if (nextItem.type === 'task') {
        // Start work on regular task
        await get().startWorkOnTask(nextItem.id)
      }
    } catch (error) {
      rendererLogger.error('[TaskStore] Failed to start next task', error as Error)
      set({
        error: error instanceof Error ? error.message : 'Failed to start next task',
      })
    }
  },
}
})
