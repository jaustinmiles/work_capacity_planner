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
        // Job context operations
        getJobContexts: () => Promise<any[]>
        getActiveJobContext: () => Promise<any | null>
        createJobContext: (data: any) => Promise<any>
        updateJobContext: (id: string, updates: any) => Promise<any>
        deleteJobContext: (id: string) => Promise<void>
        addContextEntry: (jobContextId: string, entry: any) => Promise<any>
        // Jargon dictionary
        getJargonEntries: () => Promise<any[]>
        createJargonEntry: (data: any) => Promise<any>
        updateJargonEntry: (id: string, updates: any) => Promise<any>
        deleteJargonEntry: (id: string) => Promise<void>
        getJargonDictionary: () => Promise<Record<string, string>>
        // Development helpers
        deleteAllTasks: () => Promise<void>
        deleteAllSequencedTasks: () => Promise<void>
      }
      ai: {
        extractTasksFromBrainstorm: (brainstormText: string) => Promise<{
          tasks: Array<{
            name: string
            description: string
            estimatedDuration: number
            importance: number
            urgency: number
            type: 'focused' | 'admin'
            needsMoreInfo?: boolean
          }>
          summary: string
        }>
        extractWorkflowsFromBrainstorm: (brainstormText: string, jobContext?: string) => Promise<{
          workflows: Array<{
            name: string
            description: string
            importance: number
            urgency: number
            type: 'focused' | 'admin'
            steps: any[]
            totalDuration: number
            earliestCompletion: string
            worstCaseCompletion: string
            notes: string
          }>
          standaloneTasks: Array<{
            name: string
            description: string
            estimatedDuration: number
            importance: number
            urgency: number
            type: 'focused' | 'admin'
            needsMoreInfo?: boolean
          }>
          summary: string
        }>
        generateWorkflowSteps: (taskDescription: string, context?: any) => Promise<{
          workflowName: string
          steps: any[]
          totalDuration: number
          notes: string
        }>
        enhanceTaskDetails: (taskName: string, currentDetails?: any) => Promise<{
          suggestions: any
          confidence: number
        }>
        getContextualQuestions: (taskName: string, taskDescription?: string) => Promise<{
          questions: Array<{
            question: string
            type: 'text' | 'number' | 'choice'
            choices?: string[]
            purpose: string
          }>
        }>
        getJobContextualQuestions: (brainstormText: string, jobContext?: string) => Promise<{
          questions: Array<{
            question: string
            type: 'text' | 'number' | 'choice'
            choices?: string[]
            purpose: string
            priority: 'high' | 'medium' | 'low'
          }>
          suggestedJobContext?: string
        }>
      }
      speech: {
        transcribeAudio: (audioFilePath: string, options?: any) => Promise<{
          text: string
        }>
        transcribeAudioBuffer: (audioBuffer: Buffer, filename: string, options?: any) => Promise<{
          text: string
        }>
        getSupportedFormats: () => Promise<string[]>
        getBrainstormingSettings: () => Promise<{
          language: string
          prompt: string
        }>
        getWorkflowSettings: () => Promise<{
          language: string
          prompt: string
        }>
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

  // AI-powered operations
  async extractTasksFromBrainstorm(brainstormText: string) {
    return await window.electronAPI.ai.extractTasksFromBrainstorm(brainstormText)
  }

  async extractWorkflowsFromBrainstorm(brainstormText: string, jobContext?: string) {
    return await window.electronAPI.ai.extractWorkflowsFromBrainstorm(brainstormText, jobContext)
  }

  async generateWorkflowSteps(taskDescription: string, context?: any) {
    return await window.electronAPI.ai.generateWorkflowSteps(taskDescription, context)
  }

  async enhanceTaskDetails(taskName: string, currentDetails?: any) {
    return await window.electronAPI.ai.enhanceTaskDetails(taskName, currentDetails)
  }

  async getContextualQuestions(taskName: string, taskDescription?: string) {
    return await window.electronAPI.ai.getContextualQuestions(taskName, taskDescription)
  }

  async getJobContextualQuestions(brainstormText: string, jobContext?: string) {
    return await window.electronAPI.ai.getJobContextualQuestions(brainstormText, jobContext)
  }

  // Speech-to-text operations
  async transcribeAudio(audioFilePath: string, options?: any) {
    return await window.electronAPI.speech.transcribeAudio(audioFilePath, options)
  }

  async transcribeAudioBuffer(audioBuffer: Buffer, filename: string, options?: any) {
    return await window.electronAPI.speech.transcribeAudioBuffer(audioBuffer, filename, options)
  }

  async getSupportedFormats() {
    return await window.electronAPI.speech.getSupportedFormats()
  }

  async getBrainstormingSettings() {
    return await window.electronAPI.speech.getBrainstormingSettings()
  }

  async getWorkflowSettings() {
    return await window.electronAPI.speech.getWorkflowSettings()
  }

  // Job context operations
  async getJobContexts() {
    return await window.electronAPI.db.getJobContexts()
  }

  async getActiveJobContext() {
    return await window.electronAPI.db.getActiveJobContext()
  }

  async createJobContext(data: any) {
    return await window.electronAPI.db.createJobContext(data)
  }

  async updateJobContext(id: string, updates: any) {
    return await window.electronAPI.db.updateJobContext(id, updates)
  }

  async deleteJobContext(id: string) {
    return await window.electronAPI.db.deleteJobContext(id)
  }

  async addContextEntry(jobContextId: string, entry: any) {
    return await window.electronAPI.db.addContextEntry(jobContextId, entry)
  }

  // Jargon dictionary operations
  async getJargonEntries() {
    return await window.electronAPI.db.getJargonEntries()
  }

  async createJargonEntry(data: any) {
    return await window.electronAPI.db.createJargonEntry(data)
  }

  async updateJargonEntry(id: string, updates: any) {
    return await window.electronAPI.db.updateJargonEntry(id, updates)
  }

  async deleteJargonEntry(id: string) {
    return await window.electronAPI.db.deleteJargonEntry(id)
  }

  async getJargonDictionary() {
    return await window.electronAPI.db.getJargonDictionary()
  }

  // Development helpers
  async deleteAllTasks() {
    return await window.electronAPI.db.deleteAllTasks()
  }

  async deleteAllSequencedTasks() {
    return await window.electronAPI.db.deleteAllSequencedTasks()
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
