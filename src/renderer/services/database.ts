import { Task, Session } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskType } from '@shared/enums'
import { logger } from '@/shared/logger'


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
        getCurrentSession: () => Promise<any>
        updateSchedulingPreferences: (sessionId: string, updates: any) => Promise<any>
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
        getTodayAccumulated: (__date: string) => Promise<{ focused: number; admin: number; personal?: number; total?: number }>
        // Progress tracking operations
        createStepWorkSession: (data: any) => Promise<any>
        updateTaskStepProgress: (__stepId: string, data: any) => Promise<any>
        getStepWorkSessions: (__stepId: string) => Promise<any[]>
        recordTimeEstimate: (data: any) => Promise<any>
        getTimeAccuracyStats: (__filters?: any) => Promise<any>
      }
      // Log persistence
      persistLog?: (logEntry: any) => Promise<void>
      persistLogs?: (logs: any[]) => Promise<void>
      ai: {
        extractTasksFromBrainstorm: (brainstormText: string) => Promise<{
          tasks: Array<{
            name: string
            description: string
            estimatedDuration: number
            importance: number
            urgency: number
            type: TaskType.Focused | 'admin'
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
            type: TaskType.Focused | 'admin'
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
            type: TaskType.Focused | 'admin'
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
            type: TaskType.Focused | 'admin' | 'mixed'
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
        extractMultiDayScheduleFromVoice: (voiceText: string, __startDate: string) => Promise<Array<{
          date: string
          blocks: Array<{
            id: string
            startTime: string
            endTime: string
            type: TaskType.Focused | 'admin' | 'mixed' | 'personal'
            capacity?: {
              focusMinutes?: number
              adminMinutes?: number
              personalMinutes?: number
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
        }>>
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
      // Feedback operations
      saveFeedback?: (feedback: any) => Promise<boolean>
      readFeedback?: () => Promise<any[]>
      loadFeedback?: () => Promise<any[]>
      updateFeedback?: (updatedFeedback: any) => Promise<boolean>
      getSessionId?: () => Promise<string>
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
      logger.ui.error('Window object not available')
      throw new Error('Window object not available')
    }

    // Wait for electronAPI to be available (it might load asynchronously)
    if (!window.electronAPI) {
      logger.ui.error('Electron API not available. window.electronAPI is:', window.electronAPI)
      logger.ui.error('Available window properties:', Object.keys(window))
      throw new Error('Electron API not available. Make sure the preload script is loaded correctly.')
    }

    logger.ui.debug('RendererDatabaseService: Initialized successfully')
  }

  static getInstance(): RendererDatabaseService {
    if (!RendererDatabaseService.instance) {
      RendererDatabaseService.instance = new RendererDatabaseService()
    }
    return RendererDatabaseService.instance
  }

  // Session management
  async getSessions(): Promise<Session[]> {
    const sessions = await window.electronAPI.db.getSessions()
    logger.ui.info('[Database] Retrieved sessions from database', {
      count: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        isActive: s.isActive,
      })),
    })
    return sessions
  }

  async createSession(name: string, description?: string): Promise<Session> {
    const session = await window.electronAPI.db.createSession(name, description)
    // Save the newly created session as last used
    window.localStorage.setItem('lastUsedSessionId', session.id)
    return session
  }

  async switchSession(sessionId: string): Promise<Session> {
    const session = await window.electronAPI.db.switchSession(sessionId)
    // Save the last used session ID to localStorage
    window.localStorage.setItem('lastUsedSessionId', sessionId)
    return session
  }

  async updateSession(id: string, updates: { name?: string; description?: string }): Promise<Session> {
    return await window.electronAPI.db.updateSession(id, updates)
  }

  async deleteSession(id: string): Promise<void> {
    return await window.electronAPI.db.deleteSession(id)
  }

  async getCurrentSession(): Promise<any> {
    const session = await window.electronAPI.db.getCurrentSession()
    if (session) {
      logger.ui.info('[Database] Current active session', {
        id: session.id,
        name: session.name,
        isActive: session.isActive,
      })
    } else {
      logger.ui.warn('[Database] No current session found')
    }
    return session
  }

  async loadLastUsedSession(): Promise<void> {
    logger.ui.info('[Database] Checking for last used session...')
    const lastUsedSessionId = window.localStorage.getItem('lastUsedSessionId')

    if (lastUsedSessionId) {
      logger.ui.info('[Database] Found stored session ID in localStorage', { sessionId: lastUsedSessionId })
      try {
        // Check if the session still exists
        const sessions = await this.getSessions()
        const session = sessions.find(s => s.id === lastUsedSessionId)

        if (session) {
          // Switch to the last used session
          await this.switchSession(lastUsedSessionId)
          logger.ui.info('[Database] Successfully loaded last used session', {
            sessionId: lastUsedSessionId,
            sessionName: session.name,
          })
        } else {
          // Session no longer exists, clear the stored ID
          logger.ui.warn('[Database] Last used session no longer exists in database', {
            sessionId: lastUsedSessionId,
          })
          window.localStorage.removeItem('lastUsedSessionId')

          // Log what sessions ARE available
          logger.ui.info('[Database] Available sessions after last used not found', {
            count: sessions.length,
            sessions: sessions.map(s => ({ id: s.id, name: s.name })),
          })
        }
      } catch (error) {
        logger.ui.error('[Database] Failed to load last used session', error)
        window.localStorage.removeItem('lastUsedSessionId')
      }
    } else {
      logger.ui.info('[Database] No last used session stored in localStorage')

      try {
        // Get and log current sessions
        const sessions = await this.getSessions()
        if (sessions.length > 0) {
          logger.ui.info('[Database] Sessions available but none marked as last used', {
            count: sessions.length,
            sessions: sessions.map(s => ({ id: s.id, name: s.name, isActive: s.isActive })),
          })
        } else {
          logger.ui.warn('[Database] No sessions exist in database')
        }
      } catch (error) {
        logger.ui.error('[Database] Failed to get sessions in loadLastUsedSession', error)
      }
    }
  }

  async updateSchedulingPreferences(sessionId: string, updates: any): Promise<any> {
    return await window.electronAPI.db.updateSchedulingPreferences(sessionId, updates)
  }

  // Task operations
  async getTasks(): Promise<Task[]> {
    logger.ui.debug('RendererDB: Calling getTasks via IPC...')
    try {
      const tasks = await window.electronAPI.db.getTasks()
      logger.ui.debug(`RendererDB: Received ${tasks.length} tasks from IPC`)
      return tasks
    } catch (error) {
      logger.ui.error('RendererDB: Error getting tasks:', error)
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
    type: TaskType
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

  async extractMultiDayScheduleFromVoice(voiceText: string, startDate: string) {
    return await window.electronAPI.ai.extractMultiDayScheduleFromVoice(voiceText, startDate)
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
