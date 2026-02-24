/**
 * tRPC-based Database Service for Renderer
 *
 * This service uses tRPC to communicate with the API server instead of IPC.
 * It maintains the same interface as RendererDatabaseService for compatibility.
 *
 * Used when the app is running in 'server' or 'client' mode.
 */

import { createDynamicClient, type ApiClient } from '@shared/trpc-client'
import type { Task, Session, AICallOptions, Endeavor, EndeavorWithTasks, EndeavorProgress } from '@shared/types'
import type {
  DeepWorkBoard,
  DeepWorkNodeWithData,
  CreateDeepWorkBoardInput,
  UpdateDeepWorkBoardInput,
  CreateTaskAndNodeInput,
  AddExistingNodeInput,
  UpdateNodePositionInput,
  BatchUpdateNodePositionsInput,
  SaveViewportInput,
  ImportFromSprintInput,
  CreateEdgeInput,
  RemoveEdgeInput,
} from '@shared/deep-work-board-types'
import type { SequencedTask } from '@shared/sequencing-types'
import { ChatMessageRole, EndeavorStatus, DeadlineType } from '@shared/enums'
import type { UserTaskType, CreateUserTaskTypeInput, UpdateUserTaskTypeInput, AccumulatedTimeResult } from '@shared/user-task-types'
import type { TimeSink, TimeSinkSession, CreateTimeSinkInput, UpdateTimeSinkInput, TimeSinkAccumulatedResult } from '@shared/time-sink-types'
import type { ScheduleSnapshot, ScheduleSnapshotData } from '@shared/schedule-snapshot-types'
import { serializeSnapshotData, deserializeSnapshotData } from '@shared/schedule-snapshot-types'
import type { UnifiedWorkSession } from '@shared/unified-work-session-types'
import { fromDatabaseWorkSession } from '@shared/unified-work-session-types'
import type { DailyWorkPattern, WorkBlock, Meeting } from '@shared/work-blocks-types'
import type { LogQueryOptions, LogEntry, SessionLogSummary } from '@shared/log-types'
import { amendmentsToJSON, amendmentsFromJSON } from './amendment-serialization'

// Type for app config exposed by preload
declare global {
  interface Window {
    appConfig: {
      mode: string
      serverUrl: string
      apiKey: string
      useTrpc: boolean
    }
  }
}

/**
 * Helper to convert Prisma null values to undefined for shared types
 * This bridges Prisma's `| null` with shared types' `?: optional`
 */
function nullToUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value === null ? undefined : value
  }
  return result as T
}

/**
 * Convert Uint8Array to base64 string in browser environment.
 * Browser's Uint8Array.toString() doesn't support encoding arguments like Node's Buffer,
 * so we need to use btoa() with proper byte-to-char conversion.
 *
 * IMPORTANT: This is exported for testing. Do not remove - this fixes a critical bug
 * where browser Uint8Array.toString('base64') doesn't work like Node's Buffer.
 */
export function uint8ArrayToBase64(bytes: Uint8Array | Buffer): string {
  // Handle actual Node Buffer (shouldn't happen in browser, but be safe)
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes)) {
    return bytes.toString('base64')
  }

  // Browser environment: convert Uint8Array to base64 using btoa
  // Process in chunks to avoid stack overflow on large arrays
  const CHUNK_SIZE = 8192
  let binary = ''
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)

  for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
    const chunk = uint8.subarray(i, Math.min(i + CHUNK_SIZE, uint8.length))
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }

  return window.btoa(binary)
}

/**
 * tRPC-based database service
 * Implements the same interface as RendererDatabaseService but uses HTTP/tRPC
 */
export class TrpcDatabaseService {
  private static instance: TrpcDatabaseService
  private client: ApiClient
  private currentSessionId: string | null = null

  private constructor() {
    // Create client with dynamic session ID
    console.log('TrpcDatabaseService constructor', window.appConfig.serverUrl, window.appConfig.apiKey)
    this.client = createDynamicClient(
      window.appConfig.serverUrl,
      window.appConfig.apiKey,
      () => this.currentSessionId,
    )

    // Try to load last session ID from localStorage
    this.currentSessionId = window.localStorage.getItem('lastUsedSessionId')
  }

