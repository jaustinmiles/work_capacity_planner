import { create } from 'zustand'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { SchedulingService } from '@shared/scheduling-service'
import { SchedulingResult, WeeklySchedule } from '@shared/scheduling-models'
import { WorkSettings, DEFAULT_WORK_SETTINGS } from '@shared/work-settings-types'
import { WorkSession as ImportedWorkSession } from '@shared/workflow-progress-types'
import { getDatabase } from '../services/database'
import { appEvents, EVENTS } from '../utils/events'
import { logger } from '../utils/logger'


interface LocalWorkSession {
  stepId: string
  startTime: Date
  isPaused: boolean
  duration: number // accumulated minutes
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
  isScheduling: boolean
  schedulingError: string | null

  // Progress tracking state
  activeWorkSessions: Map<string, LocalWorkSession>
  workSessionHistory: ImportedWorkSession[]

  // Data loading actions
  loadTasks: () => Promise<void>
  loadSequencedTasks: () => Promise<void>
  initializeData: () => Promise<void>

  // Actions
  addTask: (__task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  addSequencedTask: (task: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
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

  // Settings actions
  updateWorkSettings: (__settings: WorkSettings) => Promise<void>

  // Progress tracking actions
  startWorkOnStep: (stepId: string, __workflowId: string) => void
  pauseWorkOnStep: (stepId: string) => void
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
  getActiveWorkSession: (stepId: string) => LocalWorkSession | undefined
}


// Helper to generate IDs (will be replaced by database IDs later)


// Create scheduling service instance
const schedulingService = new SchedulingService()

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  sequencedTasks: [],
  selectedTaskId: null,
  isLoading: false,
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
  isScheduling: false,
  schedulingError: null,

  // Progress tracking state
  activeWorkSessions: new Map(),
  workSessionHistory: [],

  // Data loading actions
  loadTasks: async () => {
    try {
      // Loading tasks from database
      set({ isLoading: true, error: null })
      const tasks = await getDatabase().getTasks()
      // Tasks loaded successfully
      set({ tasks, isLoading: false })
    } catch (error) {
      logger.ui.error('Store: Error loading tasks:', error)
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
      // Sequenced tasks loaded successfully
      set({ sequencedTasks, isLoading: false })
    } catch (error) {
      logger.ui.error('Store: Error loading sequenced tasks:', error)
      set({
        error: error instanceof Error ? error.message : 'Failed to load sequenced tasks',
        isLoading: false,
      })
    }
  },

  initializeData: async () => {
    try {
      // Initializing store data
      set({ isLoading: true, error: null })
      await getDatabase().initializeDefaultData()
      // Loading all data from database
      const [tasks, sequencedTasks] = await Promise.all([
        getDatabase().getTasks(),
        getDatabase().getSequencedTasks(),
      ])
      // Store initialized successfully
      set({ tasks, sequencedTasks, isLoading: false })
    } catch (error) {
      logger.ui.error('Store: Failed to initialize data:', error)
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

      logger.store.info('Toggling task completion', { 
        taskId: id, 
        taskName: task.name,
        currentStatus: task.completed,
        newStatus: !task.completed 
      })

      const updates = {
        completed: !task.completed,
        completedAt: !task.completed ? new Date() : undefined,
      }

      await get().updateTask(id, updates)
      logger.store.debug('Task completion toggled successfully', { taskId: id })
    } catch (error) {
      logger.store.error('Failed to toggle task completion', error, { taskId: id })
      set({
        error: error instanceof Error ? error.message : 'Failed to toggle task completion',
      })
    }
  },

  selectTask: (id) => {
    logger.store.debug('Task selection changed', { taskId: id })
    set({ selectedTaskId: id })
  },

  // Scheduling actions
  generateSchedule: async (options = {}) => {
    set({ isScheduling: true, schedulingError: null })
    try {
      const state = get()
      const schedule = await schedulingService.createSchedule(
        state.tasks,
        state.sequencedTasks,
        options,
      )
      set({ currentSchedule: schedule, isScheduling: false })
    } catch (error) {
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
    schedulingError: null,
  }),

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
  startWorkOnStep: (stepId: string, __workflowId: string) => {
    const state = get()
    const activeSession = state.activeWorkSessions.get(stepId)

    if (activeSession && !activeSession.isPaused) {
      logger.ui.warn(`Work session for step ${stepId} is already active`)
      return
    }

    const newSession: LocalWorkSession = {
      stepId,
      startTime: new Date(),
      isPaused: false,
      duration: activeSession?.duration || 0,
    }

    const newSessions = new Map(state.activeWorkSessions)
    newSessions.set(stepId, newSession)

    set({ activeWorkSessions: newSessions })

    // Update step status in database
    getDatabase().updateTaskStepProgress(stepId, {
      status: 'in_progress',
      startedAt: activeSession ? undefined : new Date(),
    }).catch(error => {
      logger.ui.error('Failed to update step progress:', error)
    })
  },

  pauseWorkOnStep: (stepId: string) => {
    const state = get()
    const session = state.activeWorkSessions.get(stepId)

    if (!session || session.isPaused) {
      logger.ui.warn(`No active work session for step ${stepId}`)
      return
    }

    // Calculate duration since last start
    const elapsed = Date.now() - session.startTime.getTime()
    const newDuration = session.duration + Math.floor(elapsed / 60000) // Convert to minutes

    const updatedSession: LocalWorkSession = {
      ...session,
      isPaused: true,
      duration: newDuration,
    }

    const newSessions = new Map(state.activeWorkSessions)
    newSessions.set(stepId, updatedSession)

    set({ activeWorkSessions: newSessions })
  },

  completeStep: async (stepId: string, actualMinutes?: number, notes?: string) => {
    const state = get()
    const session = state.activeWorkSessions.get(stepId)

    let totalMinutes = actualMinutes || 0

    if (session && !actualMinutes) {
      // Calculate final duration if session is active
      const elapsed = session.isPaused ? 0 : Date.now() - session.startTime.getTime()
      totalMinutes = session.duration + Math.floor(elapsed / 60000)
    }

    try {
      // Create work session record
      if (totalMinutes > 0) {
        await getDatabase().createStepWorkSession({
          taskStepId: stepId,
          startTime: session?.startTime || new Date(),
          duration: totalMinutes,
          notes,
        })

        // Emit event to update other components
        appEvents.emit(EVENTS.TIME_LOGGED)
      }

      // Update step progress
      await getDatabase().updateTaskStepProgress(stepId, {
        status: 'completed',
        completedAt: new Date(),
        actualDuration: totalMinutes,
        percentComplete: 100,
        // If the step was never started, set startedAt to when it was completed minus duration
        startedAt: session?.startTime || new Date(Date.now() - totalMinutes * 60000),
      })

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
        await getDatabase().updateTaskStepProgress(stepId, {
          actualDuration: newActualDuration,
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
    return get().activeWorkSessions.get(stepId)
  },
}))
