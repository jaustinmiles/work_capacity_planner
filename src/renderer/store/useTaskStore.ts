import { create } from 'zustand'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

interface TaskStore {
  tasks: Task[]
  sequencedTasks: SequencedTask[]
  selectedTaskId: string | null
  
  // Actions
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void
  addSequencedTask: (task: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  updateSequencedTask: (id: string, updates: Partial<SequencedTask>) => void
  deleteTask: (id: string) => void
  deleteSequencedTask: (id: string) => void
  toggleTaskComplete: (id: string) => void
  selectTask: (id: string | null) => void
  
  // Computed
  getTaskById: (id: string) => Task | undefined
  getSequencedTaskById: (id: string) => SequencedTask | undefined
  getIncompleteTasks: () => Task[]
  getCompletedTasks: () => Task[]
  getActiveSequencedTasks: () => SequencedTask[]
  getCompletedSequencedTasks: () => SequencedTask[]
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
  sequencedTasks: [
    // User's "Extended Estimated Stop Distance" workflow
    {
      id: generateId(),
      name: "Extended Estimated Stop Distance",
      importance: 10,
      urgency: 10,
      type: 'focused' as const,
      notes: "Increase stop distance, change eval timestamps or remove them, retrieve timestamps from egomotion extraction workflow",
      dependencies: [],
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [
        {
          id: "step-0",
          name: "Get Egomotion Timestamps",
          duration: 50,
          type: 'focused' as const,
          dependsOn: [],
          asyncWaitTime: 120,
          status: 'pending' as const
        },
        {
          id: "step-1",
          name: "Import timestamps, change test config",
          duration: 60,
          type: 'focused' as const,
          dependsOn: ["step-0"],
          asyncWaitTime: 0,
          status: 'pending' as const
        },
        {
          id: "step-2",
          name: "Code changes to allow evaluation past 60m range",
          duration: 25,
          type: 'focused' as const,
          dependsOn: [],
          asyncWaitTime: 0,
          status: 'pending' as const
        },
        {
          id: "step-3",
          name: "Submit workflow with full capability",
          duration: 60,
          type: 'focused' as const,
          dependsOn: ["step-2", "step-1", "step-0"],
          asyncWaitTime: 240,
          status: 'pending' as const
        },
        {
          id: "step-4",
          name: "Unit Test and CL",
          duration: 75,
          type: 'focused' as const,
          dependsOn: ["step-2", "step-1", "step-0"],
          asyncWaitTime: 120,
          status: 'pending' as const
        },
        {
          id: "step-5",
          name: "Verify WF Results/Iterate/Code Complete",
          duration: 50,
          type: 'focused' as const,
          dependsOn: ["step-4", "step-3"],
          asyncWaitTime: 240,
          status: 'pending' as const
        },
        {
          id: "step-6",
          name: "Complete with Buffer",
          duration: 60,
          type: 'admin' as const,
          dependsOn: ["step-5"],
          asyncWaitTime: 0,
          status: 'pending' as const
        }
      ],
      totalDuration: 380,
      criticalPathDuration: 620,
      worstCaseDuration: 760,
      overallStatus: 'not_started' as const
    }
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
  
  addSequencedTask: (taskData) => set((state) => ({
    sequencedTasks: [...state.sequencedTasks, {
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
  
  updateSequencedTask: (id, updates) => set((state) => ({
    sequencedTasks: state.sequencedTasks.map(task => 
      task.id === id 
        ? { ...task, ...updates, updatedAt: new Date() }
        : task
    )
  })),
  
  deleteTask: (id) => set((state) => ({
    tasks: state.tasks.filter(task => task.id !== id),
    selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId
  })),
  
  deleteSequencedTask: (id) => set((state) => ({
    sequencedTasks: state.sequencedTasks.filter(task => task.id !== id),
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
  
  getSequencedTaskById: (id) => get().sequencedTasks.find(task => task.id === id),
  
  getIncompleteTasks: () => get().tasks.filter(task => !task.completed),
  
  getCompletedTasks: () => get().tasks.filter(task => task.completed),
  
  getActiveSequencedTasks: () => get().sequencedTasks.filter(task => !task.completed),
  
  getCompletedSequencedTasks: () => get().sequencedTasks.filter(task => task.completed),
}))