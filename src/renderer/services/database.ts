/**
 * Database service for the renderer process
 *
 * This service provides a unified interface for all data operations.
 * It uses HTTP to communicate with the server (same server for desktop, mobile, and web).
 *
 * Server URL can be configured via setServerUrl() for connecting to remote servers.
 *
 * NOTE: Some features still use IPC (window.electronAPI) because they aren't yet
 * implemented on the server. These will be migrated over time.
 */

/* global fetch */

import { Task, Session, AICallOptions } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import {
  UserTaskType,
  CreateUserTaskTypeInput,
  UpdateUserTaskTypeInput,
  AccumulatedTimeResult,
} from '@shared/user-task-types'
import {
  TimeSink,
  TimeSinkSession,
  CreateTimeSinkInput,
  UpdateTimeSinkInput,
  CreateTimeSinkSessionInput,
  TimeSinkAccumulatedResult,
} from '@shared/time-sink-types'
import { LogQueryOptions, LogEntry, SessionLogSummary } from '@shared/log-types'
import { ScheduleSnapshot, ScheduleSnapshotData } from '@shared/schedule-snapshot-types'
import { UnifiedWorkSession } from '@shared/unified-work-session-types'
import { DailyWorkPattern } from '@shared/work-blocks-types'

// Import all API client functions
import * as api from './api-client'

// ============================================================================
// GLOBAL TYPE DECLARATION FOR ELECTRON IPC
// ONLY for features NOT YET migrated to the server
// TODO: Remove these as each feature gets server routes
// ============================================================================
declare global {
  interface Window {
    electronAPI?: {
      db: {
        // ❌ JOB CONTEXT - Not yet on server
        getJobContexts: () => Promise<unknown[]>
        getActiveJobContext: () => Promise<unknown | null>
        createJobContext: (__data: unknown) => Promise<unknown>
        updateJobContext: (id: string, __updates: unknown) => Promise<unknown>
        deleteJobContext: (id: string) => Promise<void>
        addContextEntry: (__jobContextId: string, entry: unknown) => Promise<unknown>

        // ❌ JARGON DICTIONARY - Not yet on server
        getJargonEntries: () => Promise<unknown[]>
        createJargonEntry: (__data: unknown) => Promise<unknown>
        updateJargonEntry: (id: string, __updates: unknown) => Promise<unknown>
        updateJargonDefinition: (term: string, __definition: string) => Promise<void>
        deleteJargonEntry: (id: string) => Promise<void>
        getJargonDictionary: () => Promise<Record<string, string>>

        // ❌ SCHEDULE SNAPSHOTS - Not yet on server
        createScheduleSnapshot: (data: ScheduleSnapshotData, label?: string) => Promise<ScheduleSnapshot>
        getScheduleSnapshots: (sessionId?: string) => Promise<ScheduleSnapshot[]>
        getScheduleSnapshotById: (id: string) => Promise<ScheduleSnapshot | null>
        getTodayScheduleSnapshot: () => Promise<ScheduleSnapshot | null>
        deleteScheduleSnapshot: (id: string) => Promise<void>

        // ❌ LOG VIEWER - Dev-only, not exposed via HTTP
        getSessionLogs: (options?: LogQueryOptions) => Promise<LogEntry[]>
        getLoggedSessions: () => Promise<SessionLogSummary[]>

        // ❌ DEV HELPERS - Intentionally not exposed via HTTP for safety
        deleteAllTasks: () => Promise<void>
        deleteAllSequencedTasks: () => Promise<void>
        deleteAllUserData: () => Promise<void>
      }
      // ❌ LOG PERSISTENCE - Dev-only
      persistLog?: (logEntry: unknown) => Promise<void>
      persistLogs?: (logs: unknown[]) => Promise<void>

      // ❌ FEEDBACK - Dev-only
      saveFeedback?: (feedback: unknown) => Promise<boolean>
      readFeedback?: () => Promise<unknown[]>
      loadFeedback?: () => Promise<unknown[]>
      updateFeedback?: (updatedFeedback: unknown) => Promise<boolean>
      getSessionId?: () => Promise<string>

      // ❌ MAIN PROCESS LOGGING - Electron-only
      onMainLog?: (callback: (entry: unknown) => void) => void
    }
  }
}

