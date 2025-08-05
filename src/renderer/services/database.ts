import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

// Type for the Electron API exposed by preload script
declare global {
  interface Window {
    electronAPI: {
      db: {
        getTasks: () => Promise<Task[]>
        getSequencedTasks: () => Promise<SequencedTask[]>
        createTask: (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>
        createSequencedTask: (taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<SequencedTask>
        updateTask: (id: string, updates: Partial<Task>) => Promise<Task>
        updateSequencedTask: (id: string, updates: Partial<SequencedTask>) => Promise<SequencedTask>
        deleteTask: (id: string) => Promise<void>
        deleteSequencedTask: (id: string) => Promise<void>
        initializeDefaultData: () => Promise<void>
        getTaskById: (id: string) => Promise<Task | null>
        getSequencedTaskById: (id: string) => Promise<SequencedTask | null>
      }
    }
  }
}

/**
 * Database service for the renderer process
 * Uses Electron IPC to communicate with the main process database
 */
export class RendererDatabaseService {
  private static instance: RendererDatabaseService

  private constructor() {
    // Check if we're in an Electron environment
    if (typeof window === 'undefined') {
      throw new Error('Window object not available')
    }
    
    // Wait for electronAPI to be available (it might load asynchronously)
    if (!window.electronAPI) {
      console.error('window object:', window)
      console.error('Available properties:', Object.keys(window))
      throw new Error('Electron API not available. Make sure the preload script is loaded correctly.')
    }
  }

  static getInstance(): RendererDatabaseService {
    if (!RendererDatabaseService.instance) {
      RendererDatabaseService.instance = new RendererDatabaseService()
    }
    return RendererDatabaseService.instance
  }

  // Task operations
  async getTasks(): Promise<Task[]> {
    return await window.electronAPI.db.getTasks()
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    return await window.electronAPI.db.createTask(taskData)
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    return await window.electronAPI.db.updateTask(id, updates)
  }

  async deleteTask(id: string): Promise<void> {
    return await window.electronAPI.db.deleteTask(id)
  }

  // Sequenced task operations
  async getSequencedTasks(): Promise<SequencedTask[]> {
    return await window.electronAPI.db.getSequencedTasks()
  }

  async createSequencedTask(taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<SequencedTask> {
    return await window.electronAPI.db.createSequencedTask(taskData)
  }

  async updateSequencedTask(id: string, updates: Partial<SequencedTask>): Promise<SequencedTask> {
    return await window.electronAPI.db.updateSequencedTask(id, updates)
  }

  async deleteSequencedTask(id: string): Promise<void> {
    return await window.electronAPI.db.deleteSequencedTask(id)
  }

  // Utility methods
  async getTaskById(id: string): Promise<Task | null> {
    return await window.electronAPI.db.getTaskById(id)
  }

  async getSequencedTaskById(id: string): Promise<SequencedTask | null> {
    return await window.electronAPI.db.getSequencedTaskById(id)
  }

  // Initialize with default data
  async initializeDefaultData(): Promise<void> {
    return await window.electronAPI.db.initializeDefaultData()
  }
}

// Export singleton instance with lazy initialization
let dbInstance: RendererDatabaseService | null = null

export const getDatabase = (): RendererDatabaseService => {
  if (!dbInstance) {
    dbInstance = RendererDatabaseService.getInstance()
  }
  return dbInstance
}