  static getInstance(): TrpcDatabaseService {
    if (!TrpcDatabaseService.instance) {
      TrpcDatabaseService.instance = new TrpcDatabaseService()
    }
    return TrpcDatabaseService.instance
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  async getSessions(): Promise<Session[]> {
    const sessions = await this.client.session.getAll.query()
    return sessions.map((s) => nullToUndefined(s)) as Session[]
  }

  async createSession(name: string, description?: string): Promise<Session> {
    const session = await this.client.session.create.mutate({ name, description })
    window.localStorage.setItem('lastUsedSessionId', session.id)
    return nullToUndefined(session) as Session
  }

  async switchSession(sessionId: string): Promise<Session> {
    const session = await this.client.session.setActive.mutate({ id: sessionId })
    this.currentSessionId = sessionId
    window.localStorage.setItem('lastUsedSessionId', sessionId)
    return nullToUndefined(session) as Session
  }

  async updateSession(id: string, updates: { name?: string; description?: string }): Promise<Session> {
    const session = await this.client.session.update.mutate({ id, ...updates })
    return nullToUndefined(session) as Session
  }

  async deleteSession(id: string): Promise<void> {
    await this.client.session.delete.mutate({ id })
  }

  async getCurrentSession(): Promise<Session | null> {
    const session = await this.client.session.getActive.query()
    return session ? (nullToUndefined(session) as Session) : null
  }

  async loadLastUsedSession(): Promise<void> {
    const lastUsedSessionId = window.localStorage.getItem('lastUsedSessionId')
    if (lastUsedSessionId) {
      try {
        const sessions = await this.getSessions()
        const session = sessions.find((s) => s.id === lastUsedSessionId)
        if (session) {
          await this.switchSession(lastUsedSessionId)
        } else {
          window.localStorage.removeItem('lastUsedSessionId')
        }
      } catch {
        window.localStorage.removeItem('lastUsedSessionId')
      }
    }
  }

  /**
   * Ensures a valid session is set before making session-scoped requests.
   * Called automatically during initialization.
   *
   * Priority:
   * 1. Use localStorage session if valid
   * 2. Use active session from server
   * 3. Use first available session
   * 4. Create a default session if none exist
   */
  async ensureSession(): Promise<string> {
    // If we already have a session ID set, verify it's valid
    if (this.currentSessionId) {
      try {
        const sessions = await this.getSessions()
        if (sessions.some((s) => s.id === this.currentSessionId)) {
          return this.currentSessionId
        }
      } catch {
        // Session invalid, continue to find/create one
      }
      this.currentSessionId = null
      window.localStorage.removeItem('lastUsedSessionId')
    }

    // Try to get sessions from server
    const sessions = await this.getSessions()

    // Try active session first
    const activeSession = sessions.find((s) => s.isActive)
    if (activeSession) {
      this.currentSessionId = activeSession.id
      window.localStorage.setItem('lastUsedSessionId', activeSession.id)
      return activeSession.id
    }

    // Use first available session
    if (sessions.length > 0) {
      const firstSession = sessions[0]!
      await this.switchSession(firstSession.id)
      return firstSession.id
    }

    // No sessions exist - create default
    const newSession = await this.createSession('Default Session', 'Auto-created session')
    await this.switchSession(newSession.id)
    return newSession.id
  }

  /**
   * Check if a session is currently set
   */
  hasSession(): boolean {
    return this.currentSessionId !== null
  }

  /**
   * Update scheduling preferences for a session
   * Creates preferences if they don't exist, updates if they do (upsert)
   */
  async updateSchedulingPreferences(
    sessionId: string,
    updates: {
      allowWeekendWork?: boolean
      weekendPenalty?: number
      contextSwitchPenalty?: number
      asyncParallelizationBonus?: number
      bedtimeHour?: number
      wakeHour?: number
    },
  ): Promise<Session> {
    await this.client.session.updateSchedulingPreferences.mutate({
      sessionId,
      ...updates,
    })
    // Return the session after updating preferences
    const session = await this.client.session.getById.query({ id: sessionId })
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    return nullToUndefined(session as unknown as Record<string, unknown>) as unknown as Session
  }

  /**
   * Get scheduling preferences for a session
   */
  async getSchedulingPreferences(sessionId: string): Promise<{
    allowWeekendWork: boolean
    weekendPenalty: number
    contextSwitchPenalty: number
    asyncParallelizationBonus: number
    bedtimeHour: number
    wakeHour: number
  } | null> {
    const prefs = await this.client.session.getSchedulingPreferences.query({ sessionId })
    if (!prefs) return null
    return {
      allowWeekendWork: prefs.allowWeekendWork,
      weekendPenalty: prefs.weekendPenalty,
      contextSwitchPenalty: prefs.contextSwitchPenalty,
      asyncParallelizationBonus: prefs.asyncParallelizationBonus,
      bedtimeHour: prefs.bedtimeHour,
      wakeHour: prefs.wakeTimeHour,
    }
  }

  // ============================================================================
  // Task Operations
  // ============================================================================

  async getTasks(includeArchived = false): Promise<Task[]> {
    const tasks = await this.client.task.getAll.query({ includeArchived })
    return tasks as Task[]
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<Task> {
    const task = await this.client.task.create.mutate(
      taskData as Parameters<typeof this.client.task.create.mutate>[0],
    )
    return task as Task
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const task = await this.client.task.update.mutate({ id, ...updates })
    return task as Task
  }

  async deleteTask(id: string): Promise<void> {
    await this.client.task.delete.mutate({ id })
  }

  async getTaskById(id: string): Promise<Task | null> {
    const task = await this.client.task.getById.query({ id })
    return task as Task | null
  }

  async archiveTask(id: string): Promise<Task> {
    const task = await this.client.task.archive.mutate({ id })
    return task as Task
  }

  async unarchiveTask(id: string): Promise<Task> {
    const task = await this.client.task.unarchive.mutate({ id })
    return task as Task
  }

  async promoteTaskToWorkflow(taskId: string): Promise<Task> {
    const task = await this.client.task.promoteToWorkflow.mutate({ id: taskId })
    return task as Task
  }

  // ============================================================================
  // Sequenced Tasks (Tasks with Steps/Workflows)
  // These are the same as regular tasks but include step data
  // ============================================================================

  async getSequencedTasks(): Promise<SequencedTask[]> {
    // Sequenced tasks are tasks with hasSteps=true AND actual steps
    const tasks = await this.client.task.getAll.query({ includeArchived: false })
    // Filter to only include tasks that have steps (workflows)
    const sequencedTasks = tasks.filter((t) => t.hasSteps && t.steps && t.steps.length > 0)
    return sequencedTasks as SequencedTask[]
  }

  async getSequencedTaskById(id: string): Promise<SequencedTask | null> {
    const task = await this.client.task.getById.query({ id })
    return task as SequencedTask | null
  }

  async createSequencedTask(
    taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>,
  ): Promise<SequencedTask> {
    const task = await this.client.task.create.mutate(
      taskData as Parameters<typeof this.client.task.create.mutate>[0],
    )
    return task as SequencedTask
  }

  async updateSequencedTask(id: string, updates: Partial<SequencedTask>): Promise<SequencedTask> {
    // If steps are included, use the dedicated atomic workflow update endpoint
    if (updates.steps && updates.steps.length > 0) {
      const workflowInput = {
        id,
        name: updates.name,
        importance: updates.importance,
        urgency: updates.urgency,
        type: updates.type,
        notes: updates.notes,
        deadline: updates.deadline,
        deadlineType: updates.deadlineType,
        steps: updates.steps.map((step, index) => ({
          id: step.id,
          name: step.name,
          duration: step.duration,
          type: step.type,
          dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
          asyncWaitTime: step.asyncWaitTime ?? 0,
          cognitiveComplexity: step.cognitiveComplexity,
          isAsyncTrigger: step.isAsyncTrigger ?? false,
          expectedResponseTime: step.expectedResponseTime,
          stepIndex: step.stepIndex ?? index,
          status: step.status,
          percentComplete: step.percentComplete,
          actualDuration: step.actualDuration,
          notes: step.notes,
          importance: step.importance,
          urgency: step.urgency,
        })),
      }
      const task = await this.client.workflow.updateWithSteps.mutate(workflowInput)
      return task as SequencedTask
    }

    // Fallback for metadata-only updates (no steps)
    const task = await this.client.task.update.mutate({ id, ...updates })
    return task as SequencedTask
  }

  async deleteSequencedTask(id: string): Promise<void> {
    await this.client.task.delete.mutate({ id })
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
    // Add the step to the workflow
    await this.client.workflow.addStep.mutate({
      workflowId,
      name: stepData.name,
      duration: stepData.duration,
      type: stepData.type,
      afterStep: stepData.afterStep,
      beforeStep: stepData.beforeStep,
      dependencies: stepData.dependencies,
      asyncWaitTime: stepData.asyncWaitTime ?? 0,
    })
    // Return the updated workflow with all steps
    const workflow = await this.getSequencedTaskById(workflowId)
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found after adding step`)
    }
    return workflow
  }

  async getStepWorkSessions(stepId: string): Promise<unknown[]> {
    return this.client.workflow.getStepWorkSessions.query({ stepId })
  }

  /**
   * Get a workflow by one of its step IDs.
   * More efficient than loading all tasks and searching.
   */
  async getWorkflowByStepId(stepId: string): Promise<SequencedTask | null> {
    const workflow = await this.client.workflow.getByStepId.query({ stepId })
    return workflow as SequencedTask | null
  }

  /**
   * Update a task step's progress/status.
   * This is a helper that finds the taskId from the step and calls updateStep.
   */
  async updateTaskStepProgress(
    stepId: string,
    data: {
      status?: string
      startedAt?: Date | null
      completedAt?: Date | null
      percentComplete?: number
      actualDuration?: number | null
      notes?: string | null
    },
  ): Promise<void> {
    // Use efficient lookup instead of loading all tasks
    const workflow = await this.getWorkflowByStepId(stepId)
    const taskId = workflow?.id

    if (!taskId) {
      throw new Error(`Step ${stepId} not found in any workflow`)
    }

    // Now update the step using the workflow.updateStep mutation
    await this.client.workflow.updateStep.mutate({
      taskId,
      stepId,
      ...data,
    })
  }

  /**
   * Update a task step directly when taskId is known.
   */
  async updateTaskStep(
    taskId: string,
    stepId: string,
    data: {
      status?: string
      startedAt?: Date | null
      completedAt?: Date | null
      percentComplete?: number
      actualDuration?: number | null
      notes?: string | null
      name?: string
      duration?: number
      type?: string
      cognitiveComplexity?: number | null
    },
  ): Promise<unknown> {
    return this.client.workflow.updateStep.mutate({
      taskId,
      stepId,
      ...data,
    })
  }

  // ============================================================================
  // User Task Types
  // ============================================================================

  async getUserTaskTypes(): Promise<UserTaskType[]> {
    return this.client.userTaskType.getAll.query()
  }

  async getUserTaskTypeById(id: string): Promise<UserTaskType | null> {
    return this.client.userTaskType.getById.query({ id })
  }

  async createUserTaskType(input: Omit<CreateUserTaskTypeInput, 'sessionId'>): Promise<UserTaskType> {
    return this.client.userTaskType.create.mutate(input)
  }

  async updateUserTaskType(id: string, updates: UpdateUserTaskTypeInput): Promise<UserTaskType> {
    return this.client.userTaskType.update.mutate({ id, ...updates })
  }

  async deleteUserTaskType(id: string): Promise<void> {
    await this.client.userTaskType.delete.mutate({ id })
  }

  async reorderUserTaskTypes(orderedIds: string[]): Promise<void> {
    await this.client.userTaskType.reorder.mutate({ orderedIds })
  }

  async sessionHasTaskTypes(): Promise<boolean> {
    return this.client.userTaskType.hasTypes.query()
  }

  // ============================================================================
  // Time Sinks
  // ============================================================================

  async getTimeSinks(): Promise<TimeSink[]> {
    const sinks = await this.client.timeSink.getAll.query()
    return sinks.map((s) => nullToUndefined(s)) as TimeSink[]
  }

  async getTimeSinkById(id: string): Promise<TimeSink | null> {
    const sink = await this.client.timeSink.getById.query({ id })
    return sink ? (nullToUndefined(sink) as TimeSink) : null
  }

  async createTimeSink(input: Omit<CreateTimeSinkInput, 'sessionId'>): Promise<TimeSink> {
    const sink = await this.client.timeSink.create.mutate(input)
    return nullToUndefined(sink) as TimeSink
  }

  async updateTimeSink(id: string, updates: UpdateTimeSinkInput): Promise<TimeSink> {
    // Convert undefined typeId to null for tRPC
    const trpcUpdates = {
      ...updates,
      typeId: updates.typeId === undefined ? undefined : updates.typeId ?? undefined,
    }
    const sink = await this.client.timeSink.update.mutate({ id, ...trpcUpdates })
    return nullToUndefined(sink) as TimeSink
  }

  async deleteTimeSink(id: string): Promise<void> {
    await this.client.timeSink.delete.mutate({ id })
  }

  async reorderTimeSinks(orderedIds: string[]): Promise<void> {
    await this.client.timeSink.reorder.mutate({ orderedIds })
  }

  // Time sink sessions
  async createTimeSinkSession(data: {
    timeSinkId: string
    startTime: string
    endTime?: string
    actualMinutes?: number
    notes?: string
  }): Promise<TimeSinkSession> {
    const session = await this.client.timeSink.createSession.mutate({
      timeSinkId: data.timeSinkId,
      startTime: new Date(data.startTime),
      endTime: data.endTime ? new Date(data.endTime) : undefined,
      actualMinutes: data.actualMinutes,
      notes: data.notes,
    })
    return nullToUndefined(session) as TimeSinkSession
  }

  async endTimeSinkSession(id: string, actualMinutes: number, notes?: string): Promise<TimeSinkSession> {
    const session = await this.client.timeSink.endSession.mutate({ id, actualMinutes, notes })
    return nullToUndefined(session) as TimeSinkSession
  }

  async getTimeSinkSessions(timeSinkId: string): Promise<TimeSinkSession[]> {
    const sessions = await this.client.timeSink.getSessions.query({ timeSinkId })
    return sessions.map((s) => nullToUndefined(s)) as TimeSinkSession[]
  }

  async getTimeSinkSessionsByDate(date: string): Promise<TimeSinkSession[]> {
    const sessions = await this.client.timeSink.getSessionsByDate.query({ date })
    return sessions.map((s) => nullToUndefined(s)) as TimeSinkSession[]
  }

  async getActiveTimeSinkSession(): Promise<TimeSinkSession | null> {
    const session = await this.client.timeSink.getActiveSession.query()
    return session ? (nullToUndefined(session) as TimeSinkSession) : null
  }

  async deleteTimeSinkSession(id: string): Promise<void> {
    await this.client.timeSink.deleteSession.mutate({ id })
  }

  async splitTimeSinkSession(
    sessionId: string,
    splitTime: Date,
  ): Promise<{ firstHalf: TimeSinkSession; secondHalf: TimeSinkSession }> {
    const result = await this.client.timeSink.splitSession.mutate({
      sessionId,
      splitTime,
    })
    return {
      firstHalf: nullToUndefined(result.firstHalf) as TimeSinkSession,
      secondHalf: nullToUndefined(result.secondHalf) as TimeSinkSession,
    }
  }

  async getTimeSinkAccumulated(
    startDate: string,
    endDate: string,
  ): Promise<TimeSinkAccumulatedResult> {
    const result = await this.client.timeSink.getAccumulated.query({ startDate, endDate })
    // Transform array response to Record<sinkId, minutes> format expected by consumers
    const bySink: Record<string, number> = {}
    for (const item of result.bySink) {
      bySink[item.sink.id] = item.totalMinutes
    }
    return {
      bySink,
      total: result.totalMinutes,
    }
  }

  // ============================================================================
  // Work Patterns
  // ============================================================================

  async getWorkPatterns(): Promise<DailyWorkPattern[]> {
    const patterns = await this.client.workPattern.getAll.query()
    return patterns as unknown as DailyWorkPattern[]
  }

  async getWorkPattern(date: string): Promise<DailyWorkPattern | null> {
    const pattern = await this.client.workPattern.getByDate.query({ date })
    return pattern as unknown as DailyWorkPattern | null
  }

  async createWorkPattern(data: {
    date: string
    blocks?: WorkBlock[]
    meetings?: Meeting[]
    isTemplate?: boolean
    templateName?: string
    recurring?: boolean
  }): Promise<DailyWorkPattern> {
    const result = await this.client.workPattern.create.mutate(
      data as Parameters<typeof this.client.workPattern.create.mutate>[0],
    )
    return result as unknown as DailyWorkPattern
  }

  async updateWorkPattern(id: string, data: { blocks?: WorkBlock[]; meetings?: Meeting[] }): Promise<DailyWorkPattern> {
    const result = await this.client.workPattern.update.mutate({
      id,
      ...data,
    } as Parameters<typeof this.client.workPattern.update.mutate>[0])
    return result as unknown as DailyWorkPattern
  }

  async deleteWorkPattern(id: string): Promise<void> {
    await this.client.workPattern.delete.mutate({ id })
  }

  async getWorkTemplates(): Promise<DailyWorkPattern[]> {
    const templates = await this.client.workPattern.getTemplates.query()
    return templates as unknown as DailyWorkPattern[]
  }

  async saveAsTemplate(date: string, templateName: string): Promise<DailyWorkPattern> {
    // Get the pattern for the date, then create a template from it
    const pattern = await this.getWorkPattern(date)
    if (!pattern) {
      throw new Error(`No work pattern found for date ${date}`)
    }
    const result = await this.client.workPattern.create.mutate({
      date: `template_${Date.now()}`, // Templates use a unique date-like identifier
      blocks: pattern.blocks as Parameters<typeof this.client.workPattern.create.mutate>[0]['blocks'],
      meetings: pattern.meetings as Parameters<typeof this.client.workPattern.create.mutate>[0]['meetings'],
      isTemplate: true,
      templateName,
    })
    return result as unknown as DailyWorkPattern
  }

  // ============================================================================
  // Work Sessions
  // ============================================================================

  async getWorkSessions(date: string): Promise<UnifiedWorkSession[]> {
    const sessions = await this.client.workSession.getByDate.query({ date })
    return sessions.map((s) => fromDatabaseWorkSession(s))
  }

  async getActiveWorkSession(): Promise<UnifiedWorkSession | null> {
    const session = await this.client.workSession.getActive.query()
    return session ? fromDatabaseWorkSession(session) : null
  }

  async createWorkSession(data: {
    taskId: string
    stepId?: string
    startTime: Date  // Required - amendment handlers must normalize to Date before calling
    endTime?: Date
    plannedMinutes?: number
    actualMinutes?: number
    notes?: string
    description?: string
    type?: string
    blockId?: string
    patternId?: string
  }): Promise<UnifiedWorkSession> {
    const startTime = data.startTime instanceof Date ? data.startTime : new Date(data.startTime)

    const session = await this.client.workSession.create.mutate({
      taskId: data.taskId,
      stepId: data.stepId,
      startTime,
      endTime: data.endTime,
      // Zod schema requires integers - ensure values are rounded
      plannedMinutes: Math.round(data.plannedMinutes || 0),
      actualMinutes: data.actualMinutes !== undefined ? Math.round(data.actualMinutes) : undefined,
      notes: data.notes || data.description, // description is an alias for notes
      blockId: data.blockId,
      patternId: data.patternId,
    })
    return fromDatabaseWorkSession(session)
  }

  /**
   * Alias for createWorkSession with step - for compatibility with old API
   */
  async createStepWorkSession(data: {
    taskId: string
    stepId: string
    startTime: Date
    endTime?: Date
    plannedMinutes?: number
    actualMinutes?: number
    notes?: string
    type?: string
    blockId?: string
  }): Promise<UnifiedWorkSession> {
    return this.createWorkSession(data)
  }

  async updateWorkSession(id: string, data: unknown): Promise<UnifiedWorkSession> {
    const sanitized = data as Record<string, unknown>
    // Zod schema requires integers - ensure minute values are rounded
    if (typeof sanitized.plannedMinutes === 'number') {
      sanitized.plannedMinutes = Math.round(sanitized.plannedMinutes)
    }
    if (typeof sanitized.actualMinutes === 'number') {
      sanitized.actualMinutes = Math.round(sanitized.actualMinutes)
    }
    const session = await this.client.workSession.update.mutate({
      id,
      ...sanitized,
    } as Parameters<typeof this.client.workSession.update.mutate>[0])
    return fromDatabaseWorkSession(session)
  }

  async deleteWorkSession(id: string): Promise<void> {
    await this.client.workSession.delete.mutate({ id })
  }

  async splitWorkSession(
    sessionId: string,
    splitTime: Date,
    secondHalfTaskId?: string,
    secondHalfStepId?: string,
  ): Promise<{ firstHalf: UnifiedWorkSession; secondHalf: UnifiedWorkSession }> {
    const result = await this.client.workSession.split.mutate({
      sessionId,
      splitTime,
      secondHalfTaskId,
      secondHalfStepId,
    })
    return {
      firstHalf: fromDatabaseWorkSession(result.firstHalf),
      secondHalf: fromDatabaseWorkSession(result.secondHalf),
    }
  }

  async getWorkSessionsForTask(taskId: string): Promise<UnifiedWorkSession[]> {
    const sessions = await this.client.workSession.getByTask.query({ taskId })
    return sessions.map((s) => fromDatabaseWorkSession(s))
  }

  async getTaskTotalLoggedTime(taskId: string): Promise<number> {
    const result = await this.client.workSession.getTotalTimeForTask.query({ taskId })
    return result.totalMinutes
  }

  async getTodayAccumulated(date: string): Promise<AccumulatedTimeResult> {
    const result = await this.client.workSession.getAccumulatedByDate.query({ date })
    return {
      byType: result.byType,
      total: result.totalMinutes,
    }
  }

  // ============================================================================
  // Job Context
  // ============================================================================

  async getJobContexts(): Promise<unknown[]> {
    return this.client.jobContext.getAll.query()
  }

  async getActiveJobContext(): Promise<unknown | null> {
    return this.client.jobContext.getActive.query()
  }

  async createJobContext(data: unknown): Promise<unknown> {
    return this.client.jobContext.create.mutate(
      data as Parameters<typeof this.client.jobContext.create.mutate>[0],
    )
  }

  async updateJobContext(id: string, updates: unknown): Promise<unknown> {
    return this.client.jobContext.update.mutate({
      id,
      ...(updates as Record<string, unknown>),
    } as Parameters<typeof this.client.jobContext.update.mutate>[0])
  }

  async deleteJobContext(id: string): Promise<void> {
    await this.client.jobContext.delete.mutate({ id })
  }

  // ============================================================================
  // Jargon
  // ============================================================================

  async getJargonEntries(): Promise<unknown[]> {
    return this.client.jargon.getAll.query()
  }

  async createJargonEntry(data: { term: string; definition: string; category?: string }): Promise<unknown> {
    return this.client.jargon.create.mutate(data)
  }

  async updateJargonEntry(id: string, updates: unknown): Promise<unknown> {
    return this.client.jargon.update.mutate({
      id,
      ...(updates as Record<string, unknown>),
    } as Parameters<typeof this.client.jargon.update.mutate>[0])
  }

  async deleteJargonEntry(id: string): Promise<void> {
    await this.client.jargon.delete.mutate({ id })
  }

  async getJargonDictionary(): Promise<Record<string, string>> {
    return this.client.jargon.getDictionary.query()
  }

  // ============================================================================
  // Conversations
  // ============================================================================

  async getConversations(): Promise<unknown[]> {
    return this.client.conversation.getAll.query()
  }

  async getConversationById(id: string): Promise<unknown | null> {
    return this.client.conversation.getById.query({ id })
  }

  async createConversation(data: { title?: string; jobContextId?: string }): Promise<unknown> {
    return this.client.conversation.create.mutate(data)
  }

  async updateConversation(
    id: string,
    updates: { title?: string; jobContextId?: string | null; isArchived?: boolean },
  ): Promise<unknown> {
    // Build updates object without null values (tRPC schema uses undefined, not null)
    const trpcUpdates: { title?: string; jobContextId?: string; isArchived?: boolean } = {}
    if (updates.title !== undefined) trpcUpdates.title = updates.title
    if (updates.jobContextId !== undefined && updates.jobContextId !== null) {
      trpcUpdates.jobContextId = updates.jobContextId
    }
    if (updates.isArchived !== undefined) trpcUpdates.isArchived = updates.isArchived
    return this.client.conversation.update.mutate({ id, ...trpcUpdates })
  }

  async deleteConversation(id: string): Promise<void> {
    await this.client.conversation.delete.mutate({ id })
  }

  async getChatMessages(conversationId: string): Promise<unknown[]> {
    const messages = await this.client.conversation.getMessages.query({ conversationId })
    // Parse amendments JSON string to array (server stores as JSON string)
    return messages.map((msg) => ({
      ...msg,
      amendments: amendmentsFromJSON(msg.amendments as string),
    }))
  }

  async createChatMessage(data: {
    conversationId: string
    role: string
    content: string
    amendments?: unknown[]
  }): Promise<unknown> {
    // Convert string role to ChatMessageRole enum
    const roleMap: Record<string, ChatMessageRole> = {
      user: ChatMessageRole.User,
      assistant: ChatMessageRole.Assistant,
      system: ChatMessageRole.System,
    }
    const enumRole = roleMap[data.role] ?? ChatMessageRole.User

    const rawMessage = await this.client.conversation.createMessage.mutate({
      conversationId: data.conversationId,
      role: enumRole,
      content: data.content,
      amendments: amendmentsToJSON(data.amendments),
    })

    // Parse amendments JSON string to array (server stores as JSON string)
    return {
      ...rawMessage,
      amendments: amendmentsFromJSON(rawMessage.amendments as string),
    }
  }

  async deleteChatMessage(id: string): Promise<void> {
    await this.client.conversation.deleteMessage.mutate({ id })
  }

  async updateMessageAmendmentStatus(
    messageId: string,
    cardId: string,
    status: 'pending' | 'applied' | 'rejected' | 'modified',
  ): Promise<void> {
    await this.client.conversation.updateAmendmentStatus.mutate({
      messageId,
      cardId,
      status,
    })
  }

  // ============================================================================
  // Snapshots
  // ============================================================================

  async createScheduleSnapshot(data: ScheduleSnapshotData, label?: string): Promise<ScheduleSnapshot> {
    const record = await this.client.snapshot.create.mutate({
      snapshotData: serializeSnapshotData(data),
      label,
    })
    // Transform DB record to ScheduleSnapshot
    return {
      id: record.id,
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      label: record.label,
      data: deserializeSnapshotData(record.snapshotData),
    }
  }

  async getScheduleSnapshots(): Promise<ScheduleSnapshot[]> {
    const records = await this.client.snapshot.getAll.query()
    return records.map((record) => ({
      id: record.id,
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      label: record.label,
      data: deserializeSnapshotData(record.snapshotData),
    }))
  }

  async getScheduleSnapshotById(id: string): Promise<ScheduleSnapshot | null> {
    const record = await this.client.snapshot.getById.query({ id })
    if (!record) return null
    return {
      id: record.id,
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      label: record.label,
      data: deserializeSnapshotData(record.snapshotData),
    }
  }

  async getTodayScheduleSnapshot(): Promise<ScheduleSnapshot | null> {
    const record = await this.client.snapshot.getToday.query()
    if (!record) return null
    return {
      id: record.id,
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      label: record.label,
      data: deserializeSnapshotData(record.snapshotData),
    }
  }

  async deleteScheduleSnapshot(id: string): Promise<void> {
    await this.client.snapshot.delete.mutate({ id })
  }

  // ============================================================================
  // Development Helpers
  // ============================================================================

  /**
   * Delete all tasks in current session (dev helper)
   */
  async deleteAllTasks(): Promise<void> {
    const tasks = await this.getTasks(true) // Include archived
    for (const task of tasks) {
      await this.deleteTask(task.id)
    }
  }

  /**
   * Delete all sequenced tasks (workflows) in current session (dev helper)
   */
  async deleteAllSequencedTasks(): Promise<void> {
    const tasks = await this.getSequencedTasks()
    for (const task of tasks) {
      await this.deleteSequencedTask(task.id)
    }
  }

  /**
   * Delete all user data in current session (dev helper)
   * Warning: This is destructive and cannot be undone
   */
  async deleteAllUserData(): Promise<void> {
    // Delete in order to respect foreign key constraints
    await this.deleteAllTasks()
    // Additional cleanup could be added here
  }

  // ============================================================================
  // Log Viewer (Dev Mode)
  // ============================================================================

  /**
   * Get session logs for the log viewer (dev mode only)
   * Note: Logs are stored locally in Electron, this is a stub for web mode
   */
  async getSessionLogs(_options?: LogQueryOptions): Promise<LogEntry[]> {
    // In web mode, logs are not persisted the same way as Electron
    // Return empty array - log viewing is primarily an Electron feature
    console.warn('Log viewing is not fully supported in web mode')
    return []
  }

  /**
   * Get list of logged sessions (dev mode only)
   */
  async getLoggedSessions(): Promise<SessionLogSummary[]> {
    // Stub for web mode - log management is an Electron feature
    console.warn('Log session listing is not fully supported in web mode')
    return []
  }

  // ============================================================================
  // AI Operations (via tRPC - server owns the Claude API key)
  // ============================================================================

  async callAI(options: AICallOptions): Promise<{ content: string }> {
    return this.client.ai.callAI.mutate(options)
  }

  async extractTasksFromBrainstorm(brainstormText: string): Promise<{
    tasks: Array<{
      name: string
      description: string
      estimatedDuration: number
      importance: number
      urgency: number
      type: string
      deadline?: string
      deadlineType?: 'hard' | 'soft'
      cognitiveComplexity?: 1 | 2 | 3 | 4 | 5
      needsMoreInfo?: boolean
    }>
    summary: string
  }> {
    return this.client.ai.extractTasksFromBrainstorm.mutate({ brainstormText })
  }

  async extractWorkflowsFromBrainstorm(brainstormText: string, jobContext?: string): Promise<{
    workflows: Array<{
      name: string
      description: string
      importance: number
      urgency: number
      type: string
      steps: Array<{
        name: string
        duration: number
        type: string
        dependsOn: string[]
        asyncWaitTime: number
        conditionalBranches: unknown
      }>
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
    const result = await this.client.ai.extractWorkflowsFromBrainstorm.mutate({ brainstormText, jobContext })
    return result as unknown as Awaited<ReturnType<typeof this.extractWorkflowsFromBrainstorm>>
  }

  async generateWorkflowSteps(taskDescription: string, context?: {
    importance?: number
    urgency?: number
    additionalNotes?: string
  }): Promise<{
    workflowName: string
    steps: Array<{
      name: string
      duration: number
      type: string
      dependsOn: string[]
      asyncWaitTime: number
      conditionalBranches: unknown
    }>
    totalDuration: number
    notes: string
  }> {
    const result = await this.client.ai.generateWorkflowSteps.mutate({ taskDescription, context })
    return result as unknown as Awaited<ReturnType<typeof this.generateWorkflowSteps>>
  }

  async enhanceTaskDetails(taskName: string, currentDetails?: {
    description?: string
    duration?: number
    importance?: number
    urgency?: number
  }): Promise<{
    suggestions: {
      description?: string
      duration?: number
      importance?: number
      urgency?: number
      type?: string
      tips?: string[]
    }
    confidence: number
  }> {
    return this.client.ai.enhanceTaskDetails.mutate({ taskName, currentDetails })
  }

  async getContextualQuestions(taskName: string, taskDescription?: string): Promise<{
    questions: Array<{
      question: string
      type: 'text' | 'number' | 'choice'
      choices?: string[]
      purpose: string
    }>
  }> {
    return this.client.ai.getContextualQuestions.mutate({ taskName, taskDescription })
  }

  async getJobContextualQuestions(brainstormText: string, jobContext?: string): Promise<{
    questions: Array<{
      question: string
      type: 'text' | 'number' | 'choice'
      choices?: string[]
      purpose: string
      priority: 'high' | 'medium' | 'low'
    }>
    suggestedJobContext?: string
  }> {
    return this.client.ai.getJobContextualQuestions.mutate({ brainstormText, jobContext })
  }

  async extractScheduleFromVoice(voiceText: string, targetDate: string): Promise<{
    date: string
    blocks: Array<{
      id: string
      startTime: string
      endTime: string
      type: string
      capacity?: {
        totalMinutes: number
        type: string
        splitRatio?: {
          focus: number
          admin: number
        }
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
    return this.client.ai.extractScheduleFromVoice.mutate({ voiceText, targetDate })
  }

  async extractMultiDayScheduleFromVoice(voiceText: string, startDate: string): Promise<Array<{
    date: string
    blocks: Array<{
      id: string
      startTime: string
      endTime: string
      type: string
      capacity?: {
        totalMinutes: number
        type: string
        splitRatio?: {
          focus: number
          admin: number
        }
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
  }>> {
    return this.client.ai.extractMultiDayScheduleFromVoice.mutate({ voiceText, startDate })
  }

  async extractJargonTerms(contextText: string): Promise<string> {
    return this.client.ai.extractJargonTerms.mutate({ contextText })
  }

  // ============================================================================
  // Endeavor Operations
  // ============================================================================

  async getEndeavors(options?: {
    status?: EndeavorStatus
    includeArchived?: boolean
  }): Promise<EndeavorWithTasks[]> {
    const endeavors = await this.client.endeavor.getAll.query(options)
    return endeavors.map((e: any) => ({
      ...nullToUndefined(e),
      items: e.items.map((item: any) => ({
        ...item,
        task: {
          ...nullToUndefined(item.task),
          steps: item.task.steps?.map((s: any) => nullToUndefined(s)),
        },
      })),
    })) as EndeavorWithTasks[]
  }

  async getEndeavorById(id: string): Promise<EndeavorWithTasks | null> {
    const endeavor = await this.client.endeavor.getById.query({ id })
    if (!endeavor) return null
    return {
      ...nullToUndefined(endeavor),
      items: endeavor.items.map((item: any) => ({
        ...item,
        task: {
          ...nullToUndefined(item.task),
          steps: item.task.steps?.map((s: any) => nullToUndefined(s)),
        },
      })),
    } as EndeavorWithTasks
  }

  async createEndeavor(data: {
    name: string
    description?: string
    notes?: string
    importance?: number
    urgency?: number
    deadline?: Date
    deadlineType?: DeadlineType
    color?: string
  }): Promise<Endeavor> {
    const endeavor = await this.client.endeavor.create.mutate(data)
    return nullToUndefined(endeavor) as Endeavor
  }

  async updateEndeavor(
    id: string,
    data: {
      name?: string
      description?: string | null
      notes?: string | null
      status?: EndeavorStatus
      importance?: number
      urgency?: number
      deadline?: Date | null
      deadlineType?: DeadlineType | null
      color?: string | null
    },
  ): Promise<Endeavor> {
    const endeavor = await this.client.endeavor.update.mutate({ id, ...data })
    return nullToUndefined(endeavor) as Endeavor
  }

  async deleteEndeavor(id: string): Promise<void> {
    await this.client.endeavor.delete.mutate({ id })
  }

  async addEndeavorItem(endeavorId: string, taskId: string, sortOrder?: number): Promise<void> {
    await this.client.endeavor.addItem.mutate({ endeavorId, taskId, sortOrder })
  }

  async removeEndeavorItem(endeavorId: string, taskId: string): Promise<void> {
    await this.client.endeavor.removeItem.mutate({ endeavorId, taskId })
  }

  async reorderEndeavorItems(endeavorId: string, orderedTaskIds: string[]): Promise<void> {
    await this.client.endeavor.reorderItems.mutate({ endeavorId, orderedTaskIds })
  }

  async getEndeavorProgress(id: string): Promise<EndeavorProgress | null> {
    return this.client.endeavor.getProgress.query({ id })
  }

  async getCrossEndeavorDependencies(endeavorId: string): Promise<{
    dependencies: Array<{
      taskId: string
      taskName: string
      dependencies: Array<{
        dependencyId: string
        dependencyName: string
        endeavorId: string
        endeavorName: string
        isCompleted: boolean
      }>
    }>
    blockingEndeavors: Array<{
      endeavorId: string
      endeavorName: string
      blockingTaskCount: number
    }>
  }> {
    return this.client.endeavor.getCrossEndeavorDependencies.query({ endeavorId })
  }

  // ============================================================================
  // Endeavor Dependencies (Cross-Workflow Step Dependencies)
  // ============================================================================

  async addEndeavorDependency(data: {
    endeavorId: string
    blockedTaskId?: string
    blockedStepId?: string
    blockingStepId: string
    isHardBlock?: boolean
    notes?: string
  }): Promise<unknown> {
    return this.client.endeavor.addDependency.mutate(data)
  }

  async removeEndeavorDependency(id: string): Promise<void> {
    await this.client.endeavor.removeDependency.mutate({ id })
  }

  async getEndeavorDependencies(endeavorId: string): Promise<Array<{
    id: string
    endeavorId: string
    blockedTaskId: string | null
    blockedStepId: string | null
    blockingStepId: string
    blockingTaskId: string
    isHardBlock: boolean
    notes: string | null
    createdAt: Date
    blockedTaskName?: string
    blockedStepName?: string
    blockingStepName: string
    blockingTaskName: string
    blockingStepStatus: string
    blockingEndeavorId?: string
    blockingEndeavorName?: string
  }>> {
    return this.client.endeavor.getDependencies.query({ endeavorId })
  }

  async getBlockersFor(options: {
    taskId?: string
    stepId?: string
  }): Promise<Array<{
    id: string
    endeavorId: string
    endeavorName?: string
    blockedTaskId: string | null
    blockedStepId: string | null
    blockingStepId: string
    blockingTaskId: string
    blockingStepName: string
    blockingTaskName: string
    blockingStepStatus: string
    blockingEndeavorId?: string
    blockingEndeavorName?: string
    isHardBlock: boolean
    notes: string | null
  }>> {
    return this.client.endeavor.getBlockersFor.query(options)
  }

  async updateEndeavorDependency(
    id: string,
    updates: { isHardBlock?: boolean; notes?: string | null },
  ): Promise<unknown> {
    return this.client.endeavor.updateDependency.mutate({ id, ...updates })
  }

  // ============================================================================
  // Deep Work Board Operations
  // ============================================================================

  async getDeepWorkBoards(): Promise<DeepWorkBoard[]> {
    const boards = await this.client.deepWorkBoard.getAll.query()
    return boards
  }

  async getDeepWorkBoardById(id: string): Promise<{ board: DeepWorkBoard; nodes: DeepWorkNodeWithData[] } | null> {
    return this.client.deepWorkBoard.getById.query({ id })
  }

  async createDeepWorkBoard(data: CreateDeepWorkBoardInput): Promise<DeepWorkBoard> {
    return this.client.deepWorkBoard.create.mutate(data)
  }

  async updateDeepWorkBoard(data: UpdateDeepWorkBoardInput): Promise<DeepWorkBoard> {
    return this.client.deepWorkBoard.update.mutate(data)
  }

  async deleteDeepWorkBoard(id: string): Promise<{ success: boolean }> {
    return this.client.deepWorkBoard.delete.mutate({ id })
  }

  async createDeepWorkTaskAndNode(data: CreateTaskAndNodeInput): Promise<DeepWorkNodeWithData> {
    return this.client.deepWorkBoard.createTaskAndNode.mutate(data)
  }

  async addDeepWorkNode(data: AddExistingNodeInput): Promise<DeepWorkNodeWithData> {
    return this.client.deepWorkBoard.addNode.mutate(data)
  }

  async updateDeepWorkNodePosition(data: UpdateNodePositionInput): Promise<void> {
    await this.client.deepWorkBoard.updateNodePosition.mutate(data)
  }

  async updateDeepWorkNodePositions(data: BatchUpdateNodePositionsInput): Promise<{ count: number }> {
    return this.client.deepWorkBoard.updateNodePositions.mutate(data)
  }

  async removeDeepWorkNode(nodeId: string): Promise<{ success: boolean }> {
    return this.client.deepWorkBoard.removeNode.mutate({ nodeId })
  }

  async saveDeepWorkViewport(data: SaveViewportInput): Promise<{ success: boolean }> {
    return this.client.deepWorkBoard.saveViewport.mutate(data)
  }

  async importDeepWorkFromSprint(data: ImportFromSprintInput): Promise<DeepWorkNodeWithData[]> {
    return this.client.deepWorkBoard.importFromSprint.mutate(data)
  }

  async createDeepWorkEdge(data: CreateEdgeInput): Promise<{ nodes: DeepWorkNodeWithData[] }> {
    return this.client.deepWorkBoard.createEdge.mutate(data)
  }

  async removeDeepWorkEdge(data: RemoveEdgeInput): Promise<{ nodes: DeepWorkNodeWithData[] }> {
    return this.client.deepWorkBoard.removeEdge.mutate(data)
  }

  // ============================================================================
  // Speech Operations (via tRPC since server has the OpenAI API key)
  // ============================================================================

  async transcribeAudioBuffer(
    audioBuffer: Buffer,
    filename: string,
    options?: { language?: string; prompt?: string },
  ): Promise<{ text: string; savedPath: string }> {
    // Convert to base64 for JSON transport (tRPC uses JSON)
    // Note: audioBuffer is actually a Uint8Array cast as Buffer from the browser,
    // so we use our helper that handles both Node Buffer and browser Uint8Array
    const audioBase64 = uint8ArrayToBase64(audioBuffer)

    return this.client.speech.transcribeBuffer.mutate({
      audioBase64,
      filename,
      options,
    })
  }
}

/**
 * Get the tRPC database service instance
 */
export function getTrpcDatabase(): TrpcDatabaseService {
  return TrpcDatabaseService.getInstance()
}
