import { create } from 'zustand'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { SchedulingService } from '@shared/scheduling-service'
import { SchedulingResult, WeeklySchedule } from '@shared/scheduling-models'
import { WorkSettings, DEFAULT_WORK_SETTINGS } from '@shared/work-settings-types'
import { getDatabase } from '../services/database'

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

  // Data loading actions
  loadTasks: () => Promise<void>
  loadSequencedTasks: () => Promise<void>
  initializeData: () => Promise<void>

  // Actions
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  addSequencedTask: (task: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>
  updateSequencedTask: (id: string, updates: Partial<SequencedTask>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  deleteSequencedTask: (id: string) => Promise<void>
  toggleTaskComplete: (id: string) => Promise<void>
  selectTask: (id: string | null) => void

  // Scheduling actions
  generateSchedule: (options?: { startDate?: Date; tieBreaking?: 'creation_date' | 'duration_shortest' | 'duration_longest' | 'alphabetical' }) => Promise<void>
  generateWeeklySchedule: (weekStartDate: Date) => Promise<void>
  clearSchedule: () => void

  // Settings actions
  updateWorkSettings: (settings: WorkSettings) => Promise<void>

  // Computed
  getTaskById: (id: string) => Task | undefined
  getSequencedTaskById: (id: string) => SequencedTask | undefined
  getIncompleteTasks: () => Task[]
  getCompletedTasks: () => Task[]
  getActiveSequencedTasks: () => SequencedTask[]
  getCompletedSequencedTasks: () => SequencedTask[]
}

// Helper to generate IDs (will be replaced by database IDs later)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const generateId = () => window.crypto.randomUUID()

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

  // Data loading actions
  loadTasks: async () => {
    try {
      set({ isLoading: true, error: null })
      const tasks = await getDatabase().getTasks()
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

  initializeData: async () => {
    try {
      set({ isLoading: true, error: null })
      await getDatabase().initializeDefaultData()
      const [tasks, sequencedTasks] = await Promise.all([
        getDatabase().getTasks(),
        getDatabase().getSequencedTasks(),
      ])
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

      const updates = {
        completed: !task.completed,
        completedAt: !task.completed ? new Date() : undefined,
      }

      await get().updateTask(id, updates)
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to toggle task completion',
      })
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),

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
}))
