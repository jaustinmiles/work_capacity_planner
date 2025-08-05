import { create } from 'zustand'
import { Task } from '@shared/types'

interface TaskStore {
  tasks: Task[]
  selectedTaskId: string | null
  
  // Actions
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  deleteTask: (id: string) => void
  toggleTaskComplete: (id: string) => void
  selectTask: (id: string | null) => void
  
  // Computed
  getTaskById: (id: string) => Task | undefined
  getIncompleteTasks: () => Task[]
  getCompletedTasks: () => Task[]
}

// Helper to generate IDs (will be replaced by database IDs later)
const generateId = () => crypto.randomUUID()

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [
    // Some sample tasks to start with
    {
      id: generateId(),
      name: 'Set up project structure',
      duration: 120,
      importance: 8,
      urgency: 9,
      type: 'focused',
      asyncWaitTime: 0,
      dependencies: [],
      completed: true,
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: generateId(),
      name: 'Design database schema',
      duration: 90,
      importance: 9,
      urgency: 7,
      type: 'focused',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: generateId(),
      name: 'Review pull requests',
      duration: 45,
      importance: 6,
      urgency: 8,
      type: 'admin',
      asyncWaitTime: 0,
      dependencies: [],
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  selectedTaskId: null,
  
  addTask: (taskData) => set((state) => ({
    tasks: [...state.tasks, {
      ...taskData,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }]
  })),
  
  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map(task => 
      task.id === id 
        ? { ...task, ...updates, updatedAt: new Date() }
        : task
    )
  })),
  
  deleteTask: (id) => set((state) => ({
    tasks: state.tasks.filter(task => task.id !== id),
    selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId
  })),
  
  toggleTaskComplete: (id) => set((state) => ({
    tasks: state.tasks.map(task => 
      task.id === id 
        ? { 
            ...task, 
            completed: !task.completed,
            completedAt: !task.completed ? new Date() : undefined,
            updatedAt: new Date()
          }
        : task
    )
  })),
  
  selectTask: (id) => set({ selectedTaskId: id }),
  
  getTaskById: (id) => get().tasks.find(task => task.id === id),
  
  getIncompleteTasks: () => get().tasks.filter(task => !task.completed),
  
  getCompletedTasks: () => get().tasks.filter(task => task.completed),
}))