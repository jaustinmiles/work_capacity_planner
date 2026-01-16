/**
 * tRPC-based Database Service for Renderer
 *
 * This service uses tRPC to communicate with the API server instead of IPC.
 * It maintains the same interface as RendererDatabaseService for compatibility.
 *
 * Used when the app is running in 'server' or 'client' mode.
 */

import { createDynamicClient, type ApiClient } from '@shared/trpc-client'
import type { Task, Session, AICallOptions } from '@shared/types'
import type { SequencedTask } from '@shared/sequencing-types'
import { ChatMessageRole } from '@shared/enums'
import type { UserTaskType, CreateUserTaskTypeInput, UpdateUserTaskTypeInput } from '@shared/user-task-types'
import type { TimeSink, TimeSinkSession, CreateTimeSinkInput, UpdateTimeSinkInput } from '@shared/time-sink-types'
import type { ScheduleSnapshot, ScheduleSnapshotData } from '@shared/schedule-snapshot-types'
import { serializeSnapshotData, deserializeSnapshotData } from '@shared/schedule-snapshot-types'

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
    const task = await this.client.task.update.mutate({ id, ...updates })
    return task as SequencedTask
  }

  async deleteSequencedTask(id: string): Promise<void> {
    await this.client.task.delete.mutate({ id })
  }

  async getStepWorkSessions(stepId: string): Promise<unknown[]> {
    return this.client.workflow.getStepWorkSessions.query({ stepId })
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
  async createTimeSinkSession(data: { timeSinkId: string; startTime: string }): Promise<TimeSinkSession> {
    const session = await this.client.timeSink.createSession.mutate({
      timeSinkId: data.timeSinkId,
      startTime: new Date(data.startTime),
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

  async getTimeSinkAccumulated(
    startDate: string,
    endDate: string,
  ): Promise<{ bySink: Record<string, number>; total: number }> {
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

  async getWorkPatterns(): Promise<unknown[]> {
    return this.client.workPattern.getAll.query()
  }

  async getWorkPattern(date: string): Promise<unknown | null> {
    return this.client.workPattern.getByDate.query({ date })
  }

  async createWorkPattern(data: {
    date: string
    blocks?: unknown[]
    meetings?: unknown[]
    isTemplate?: boolean
    templateName?: string
  }): Promise<unknown> {
    return this.client.workPattern.create.mutate(
      data as Parameters<typeof this.client.workPattern.create.mutate>[0],
    )
  }

  async updateWorkPattern(id: string, data: { blocks?: unknown[]; meetings?: unknown[] }): Promise<unknown> {
    return this.client.workPattern.update.mutate({
      id,
      ...data,
    } as Parameters<typeof this.client.workPattern.update.mutate>[0])
  }

  async deleteWorkPattern(id: string): Promise<void> {
    await this.client.workPattern.delete.mutate({ id })
  }

  async getWorkTemplates(): Promise<unknown[]> {
    return this.client.workPattern.getTemplates.query()
  }

  // ============================================================================
  // Work Sessions
  // ============================================================================

  async getWorkSessions(date: string): Promise<unknown[]> {
    return this.client.workSession.getByDate.query({ date })
  }

  async getActiveWorkSession(): Promise<unknown | null> {
    return this.client.workSession.getActive.query()
  }

  async createWorkSession(data: {
    taskId: string
    stepId?: string
    startTime?: Date
    date?: Date | string  // Alternative to startTime - used by amendment handlers
    endTime?: Date
    plannedMinutes?: number
    actualMinutes?: number
    notes?: string
    description?: string
    type?: string
    blockId?: string
    patternId?: string
  }): Promise<unknown> {
    // Normalize startTime - accept either startTime or date property
    let startTime: Date
    if (data.startTime) {
      startTime = data.startTime instanceof Date ? data.startTime : new Date(data.startTime)
    } else if (data.date) {
      if (data.date instanceof Date) {
        startTime = data.date
      } else {
        // Parse date string to LOCAL time (not UTC)
        // "2024-01-16" should create midnight local time, not UTC
        // Use T00:00:00 suffix to get local timezone interpretation
        const dateStr = data.date as string
        const today = new Date()
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

        if (dateStr === todayStr) {
          // If logging for today, use current time
          startTime = new Date()
        } else {
          // For past/future dates, use noon to avoid timezone edge cases
          startTime = new Date(dateStr + 'T12:00:00')
        }
      }
    } else {
      // Default to current time if neither is provided
      startTime = new Date()
    }

    return this.client.workSession.create.mutate({
      taskId: data.taskId,
      stepId: data.stepId,
      startTime,
      endTime: data.endTime,
      plannedMinutes: data.plannedMinutes || 0,
      actualMinutes: data.actualMinutes,
      notes: data.notes || data.description, // description is an alias for notes
      blockId: data.blockId,
      patternId: data.patternId,
    })
  }

  async updateWorkSession(id: string, data: unknown): Promise<unknown> {
    return this.client.workSession.update.mutate({
      id,
      ...(data as Record<string, unknown>),
    } as Parameters<typeof this.client.workSession.update.mutate>[0])
  }

  async deleteWorkSession(id: string): Promise<void> {
    await this.client.workSession.delete.mutate({ id })
  }

  async getWorkSessionsForTask(taskId: string): Promise<unknown[]> {
    return this.client.workSession.getByTask.query({ taskId })
  }

  async getTaskTotalLoggedTime(taskId: string): Promise<number> {
    const result = await this.client.workSession.getTotalTimeForTask.query({ taskId })
    return result.totalMinutes
  }

  async getTodayAccumulated(
    date: string,
  ): Promise<{ byType: Record<string, number>; totalMinutes: number }> {
    return this.client.workSession.getAccumulatedByDate.query({ date })
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
      amendments: msg.amendments ? JSON.parse(msg.amendments as string) : null,
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

    return this.client.conversation.createMessage.mutate({
      conversationId: data.conversationId,
      role: enumRole,
      content: data.content,
      amendments: data.amendments ? JSON.stringify(data.amendments) : undefined,
    })
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
  // AI Operations (still use IPC since API key is local to the Electron app)
  // ============================================================================

  async callAI(options: AICallOptions): Promise<{ content: string }> {
    // AI calls still go through IPC because:
    // 1. The API key is stored locally on the Electron app
    // 2. AI calls don't need to be shared across clients
    // 3. Keeping AI local avoids exposing keys on the network
    return await window.electronAPI.ai.callAI(options)
  }
}

/**
 * Get the tRPC database service instance
 */
export function getTrpcDatabase(): TrpcDatabaseService {
  return TrpcDatabaseService.getInstance()
}
