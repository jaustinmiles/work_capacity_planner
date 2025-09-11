import { create } from 'zustand'
import { Task, NextScheduledItem } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskStatus } from '@shared/enums'
import { SchedulingService } from '@shared/scheduling-service'
import { SchedulingResult, WeeklySchedule } from '@shared/scheduling-models'
import { WorkSettings, DEFAULT_WORK_SETTINGS } from '@shared/work-settings-types'
import { WorkSession as ImportedWorkSession } from '@shared/workflow-progress-types'
import { UnifiedWorkSession, fromLocalWorkSession } from '@shared/unified-work-session-types'
import { getDatabase } from '../services/database'
import { appEvents, EVENTS } from '../utils/events'
import { logger } from '../utils/logger'
import { getRendererLogger } from '../../logging/index.renderer'
import { WorkTrackingService } from '../services/workTrackingService'

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
  getNextScheduledItem: () => Promise<NextScheduledItem | null>
  startNextTask: () => Promise<void>
}


// Helper to generate IDs (will be replaced by database IDs later)


// Create scheduling service instance
const schedulingService = new SchedulingService({
  getWorkPattern: (date: string) => getDatabase().getWorkPattern(date),
})

// Get logger instance for state change logging
const rendererLogger = getRendererLogger()

// Factory function for work tracking service (allows mocking in tests)
const createWorkTrackingService = () => new WorkTrackingService()

// Allow injecting a custom service for testing
let injectedWorkTrackingService: WorkTrackingService | null = null

export const injectWorkTrackingServiceForTesting = (service: WorkTrackingService) => {
  injectedWorkTrackingService = service
}

export const clearInjectedWorkTrackingService = () => {
  injectedWorkTrackingService = null
}

export const useTaskStore = create<TaskStore>((set, get) => {
  // Helper to get the current WorkTrackingService (checks injection each time for testing)
  const getWorkTrackingService = () => injectedWorkTrackingService || createWorkTrackingService()

  return {
    tasks: [],
    sequencedTasks: [],
    selectedTaskId: null,
    isLoading: true, // Start with true to prevent premature getNextScheduledItem calls
    error: null,
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

  initializeData: async () => {
    try {
      rendererLogger.info('[TaskStore] Starting data initialization...')
      // Clear existing data first to prevent stale data from showing
      set({
        tasks: [],
        sequencedTasks: [],
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
      rendererLogger.info('[TaskStore] Loading tasks and workflows from database...')
      const [tasks, sequencedTasks] = await Promise.all([
        getDatabase().getTasks(),
        getDatabase().getSequencedTasks(),
      ])

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
    set({ isScheduling: true, schedulingError: null })
    try {
      const state = get()
      rendererLogger.info('[TaskStore] Generating schedule', {
        taskCount: state.tasks.filter(t => !t.completed).length,
        workflowCount: state.sequencedTasks.filter(st => st.overallStatus !== 'completed').length,
        options,
      })
      const schedule = await schedulingService.createSchedule(
        state.tasks,
        state.sequencedTasks,
        options,
      )
      rendererLogger.info('[TaskStore] Schedule generated successfully', {
        scheduledItemCount: schedule.scheduledItems.length,
        hasConflicts: schedule.conflicts.length > 0,
      })
      set({ currentSchedule: schedule, isScheduling: false })
    } catch (error) {
      rendererLogger.error('[TaskStore] Failed to generate schedule', error as Error)
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
    const activeSession = state.activeWorkSessions.get(stepId)

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
      await getWorkTrackingService().startWorkSession(undefined, stepId, workflowId)

      // Also maintain UnifiedWorkSession for UI reactivity
      const newSession: UnifiedWorkSession = {
        id: `session-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`,
        taskId: workflowId,
        stepId,
        startTime: new Date(),
        isPaused: false,
        plannedMinutes: activeSession?.plannedMinutes || 60,
        actualMinutes: activeSession?.actualMinutes || undefined,
        type: 'focused' as any,
      }

      const newSessions = new Map(state.activeWorkSessions)
      newSessions.set(stepId, newSession)

      set({ activeWorkSessions: newSessions })

      // Update step status in database
      await getDatabase().updateTaskStepProgress(stepId, {
        status: 'in_progress',
        startedAt: activeSession ? undefined : new Date(),
      })

      rendererLogger.info('[TaskStore] Started work on step', {
        stepId,
        workflowId,
      })
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

    try {
      // Start work session in WorkTrackingService for persistence
      const workSession = await getWorkTrackingService().startWorkSession(taskId, undefined, undefined)

      // Sync the session to store's activeWorkSessions so UI can see it
      const localSession: UnifiedWorkSession = {
        ...workSession,
        isPaused: workSession.isPaused || false,
      }

      set(state => ({
        activeWorkSessions: new Map(state.activeWorkSessions.set(taskId, localSession)),
      }))

      // Update task status in database
      await getDatabase().updateTask(taskId, {
        overallStatus: TaskStatus.InProgress,
      })

      logger.store.info('[TaskStore] Started work on task', {
        taskId,
        sessionId: workSession.id,
      })
    } catch (error) {
      logger.ui.error('Failed to start work on task:', error)
      // Don't throw - handle gracefully
    }
  },

  pauseWorkOnStep: async (stepId: string) => {
    const state = get()
    const session = state.activeWorkSessions.get(stepId)

    if (!session || session.isPaused) {
      logger.ui.warn(`No active work session for step ${stepId}`)
      return
    }

    try {
      // Get current active session from WorkTrackingService
      const activeWorkSession = getWorkTrackingService().getCurrentActiveSession()
      if (activeWorkSession && activeWorkSession.stepId === stepId) {
        // Pause via WorkTrackingService
        await getWorkTrackingService().pauseWorkSession(activeWorkSession.id)
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
      newSessions.set(stepId, updatedSession)

      set({ activeWorkSessions: newSessions })
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

    // Fall back to local session state
    return get().activeWorkSessions.get(stepId)
  },

  getNextScheduledItem: async () => {
    try {
      rendererLogger.info('[TaskStore] Getting next scheduled item...')
      const state = get()

      // Get current tasks and workflows from state
      const tasks = state.tasks
      const sequencedTasks = state.sequencedTasks

      rendererLogger.info('[TaskStore] Current state for scheduling', {
        taskCount: tasks.length,
        workflowCount: sequencedTasks.length,
        totalSteps: sequencedTasks.reduce((sum, workflow) => sum + workflow.steps.length, 0),
        incompleteTasks: tasks.filter(t => t.overallStatus !== 'completed').length,
        incompleteWorkflows: sequencedTasks.filter(w => w.overallStatus !== 'completed').length,
      })

      // Use SchedulingService to determine the next item
      let nextItem: any = null
      try {
        nextItem = await schedulingService.getNextScheduledItem(tasks, sequencedTasks)
        rendererLogger.debug('[TaskStore] getNextScheduledItem returned:', nextItem)
      } catch (callError) {
        rendererLogger.error('[TaskStore] ERROR calling getNextScheduledItem:', callError)
        rendererLogger.error('[TaskStore] Error stack:', { stack: callError instanceof Error ? callError.stack : 'No stack' })
        nextItem = null
      }

      rendererLogger.info('[TaskStore] Got next scheduled item result', {
        hasResult: !!nextItem,
        nextItem: nextItem ? {
          type: nextItem.type,
          id: nextItem.id,
          title: nextItem.title,
          estimatedDuration: nextItem.estimatedDuration,
          workflowId: nextItem.workflowId,
        } : null,
        totalTasks: tasks.length,
        totalWorkflows: sequencedTasks.length,
      })

      return nextItem
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