/**
 * Database service for the renderer process
 * Uses HTTP to communicate with the server
 */
export class RendererDatabaseService {
  private static instance: RendererDatabaseService

  private constructor() {
    // No special initialization needed for HTTP client
  }

  static getInstance(): RendererDatabaseService {
    if (!RendererDatabaseService.instance) {
      RendererDatabaseService.instance = new RendererDatabaseService()
    }
    return RendererDatabaseService.instance
  }

  /**
   * Configure the server URL for API requests
   * Call this before any other operations to connect to a different server
   */
  setServerUrl(url: string): void {
    api.setApiBaseUrl(url)
  }

  /**
   * Get the current server URL
   */
  getServerUrl(): string {
    return api.getApiBaseUrl()
  }

  /**
   * Check if the server is reachable
   */
  async checkServerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${api.getApiBaseUrl()}/api/health`)
      return response.ok
    } catch {
      return false
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  async getSessions(): Promise<Session[]> {
    return await api.getSessions()
  }

  async createSession(name: string, description?: string): Promise<Session> {
    const session = await api.createSession(name, description)
    // Save the newly created session as last used
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lastUsedSessionId', session.id)
    }
    return session
  }

  async switchSession(sessionId: string): Promise<Session> {
    const session = await api.activateSession(sessionId)
    // Save the last used session ID to localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('lastUsedSessionId', sessionId)
    }
    return session
  }

  async updateSession(id: string, updates: { name?: string; description?: string }): Promise<Session> {
    return await api.updateSession(id, updates)
  }

  async deleteSession(id: string): Promise<void> {
    return await api.deleteSession(id)
  }

  async getCurrentSession(): Promise<Session | null> {
    return await api.getActiveSession()
  }

  async loadLastUsedSession(): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }

    const lastUsedSessionId = window.localStorage.getItem('lastUsedSessionId')

    if (lastUsedSessionId) {
      try {
        // Check if the session still exists
        const sessions = await this.getSessions()
        const session = sessions.find(s => s.id === lastUsedSessionId)

        if (session) {
          // Switch to the last used session
          await this.switchSession(lastUsedSessionId)
        } else {
          // Session no longer exists, clear the stored ID
          window.localStorage.removeItem('lastUsedSessionId')
        }
      } catch {
        window.localStorage.removeItem('lastUsedSessionId')
      }
    }
  }

  async updateSchedulingPreferences(sessionId: string, updates: unknown): Promise<unknown> {
    return await api.updateSchedulingPreferences(sessionId, updates)
  }

  // ============================================================================
  // TASK OPERATIONS
  // ============================================================================

  async getTasks(includeArchived = false): Promise<Task[]> {
    return await api.getTasks({ archived: includeArchived ? undefined : false })
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<Task> {
    return await api.createTask(taskData)
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    return await api.updateTask(id, updates)
  }

  async deleteTask(id: string): Promise<void> {
    return await api.deleteTask(id)
  }

  async archiveTask(id: string): Promise<Task> {
    return await api.archiveTask(id)
  }

  async unarchiveTask(id: string): Promise<Task> {
    return await api.unarchiveTask(id)
  }

  async promoteTaskToWorkflow(taskId: string): Promise<Task> {
    return await api.promoteTaskToWorkflow(taskId)
  }

  async getTaskById(id: string): Promise<Task | null> {
    return await api.getTaskById(id)
  }

  // ============================================================================
  // SEQUENCED TASK / WORKFLOW OPERATIONS
  // ============================================================================

  async getSequencedTasks(): Promise<SequencedTask[]> {
    return await api.getWorkflows()
  }

  async createSequencedTask(
    taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>,
  ): Promise<SequencedTask> {
    return await api.createWorkflow(taskData)
  }

  async updateSequencedTask(id: string, updates: Partial<SequencedTask>): Promise<SequencedTask> {
    return await api.updateTask(id, updates)
  }

  async deleteSequencedTask(id: string): Promise<void> {
    return await api.deleteWorkflow(id)
  }

  async addStepToWorkflow(
    workflowId: string,
    stepData: {
      name: string
      duration: number
      type: string
      afterStep?: string
      beforeStep?: string
      dependencies?: string[]
      asyncWaitTime?: number
    },
  ): Promise<SequencedTask> {
    return await api.addStepToWorkflow(workflowId, stepData)
  }

  async getSequencedTaskById(id: string): Promise<SequencedTask | null> {
    return await api.getTaskById(id)
  }

  // ============================================================================
  // USER TASK TYPE OPERATIONS
  // ============================================================================

  async getUserTaskTypes(_sessionId?: string): Promise<UserTaskType[]> {
    return await api.getUserTaskTypes()
  }

  async getUserTaskTypeById(id: string): Promise<UserTaskType | null> {
    return await api.getUserTaskTypeById(id)
  }

  async createUserTaskType(input: Omit<CreateUserTaskTypeInput, 'sessionId'>): Promise<UserTaskType> {
    return await api.createUserTaskType(input)
  }

  async updateUserTaskType(id: string, updates: UpdateUserTaskTypeInput): Promise<UserTaskType> {
    return await api.updateUserTaskType(id, updates)
  }

  async deleteUserTaskType(id: string): Promise<void> {
    return await api.deleteUserTaskType(id)
  }

  async reorderUserTaskTypes(orderedIds: string[]): Promise<void> {
    return await api.reorderUserTaskTypes(orderedIds)
  }

  async sessionHasTaskTypes(_sessionId?: string): Promise<boolean> {
    return await api.sessionHasTaskTypes()
  }

  // ============================================================================
  // TIME SINK OPERATIONS
  // ============================================================================

  async getTimeSinks(_sessionId?: string): Promise<TimeSink[]> {
    return await api.getTimeSinks()
  }

  async getTimeSinkById(id: string): Promise<TimeSink | null> {
    return await api.getTimeSinkById(id)
  }

  async createTimeSink(input: Omit<CreateTimeSinkInput, 'sessionId'>): Promise<TimeSink> {
    return await api.createTimeSink(input)
  }

  async updateTimeSink(id: string, updates: UpdateTimeSinkInput): Promise<TimeSink> {
    return await api.updateTimeSink(id, updates)
  }

  async deleteTimeSink(id: string): Promise<void> {
    return await api.deleteTimeSink(id)
  }

  async reorderTimeSinks(orderedIds: string[]): Promise<void> {
    return await api.reorderTimeSinks(orderedIds)
  }

  // ============================================================================
  // TIME SINK SESSION OPERATIONS
  // ============================================================================

  async createTimeSinkSession(
    data: Omit<CreateTimeSinkSessionInput, 'startTime' | 'endTime'> & { startTime: string; endTime?: string },
  ): Promise<TimeSinkSession> {
    return await api.createTimeSinkSession(data)
  }

  async endTimeSinkSession(id: string, actualMinutes: number, notes?: string): Promise<TimeSinkSession> {
    return await api.endTimeSinkSession(id, actualMinutes, notes)
  }

  async getTimeSinkSessions(timeSinkId: string): Promise<TimeSinkSession[]> {
    return await api.getTimeSinkSessions(timeSinkId)
  }

  async getTimeSinkSessionsByDate(date: string): Promise<TimeSinkSession[]> {
    return await api.getTimeSinkSessionsByDate(date)
  }

  async getActiveTimeSinkSession(): Promise<TimeSinkSession | null> {
    return await api.getActiveTimeSinkSession()
  }

  async getTimeSinkAccumulated(startDate: string, endDate: string): Promise<TimeSinkAccumulatedResult> {
    return await api.getTimeSinkAccumulated(startDate, endDate)
  }

  async deleteTimeSinkSession(id: string): Promise<void> {
    return await api.deleteTimeSinkSession(id)
  }

  async splitTimeSinkSession(
    sessionId: string,
    splitTime: Date,
  ): Promise<{ firstHalf: TimeSinkSession; secondHalf: TimeSinkSession }> {
    return await api.splitTimeSinkSession(sessionId, splitTime)
  }

  // ============================================================================
  // WORK PATTERN OPERATIONS
  // ============================================================================

  async getWorkPattern(date: string): Promise<DailyWorkPattern | null> {
    return (await api.getWorkPattern(date)) as DailyWorkPattern | null
  }

  async createWorkPattern(data: Partial<DailyWorkPattern>): Promise<DailyWorkPattern> {
    return (await api.createWorkPattern(data)) as DailyWorkPattern
  }

  async updateWorkPattern(id: string, data: Partial<DailyWorkPattern>): Promise<DailyWorkPattern> {
    return (await api.updateWorkPattern(id, data)) as DailyWorkPattern
  }

  async getWorkPatterns(): Promise<DailyWorkPattern[]> {
    return (await api.getWorkPatterns()) as DailyWorkPattern[]
  }

  async deleteWorkPattern(id: string): Promise<void> {
    return await api.deleteWorkPattern(id)
  }

  async getWorkTemplates(): Promise<DailyWorkPattern[]> {
    return (await api.getWorkTemplates()) as DailyWorkPattern[]
  }

  async saveAsTemplate(date: string, templateName: string): Promise<DailyWorkPattern> {
    return (await api.saveAsTemplate(date, templateName)) as DailyWorkPattern
  }

  // ============================================================================
  // WORK SESSION OPERATIONS
  // ============================================================================

  async createWorkSession(data: Partial<UnifiedWorkSession>): Promise<UnifiedWorkSession> {
    return (await api.createWorkSession(data)) as UnifiedWorkSession
  }

  async updateWorkSession(id: string, data: Partial<UnifiedWorkSession>): Promise<UnifiedWorkSession> {
    return (await api.updateWorkSession(id, data)) as UnifiedWorkSession
  }

  async deleteWorkSession(id: string): Promise<void> {
    return await api.deleteWorkSession(id)
  }

  async splitWorkSession(
    sessionId: string,
    splitTime: Date,
    secondHalfTaskId?: string,
    secondHalfStepId?: string,
  ): Promise<{ firstHalf: UnifiedWorkSession; secondHalf: UnifiedWorkSession }> {
    return await api.splitWorkSession(sessionId, splitTime, secondHalfTaskId, secondHalfStepId)
  }

  async getWorkSessions(date: string): Promise<UnifiedWorkSession[]> {
    return (await api.getWorkSessions(date)) as UnifiedWorkSession[]
  }

  async getActiveWorkSession(): Promise<UnifiedWorkSession | null> {
    return (await api.getActiveWorkSession()) as UnifiedWorkSession | null
  }

  async getWorkSessionsForTask(taskId: string): Promise<UnifiedWorkSession[]> {
    return (await api.getWorkSessionsForTask(taskId)) as UnifiedWorkSession[]
  }

  async getTaskTotalLoggedTime(taskId: string): Promise<number> {
    return await api.getTaskTotalLoggedTime(taskId)
  }

  async getTodayAccumulated(date: string): Promise<AccumulatedTimeResult> {
    return await api.getTodayAccumulated(date)
  }

  // ============================================================================
  // PROGRESS TRACKING OPERATIONS
  // ============================================================================

  async createStepWorkSession(data: Partial<UnifiedWorkSession>): Promise<UnifiedWorkSession> {
    return (await api.createStepWorkSession(data)) as UnifiedWorkSession
  }

  async updateTaskStepProgress(stepId: string, data: Record<string, unknown>): Promise<void> {
    await api.updateTaskStepProgress(stepId, data)
  }

  async getStepWorkSessions(stepId: string): Promise<UnifiedWorkSession[]> {
    return (await api.getStepWorkSessions(stepId)) as UnifiedWorkSession[]
  }

  async recordTimeEstimate(data: Record<string, unknown>): Promise<void> {
    await api.recordTimeEstimate(data)
  }

  async getTimeAccuracyStats(filters?: Record<string, unknown>): Promise<Record<string, unknown>> {
    return (await api.getTimeAccuracyStats(filters)) as Record<string, unknown>
  }

  // ============================================================================
  // AI-POWERED OPERATIONS
  // ============================================================================

  async extractTasksFromBrainstorm(brainstormText: string): Promise<{
    tasks: Array<{
      name: string
      description: string
      estimatedDuration: number
      importance: number
      urgency: number
      type: string
      needsMoreInfo?: boolean
    }>
    summary: string
  }> {
    return await api.extractTasksFromBrainstorm(brainstormText)
  }

  async extractWorkflowsFromBrainstorm(
    brainstormText: string,
    jobContext?: string,
  ): Promise<{
    workflows: Array<{
      name: string
      description: string
      importance: number
      urgency: number
      type: string
      steps: unknown[]
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
      type: string
      needsMoreInfo?: boolean
    }>
    summary: string
  }> {
    return await api.extractWorkflowsFromBrainstorm(brainstormText, jobContext)
  }

  async generateWorkflowSteps(
    taskDescription: string,
    context?: unknown,
  ): Promise<{
    workflowName: string
    steps: unknown[]
    duration: number
    notes: string
  }> {
    return await api.generateWorkflowSteps(taskDescription, context)
  }

  async enhanceTaskDetails(
    taskName: string,
    currentDetails?: unknown,
  ): Promise<{
    suggestions: unknown
    confidence: number
  }> {
    return await api.enhanceTaskDetails(taskName, currentDetails)
  }

  async getContextualQuestions(
    taskName: string,
    taskDescription?: string,
  ): Promise<{
    questions: Array<{
      question: string
      type: 'text' | 'number' | 'choice'
      choices?: string[]
      purpose: string
    }>
  }> {
    return await api.getContextualQuestions(taskName, taskDescription)
  }

  async getJobContextualQuestions(
    brainstormText: string,
    jobContext?: string,
  ): Promise<{
    questions: Array<{
      question: string
      type: 'text' | 'number' | 'choice'
      choices?: string[]
      purpose: string
      priority: 'high' | 'medium' | 'low'
    }>
    suggestedJobContext?: string
  }> {
    return await api.getJobContextualQuestions(brainstormText, jobContext)
  }

  async extractScheduleFromVoice(
    voiceText: string,
    targetDate: string,
  ): Promise<{
    date: string
    blocks: Array<{
      id: string
      startTime: string
      endTime: string
      type: string | 'mixed'
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
  }> {
    return await api.extractScheduleFromVoice(voiceText, targetDate)
  }

  async extractMultiDayScheduleFromVoice(
    voiceText: string,
    startDate: string,
  ): Promise<
    Array<{
      date: string
      blocks: Array<{
        id: string
        startTime: string
        endTime: string
        type: string | 'mixed' | 'personal'
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
    }>
  > {
    return await api.extractMultiDayScheduleFromVoice(voiceText, startDate)
  }

  async extractJargonTerms(contextText: string): Promise<string> {
    return await api.extractJargonTerms(contextText)
  }

  async callAI(options: AICallOptions): Promise<{ content: string }> {
    return await api.callAI(options)
  }

  // ============================================================================
  // SPEECH-TO-TEXT OPERATIONS
  // ============================================================================

  async transcribeAudio(
    audioFilePath: string,
    options?: unknown,
  ): Promise<{
    text: string
  }> {
    return await api.transcribeAudio(audioFilePath, options)
  }

  async transcribeAudioBuffer(
    audioBuffer: ArrayBuffer | Uint8Array,
    filename: string,
    options?: { context?: string },
  ): Promise<{
    text: string
  }> {
    return await api.transcribeAudioBuffer(audioBuffer, filename, options)
  }

  async getSupportedFormats(): Promise<string[]> {
    return await api.getSupportedFormats()
  }

  async getBrainstormingSettings(): Promise<{
    language: string
    prompt: string
  }> {
    return await api.getBrainstormingSettings()
  }

  async getWorkflowSettings(): Promise<{
    language: string
    prompt: string
  }> {
    return await api.getWorkflowSettings()
  }

  async getSchedulingSettings(): Promise<{
    language: string
    prompt: string
  }> {
    return await api.getSchedulingSettings()
  }

  // ============================================================================
  // JOB CONTEXT OPERATIONS (Not yet on server - stubs)
  // ============================================================================

  async getJobContexts(): Promise<unknown[]> {
    return await api.getJobContexts()
  }

  async getActiveJobContext(): Promise<unknown | null> {
    return await api.getActiveJobContext()
  }

  async createJobContext(data: unknown): Promise<unknown> {
    return await api.createJobContext(data)
  }

  async updateJobContext(id: string, updates: unknown): Promise<unknown> {
    return await api.updateJobContext(id, updates)
  }

  async deleteJobContext(id: string): Promise<void> {
    return await api.deleteJobContext(id)
  }

  async addContextEntry(jobContextId: string, entry: unknown): Promise<unknown> {
    return await api.addContextEntry(jobContextId, entry)
  }

  // ============================================================================
  // JARGON DICTIONARY OPERATIONS (Not yet on server - stubs)
  // ============================================================================

  async getJargonEntries(): Promise<unknown[]> {
    return await api.getJargonEntries()
  }

  async createJargonEntry(data: unknown): Promise<unknown> {
    return await api.createJargonEntry(data)
  }

  async updateJargonEntry(id: string, updates: unknown): Promise<unknown> {
    return await api.updateJargonEntry(id, updates)
  }

  async updateJargonDefinition(term: string, definition: string): Promise<void> {
    return await api.updateJargonDefinition(term, definition)
  }

  async deleteJargonEntry(id: string): Promise<void> {
    return await api.deleteJargonEntry(id)
  }

  async getJargonDictionary(): Promise<Record<string, string>> {
    return await api.getJargonDictionary()
  }

  // ============================================================================
  // SCHEDULE SNAPSHOT OPERATIONS (Not yet on server - stubs)
  // ============================================================================

  async createScheduleSnapshot(data: ScheduleSnapshotData, label?: string): Promise<ScheduleSnapshot> {
    return await api.createScheduleSnapshot(data, label)
  }

  async getScheduleSnapshots(sessionId?: string): Promise<ScheduleSnapshot[]> {
    return await api.getScheduleSnapshots(sessionId)
  }

  async getScheduleSnapshotById(id: string): Promise<ScheduleSnapshot | null> {
    return await api.getScheduleSnapshotById(id)
  }

  async getTodayScheduleSnapshot(): Promise<ScheduleSnapshot | null> {
    return await api.getTodayScheduleSnapshot()
  }

  async deleteScheduleSnapshot(id: string): Promise<void> {
    return await api.deleteScheduleSnapshot(id)
  }

  // ============================================================================
  // LOG VIEWER OPERATIONS (Not exposed via HTTP for security)
  // ============================================================================

  async getSessionLogs(_options?: LogQueryOptions): Promise<LogEntry[]> {
    return await api.getSessionLogs(_options)
  }

  async getLoggedSessions(): Promise<SessionLogSummary[]> {
    return await api.getLoggedSessions()
  }

  // ============================================================================
  // DEVELOPMENT HELPERS (Not available via HTTP for safety)
  // ============================================================================

  async initializeDefaultData(): Promise<void> {
    return await api.initializeDefaultData()
  }

  async deleteAllTasks(): Promise<void> {
    return await api.deleteAllTasks()
  }

  async deleteAllSequencedTasks(): Promise<void> {
    return await api.deleteAllSequencedTasks()
  }

  async deleteAllUserData(): Promise<void> {
    return await api.deleteAllUserData()
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

// Re-export API client functions for direct use if needed
export { setApiBaseUrl, getApiBaseUrl } from './api-client'
