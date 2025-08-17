import { Task, Session } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { logger } from '../utils/logger'


// Type for the Electron API exposed by preload script
declare global {
  interface Window {

    electronAPI: {
      db: {
        // Session management
        getSessions: () => Promise<Session[]>
        createSession: (__name: string, description?: string) => Promise<Session>
        switchSession: (__sessionId: string) => Promise<Session>
        updateSession: (id: string, __updates: { name?: string; description?: string }) => Promise<Session>
        deleteSession: (id: string) => Promise<void>
        // Task operations
        getTasks: () => Promise<Task[]>
        getSequencedTasks: () => Promise<SequencedTask[]>
        createTask: (__taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>) => Promise<Task>
        createSequencedTask: (taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>) => Promise<SequencedTask>
        updateTask: (__id: string, updates: Partial<Task>) => Promise<Task>
        updateSequencedTask: (__id: string, updates: Partial<SequencedTask>) => Promise<SequencedTask>
        deleteTask: (__id: string) => Promise<void>
        deleteSequencedTask: (id: string) => Promise<void>
        addStepToWorkflow: (__workflowId: string, stepData: any) => Promise<SequencedTask>
        initializeDefaultData: () => Promise<void>
        getTaskById: (__id: string) => Promise<Task | null>
        getSequencedTaskById: (id: string) => Promise<SequencedTask | null>
        // Job context operations
        getJobContexts: () => Promise<any[]>
        getActiveJobContext: () => Promise<any | null>
        createJobContext: (__data: any) => Promise<any>
        updateJobContext: (id: string, __updates: any) => Promise<any>
        deleteJobContext: (id: string) => Promise<void>
        addContextEntry: (__jobContextId: string, entry: any) => Promise<any>
        // Jargon dictionary
        getJargonEntries: () => Promise<any[]>
        createJargonEntry: (__data: any) => Promise<any>
        updateJargonEntry: (id: string, __updates: any) => Promise<any>
        updateJargonDefinition: (term: string, __definition: string) => Promise<void>
        deleteJargonEntry: (id: string) => Promise<void>
        getJargonDictionary: () => Promise<Record<string, string>>
        // Development helpers
        deleteAllTasks: () => Promise<void>
        deleteAllSequencedTasks: () => Promise<void>
        deleteAllUserData: () => Promise<void>
        // Work pattern operations
        getWorkPattern: (__date: string) => Promise<any>
        getWorkPatterns: () => Promise<any[]>
        deleteWorkPattern: (id: string) => Promise<void>
        createWorkPattern: (__data: any) => Promise<any>
        updateWorkPattern: (id: string, __data: any) => Promise<any>
        getWorkTemplates: () => Promise<any[]>
        saveAsTemplate: (date: string, __templateName: string) => Promise<any>
        // Work session operations
        createWorkSession: (data: any) => Promise<any>
        updateWorkSession: (__id: string, data: any) => Promise<any>
        deleteWorkSession: (__id: string) => Promise<void>
        getWorkSessions: (date: string) => Promise<any[]>
        getWorkSessionsForTask: (__taskId: string) => Promise<any[]>
        getTaskTotalLoggedTime: (taskId: string) => Promise<number>
        getTodayAccumulated: (__date: string) => Promise<{ focused: number; admin: number }>
        // Progress tracking operations
        createStepWorkSession: (data: any) => Promise<any>
        updateTaskStepProgress: (__stepId: string, data: any) => Promise<any>
        getStepWorkSessions: (__stepId: string) => Promise<any[]>
        recordTimeEstimate: (data: any) => Promise<any>
        getTimeAccuracyStats: (__filters?: any) => Promise<any>
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
        extractJargonTerms: (__contextText: string) => Promise<string>
        extractWorkflowsFromBrainstorm: (brainstormText: string, __jobContext?: string) => Promise<{
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
        generateWorkflowSteps: (taskDescription: string, __context?: any) => Promise<{
          workflowName: string
          steps: any[]
          duration: number
          notes: string
        }>
        enhanceTaskDetails: (taskName: string, __currentDetails?: any) => Promise<{
          suggestions: any
          confidence: number
        }>
        getContextualQuestions: (taskName: string, __taskDescription?: string) => Promise<{
          questions: Array<{
            question: string
            type: 'text' | 'number' | 'choice'
            choices?: string[]
            purpose: string
          }>
        }>
        getJobContextualQuestions: (brainstormText: string, __jobContext?: string) => Promise<{
          questions: Array<{
            question: string
            type: 'text' | 'number' | 'choice'
            choices?: string[]
            purpose: string
            priority: 'high' | 'medium' | 'low'
          }>
          suggestedJobContext?: string
        }>
        extractScheduleFromVoice: (voiceText: string, __targetDate: string) => Promise<{
          date: string
          blocks: Array<{
            id: string
            startTime: string
            endTime: string
            type: 'focused' | 'admin' | 'mixed'
            capacity?: {
              focused: number
              admin: number
            }
          }>
          meetings: Array<{
            id: string
            name: string
            startTime: string
            endTime: string
            type: 'meeting' | 'break' | 'personal' | 'blocked'
          }>
          summary: string
        }>
        parseAmendment: (transcription: string, __context: any) => Promise<any>
      }
      speech: {
        transcribeAudio: (audioFilePath: string, __options?: any) => Promise<{
          text: string
        }>
        transcribeAudioBuffer: (audioBuffer: Buffer, __filename: string, options?: any) => Promise<{
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
        getSchedulingSettings: () => Promise<{
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
      logger.error('Window object not available')
      throw new Error('Window object not available')
    }

    // Wait for electronAPI to be available (it might load asynchronously)
    if (!window.electronAPI) {
      logger.error('Electron API not available. window.electronAPI is:', window.electronAPI)
      logger.error('Available window properties:', Object.keys(window))
      throw new Error('Electron API not available. Make sure the preload script is loaded correctly.')
    }

    logger.debug('RendererDatabaseService: Initialized successfully')
  }

  static getInstance(): RendererDatabaseService {
    if (!RendererDatabaseService.instance) {
      RendererDatabaseService.instance = new RendererDatabaseService()
    }
    return RendererDatabaseService.instance
  }

  // Session management
  async getSessions(): Promise<Session[]> {
    return await window.electronAPI.db.getSessions()
  }

  async createSession(name: string, description?: string): Promise<Session> {
    return await window.electronAPI.db.createSession(name, description)
  }

  async switchSession(sessionId: string): Promise<Session> {
    return await window.electronAPI.db.switchSession(sessionId)
  }

  async updateSession(id: string, updates: { name?: string; description?: string }): Promise<Session> {
    return await window.electronAPI.db.updateSession(id, updates)
  }

  async deleteSession(id: string): Promise<void> {
    return await window.electronAPI.db.deleteSession(id)
  }

  // Task operations
  async getTasks(): Promise<Task[]> {
    logger.debug('RendererDB: Calling getTasks via IPC...')
    try {
      const tasks = await window.electronAPI.db.getTasks()
      logger.debug(`RendererDB: Received ${tasks.length} tasks from IPC`)
      return tasks
    } catch (error) {
      logger.error('RendererDB: Error getting tasks:', error)
      throw error
    }
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<Task> {
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

  async createSequencedTask(taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<SequencedTask> {
    return await window.electronAPI.db.createSequencedTask(taskData)
  }

  async updateSequencedTask(id: string, updates: Partial<SequencedTask>): Promise<SequencedTask> {
    return await window.electronAPI.db.updateSequencedTask(id, updates)
  }

  async deleteSequencedTask(id: string): Promise<void> {
    return await window.electronAPI.db.deleteSequencedTask(id)
  }

  async addStepToWorkflow(workflowId: string, stepData: {
    name: string
    duration: number
    type: 'focused' | 'admin'
    afterStep?: string
    beforeStep?: string
    dependencies?: string[]
    asyncWaitTime?: number
  }): Promise<SequencedTask> {
    return await window.electronAPI.db.addStepToWorkflow(workflowId, stepData)
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

  async extractScheduleFromVoice(voiceText: string, targetDate: string) {
    return await window.electronAPI.ai.extractScheduleFromVoice(voiceText, targetDate)
  }

  async extractJargonTerms(contextText: string) {
    return await window.electronAPI.ai.extractJargonTerms(contextText)
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

  async getSchedulingSettings() {
    return await window.electronAPI.speech.getSchedulingSettings()
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

  async updateJargonDefinition(term: string, definition: string) {
    return await window.electronAPI.db.updateJargonDefinition(term, definition)
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

  async deleteAllUserData() {
    return await window.electronAPI.db.deleteAllUserData()
  }

  // Work pattern operations
  async getWorkPattern(date: string) {
    return await window.electronAPI.db.getWorkPattern(date)
  }

  async createWorkPattern(data: any) {
    return await window.electronAPI.db.createWorkPattern(data)
  }

  async updateWorkPattern(id: string, data: any) {
    return await window.electronAPI.db.updateWorkPattern(id, data)
  }

  async getWorkPatterns() {
    return await window.electronAPI.db.getWorkPatterns()
  }

  async deleteWorkPattern(id: string) {
    return await window.electronAPI.db.deleteWorkPattern(id)
  }

  async getWorkTemplates() {
    return await window.electronAPI.db.getWorkTemplates()
  }

  async saveAsTemplate(date: string, templateName: string) {
    return await window.electronAPI.db.saveAsTemplate(date, templateName)
  }

  // Work session operations
  async createWorkSession(data: any) {
    return await window.electronAPI.db.createWorkSession(data)
  }

  async updateWorkSession(id: string, data: any) {
    return await window.electronAPI.db.updateWorkSession(id, data)
  }

  async deleteWorkSession(id: string) {
    return await window.electronAPI.db.deleteWorkSession(id)
  }

  async getWorkSessions(date: string) {
    return await window.electronAPI.db.getWorkSessions(date)
  }

  async getWorkSessionsForTask(taskId: string) {
    return await window.electronAPI.db.getWorkSessionsForTask(taskId)
  }

  async getTaskTotalLoggedTime(taskId: string) {
    return await window.electronAPI.db.getTaskTotalLoggedTime(taskId)
  }

  async getTodayAccumulated(date: string) {
    return await window.electronAPI.db.getTodayAccumulated(date)
  }

  // Progress tracking operations
  async createStepWorkSession(data: any) {
    return await window.electronAPI.db.createStepWorkSession(data)
  }

  async updateTaskStepProgress(stepId: string, data: any) {
    return await window.electronAPI.db.updateTaskStepProgress(stepId, data)
  }

  async getStepWorkSessions(stepId: string) {
    return await window.electronAPI.db.getStepWorkSessions(stepId)
  }

  async recordTimeEstimate(data: any) {
    return await window.electronAPI.db.recordTimeEstimate(data)
  }

  async getTimeAccuracyStats(filters?: any) {
    return await window.electronAPI.db.getTimeAccuracyStats(filters)
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
