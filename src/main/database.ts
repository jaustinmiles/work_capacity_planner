import { PrismaClient } from '@prisma/client'
import { Task, TaskStep } from '../shared/types'
import {
  UserTaskType,
  CreateUserTaskTypeInput,
  UpdateUserTaskTypeInput,
  createUserTaskType as createUserTaskTypeEntity,
  userTaskTypeToRecord,
  recordToUserTaskType,
  BlockTypeConfig,
  AccumulatedTimeResult,
} from '../shared/user-task-types'
import {
  TimeSink,
  TimeSinkSession,
  CreateTimeSinkInput,
  UpdateTimeSinkInput,
  CreateTimeSinkSessionInput,
  TimeSinkAccumulatedResult,
  createTimeSink as createTimeSinkEntity,
  timeSinkToRecord,
  recordToTimeSink,
  createTimeSinkSession as createTimeSinkSessionEntity,
  timeSinkSessionToRecord,
  recordToTimeSinkSession,
} from '../shared/time-sink-types'
import { WorkBlockType, BlockConfigKind } from '../shared/enums'
import { LogQueryOptionsInternal, LogEntryInternal, SessionLogSummary } from '../shared/log-types'
import { calculateBlockCapacity } from '../shared/capacity-calculator'
import { generateRandomStepId, generateUniqueId } from '../shared/step-id-utils'
import { getCurrentTime, getLocalDateString } from '../shared/time-provider'
import { timeStringToMinutes } from '../shared/time-utils'
import * as crypto from 'crypto'
import { LogScope } from '../logger'
import { getScopedLogger } from '../logger/scope-helper'
import { logged, loggedVerbose } from '../logger/decorators'

// Create Prisma client instance
const prisma = new PrismaClient()

// Get scoped logger for database operations
const dbLogger = getScopedLogger(LogScope.Database)

/**
 * Database WorkBlock fields used for logging.
 */
interface WorkBlockLogData {
  startTime: string
  endTime: string
  typeConfig: string
}

// Default typeConfig for system blocks
const DEFAULT_TYPE_CONFIG: BlockTypeConfig = { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked }

/**
 * Parse typeConfig from database JSON string.
 * Falls back to system blocked if parsing fails.
 */
function parseTypeConfig(typeConfigJson: string | null): BlockTypeConfig {
  if (!typeConfigJson) return DEFAULT_TYPE_CONFIG
  try {
    return JSON.parse(typeConfigJson) as BlockTypeConfig
  } catch {
    return DEFAULT_TYPE_CONFIG
  }
}

/**
 * Map a database WorkBlock to include parsed typeConfig and calculated capacity.
 */
function mapDatabaseBlock(dbBlock: {
  id: string
  startTime: string
  endTime: string
  typeConfig: string
  totalCapacity: number
  type?: string | null
  splitRatio?: unknown
  patternId: string
}) {
  const typeConfig = parseTypeConfig(dbBlock.typeConfig)
  const capacity = calculateBlockCapacity(typeConfig, dbBlock.startTime, dbBlock.endTime)

  return {
    id: dbBlock.id,
    startTime: dbBlock.startTime,
    endTime: dbBlock.endTime,
    typeConfig,
    capacity,
    totalCapacity: capacity.totalMinutes,
    patternId: dbBlock.patternId,
  }
}

// Database service for managing tasks (including workflows)
export class DatabaseService {
  private static instance: DatabaseService
  private client: PrismaClient

  private constructor() {
    this.client = prisma
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  // Utility function to parse date string and create local date range
  private getLocalDateRange(dateString: string): { startOfDay: Date; endOfDay: Date } {
    const [year, month, day] = dateString.split('-').map(Number)

    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

    return { startOfDay, endOfDay }
  }

  // Session management
  private activeSessionId: string | null = null
  private sessionInitPromise: Promise<string> | null = null

  @logged({ scope: LogScope.Database })
  async getActiveSession(): Promise<string> {
    // If already cached, return it
    if (this.activeSessionId) {
      return this.activeSessionId
    }

    // If initialization is in progress, wait for it
    if (this.sessionInitPromise) {
      return this.sessionInitPromise
    }

    // Start initialization and cache the promise to prevent race conditions
    this.sessionInitPromise = this.initializeActiveSession()

    try {
      this.activeSessionId = await this.sessionInitPromise
      dbLogger.info('Initialized new sessionId', { sessionId: this.activeSessionId })
      return this.activeSessionId
    } finally {
      this.sessionInitPromise = null
    }
  }

  private async initializeActiveSession(): Promise<string> {
    dbLogger.info('Initializing active session')

    // Find the active session or create one if none exists
    let session = await this.client.session.findFirst({
      where: { isActive: true },
    })

    if (session) {
      dbLogger.info('Found existing active session', {
        sessionId: session.id,
        name: session.name,
        createdAt: session.createdAt?.toISOString() || getCurrentTime().toISOString(),
      })
    } else {
      dbLogger.warn('No active session found, checking for existing sessions to reactivate')

      // Check again for any existing session to reuse before creating a new one
      const existingSession = await this.client.session.findFirst({
        orderBy: { createdAt: 'desc' },
      })

      if (existingSession) {
        dbLogger.info('Reactivating existing session', {
          sessionId: existingSession.id,
          name: existingSession.name,
          wasCreated: existingSession.createdAt.toISOString(),
        })

        // Reactivate the most recent session instead of creating a duplicate
        session = await this.client.session.update({
          where: { id: existingSession.id },
          data: { isActive: true },
        })
      } else {
        dbLogger.warn('No sessions found in database, creating new session')

        // Create a new session with a date-based name
        const today = getCurrentTime()
        const dayName = today.toLocaleDateString('en-US', { weekday: 'short' })
        const monthDay = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const sessionName = `${dayName} ${monthDay}`

        // Create a default session only if truly none exists
        session = await this.client.session.create({
          data: {
            id: crypto.randomUUID(),
            name: sessionName,
            description: 'Initial work session',
            isActive: true,
          },
        })

        dbLogger.info('Created new session', {
          sessionId: session.id,
          name: session.name,
        })
      }
    }

    return session.id
  }

  async getSessions(): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }[]> {
    const sessions = await this.client.session.findMany({
      orderBy: { updatedAt: 'desc' },
    })

    dbLogger.debug('Found sessions', {
      count: sessions.length,
      sessions: sessions.map(s => ({ id: s.id, name: s.name, isActive: s.isActive })),
    })

    // Log if we detect duplicates but don't filter them - let the UI show the actual state
    const uniqueIds = new Set(sessions.map(s => s.id))
    if (uniqueIds.size !== sessions.length) {
      dbLogger.error('WARNING: Duplicate session IDs detected in database!', {
        totalSessions: sessions.length,
        uniqueIds: uniqueIds.size,
        duplicates: sessions.length - uniqueIds.size,
      })
    }

    return sessions
  }

  async createSession(name: string, description?: string): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }> {
    // Deactivate all other sessions
    await this.client.session.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Create and activate new session
    const session = await this.client.session.create({
      data: {
        id: crypto.randomUUID(),
        name,
        description: description ?? null,
        isActive: true,
      },
    })

    this.activeSessionId = session.id
    return session
  }

  async switchSession(sessionId: string): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }> {
    dbLogger.info('Switching session', {
      newSessionId: sessionId,
      previousSessionId: this.activeSessionId,
    })

    // Clear the cached session ID to force re-fetch
    this.activeSessionId = null

    // Deactivate all sessions
    await this.client.session.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Activate the selected session
    const session = await this.client.session.update({
      where: { id: sessionId },
      data: { isActive: true },
    })

    this.activeSessionId = session.id
    dbLogger.info('Session switched successfully', { sessionId: session.id })
    return session
  }

  async updateSession(id: string, updates: { name?: string; description?: string }): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }> {
    const updateData: any = {
      updatedAt: getCurrentTime(),
    }
    if (updates.name !== undefined) {
      updateData.name = updates.name
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description
    }
    return await this.client.session.update({
      where: { id },
      data: updateData,
    })
  }

  async deleteSession(id: string): Promise<void> {
    dbLogger.info('Attempting to delete session', { sessionId: id })

    const session = await this.client.session.findUnique({
      where: { id },
    })

    if (!session) {
      dbLogger.warn('Session not found for deletion', { sessionId: id })
      throw new Error(`Session ${id} not found`)
    }

    if (session?.isActive) {
      dbLogger.warn('Cannot delete active session', { sessionId: id })
      throw new Error('Cannot delete the active session')
    }

    // Delete all related records first to avoid foreign key constraints
    // Use transaction to ensure atomicity
    await this.client.$transaction(async (tx) => {
      // Delete WorkPatterns and their related WorkBlocks/WorkMeetings (cascade handled by schema)
      await tx.workPattern.deleteMany({
        where: { sessionId: id },
      })

      // Delete Tasks and their WorkSessions/TaskSteps (cascade handled by schema)
      await tx.task.deleteMany({
        where: { sessionId: id },
      })

      // Delete SequencedTasks
      await tx.sequencedTask.deleteMany({
        where: { sessionId: id },
      })

      // Delete other related records
      await tx.timeEstimateAccuracy.deleteMany({
        where: { sessionId: id },
      })

      await tx.productivityPattern.deleteMany({
        where: { sessionId: id },
      })

      await tx.jobContext.deleteMany({
        where: { sessionId: id },
      })

      await tx.jargonEntry.deleteMany({
        where: { sessionId: id },
      })

      // Delete SchedulingPreferences if exists
      await tx.schedulingPreferences.deleteMany({
        where: { sessionId: id },
      })

      // Finally delete the session itself
      await tx.session.delete({
        where: { id },
      })
    })

    dbLogger.info('Session and all related data deleted successfully', { sessionId: id })
  }

  async getCurrentSession(): Promise<any> {
    const session = await this.client.session.findFirst({
      where: { isActive: true },
      include: { SchedulingPreferences: true },
    })
    return session
  }

  async updateSchedulingPreferences(sessionId: string, updates: any): Promise<any> {
    // Check if preferences exist
    const existing = await this.client.schedulingPreferences.findUnique({
      where: { sessionId },
    })

    if (existing) {
      // Update existing preferences
      return await this.client.schedulingPreferences.update({
        where: { sessionId },
        data: updates,
      })
    } else {
      // Create new preferences
      return await this.client.schedulingPreferences.create({
        data: {
          id: `pref-${Date.now()}`,
          sessionId,
          ...updates,
        },
      })
    }
  }

  // ============================================================================
  // User Task Types - Session-scoped configurable task types
  // ============================================================================

  /**
   * Get all user task types for a session.
   */
  async getUserTaskTypes(sessionId?: string): Promise<UserTaskType[]> {
    const activeSessionId = sessionId || (await this.getActiveSession())

    const records = await this.client.userTaskType.findMany({
      where: { sessionId: activeSessionId },
      orderBy: { sortOrder: 'asc' },
    })

    return records.map((record) =>
      recordToUserTaskType({
        ...record,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      }),
    )
  }

  /**
   * Get a single user task type by ID.
   */
  async getUserTaskTypeById(id: string): Promise<UserTaskType | null> {
    const record = await this.client.userTaskType.findUnique({
      where: { id },
    })

    if (!record) return null

    return recordToUserTaskType({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    })
  }

  /**
   * Create a new user task type.
   */
  async createUserTaskType(input: CreateUserTaskTypeInput): Promise<UserTaskType> {
    // Get the next sort order
    const existingTypes = await this.client.userTaskType.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { sortOrder: 'desc' },
      take: 1,
    })

    const nextSortOrder = existingTypes.length > 0 ? existingTypes[0].sortOrder + 1 : 0

    // Create the entity with generated ID and timestamps
    const entity = createUserTaskTypeEntity({
      ...input,
      sortOrder: input.sortOrder ?? nextSortOrder,
    })

    // Convert to record format for database
    const record = userTaskTypeToRecord(entity)

    // Create in database
    const created = await this.client.userTaskType.create({
      data: {
        id: record.id,
        sessionId: record.sessionId,
        name: record.name,
        emoji: record.emoji,
        color: record.color,
        sortOrder: record.sortOrder,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    })

    dbLogger.info('Created user task type', {
      id: created.id,
      name: created.name,
      sessionId: created.sessionId,
    })

    return recordToUserTaskType({
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    })
  }

  /**
   * Update an existing user task type.
   */
  async updateUserTaskType(id: string, updates: UpdateUserTaskTypeInput): Promise<UserTaskType> {
    const updated = await this.client.userTaskType.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: getCurrentTime(),
      },
    })

    dbLogger.info('Updated user task type', {
      id: updated.id,
      name: updated.name,
      updates,
    })

    return recordToUserTaskType({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  }

  /**
   * Delete a user task type.
   * WARNING: This does not check if the type is in use by tasks or blocks.
   */
  async deleteUserTaskType(id: string): Promise<void> {
    await this.client.userTaskType.delete({
      where: { id },
    })

    dbLogger.info('Deleted user task type', { id })
  }

  /**
   * Reorder user task types by providing an ordered array of IDs.
   */
  async reorderUserTaskTypes(sessionId: string, orderedIds: string[]): Promise<void> {
    // Update each type's sortOrder based on position in array
    await this.client.$transaction(
      orderedIds.map((id, index) =>
        this.client.userTaskType.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    )

    dbLogger.info('Reordered user task types', {
      sessionId,
      count: orderedIds.length,
    })
  }

  /**
   * Check if a session has any user task types defined.
   */
  async sessionHasTaskTypes(sessionId?: string): Promise<boolean> {
    const activeSessionId = sessionId || (await this.getActiveSession())

    const count = await this.client.userTaskType.count({
      where: { sessionId: activeSessionId },
    })

    return count > 0
  }

  // ============================================================================
  // Time Sinks - Session-scoped time tracking for non-task activities
  // ============================================================================

  /**
   * Get all time sinks for a session.
   */
  async getTimeSinks(sessionId?: string): Promise<TimeSink[]> {
    const activeSessionId = sessionId || (await this.getActiveSession())

    const records = await this.client.timeSink.findMany({
      where: { sessionId: activeSessionId },
      orderBy: { sortOrder: 'asc' },
    })

    return records.map((record) =>
      recordToTimeSink({
        ...record,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      }),
    )
  }

  /**
   * Get a single time sink by ID.
   */
  async getTimeSinkById(id: string): Promise<TimeSink | null> {
    const record = await this.client.timeSink.findUnique({
      where: { id },
    })

    if (!record) return null

    return recordToTimeSink({
      ...record,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    })
  }

  /**
   * Create a new time sink.
   */
  async createTimeSink(input: CreateTimeSinkInput): Promise<TimeSink> {
    // Get the next sort order
    const existingSinks = await this.client.timeSink.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { sortOrder: 'desc' },
      take: 1,
    })

    const nextSortOrder = existingSinks.length > 0 ? existingSinks[0].sortOrder + 1 : 0

    // Create the entity with generated ID and timestamps
    const entity = createTimeSinkEntity({
      ...input,
      sortOrder: input.sortOrder ?? nextSortOrder,
    })

    // Convert to record format for database
    const record = timeSinkToRecord(entity)

    // Create in database
    const created = await this.client.timeSink.create({
      data: {
        id: record.id,
        sessionId: record.sessionId,
        name: record.name,
        emoji: record.emoji,
        color: record.color,
        typeId: record.typeId,
        sortOrder: record.sortOrder,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      },
    })

    dbLogger.info('Created time sink', {
      id: created.id,
      name: created.name,
      sessionId: created.sessionId,
    })

    return recordToTimeSink({
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    })
  }

  /**
   * Update an existing time sink.
   */
  async updateTimeSink(id: string, updates: UpdateTimeSinkInput): Promise<TimeSink> {
    const updated = await this.client.timeSink.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: getCurrentTime(),
      },
    })

    dbLogger.info('Updated time sink', {
      id: updated.id,
      name: updated.name,
      updates,
    })

    return recordToTimeSink({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  }

  /**
   * Delete a time sink and all its sessions.
   */
  async deleteTimeSink(id: string): Promise<void> {
    await this.client.timeSink.delete({
      where: { id },
    })

    dbLogger.info('Deleted time sink', { id })
  }

  /**
   * Reorder time sinks by providing an ordered array of IDs.
   */
  async reorderTimeSinks(sessionId: string, orderedIds: string[]): Promise<void> {
    await this.client.$transaction(
      orderedIds.map((id, index) =>
        this.client.timeSink.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    )

    dbLogger.info('Reordered time sinks', {
      sessionId,
      count: orderedIds.length,
    })
  }

  // ============================================================================
  // Time Sink Sessions - Individual time entries for time sinks
  // ============================================================================

  /**
   * Create a new time sink session.
   */
  async createTimeSinkSession(input: CreateTimeSinkSessionInput): Promise<TimeSinkSession> {
    const entity = createTimeSinkSessionEntity(input)
    const record = timeSinkSessionToRecord(entity)

    const created = await this.client.timeSinkSession.create({
      data: {
        id: record.id,
        timeSinkId: record.timeSinkId,
        startTime: new Date(record.startTime),
        endTime: record.endTime ? new Date(record.endTime) : null,
        actualMinutes: record.actualMinutes,
        notes: record.notes,
        createdAt: new Date(record.createdAt),
      },
    })

    dbLogger.info('Created time sink session', {
      id: created.id,
      timeSinkId: created.timeSinkId,
    })

    return recordToTimeSinkSession({
      ...created,
      startTime: created.startTime.toISOString(),
      endTime: created.endTime?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
    })
  }

  /**
   * End an active time sink session.
   */
  async endTimeSinkSession(id: string, actualMinutes: number, notes?: string): Promise<TimeSinkSession> {
    const updated = await this.client.timeSinkSession.update({
      where: { id },
      data: {
        endTime: getCurrentTime(),
        actualMinutes,
        notes: notes ?? undefined,
      },
    })

    dbLogger.info('Ended time sink session', {
      id: updated.id,
      actualMinutes,
    })

    return recordToTimeSinkSession({
      ...updated,
      startTime: updated.startTime.toISOString(),
      endTime: updated.endTime?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    })
  }

  /**
   * Get all sessions for a specific time sink.
   */
  async getTimeSinkSessions(timeSinkId: string): Promise<TimeSinkSession[]> {
    const records = await this.client.timeSinkSession.findMany({
      where: { timeSinkId },
      orderBy: { startTime: 'desc' },
    })

    return records.map((record) =>
      recordToTimeSinkSession({
        ...record,
        startTime: record.startTime.toISOString(),
        endTime: record.endTime?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
      }),
    )
  }

  /**
   * Get all time sink sessions for a specific date.
   * Includes sessions that started on this date.
   */
  async getTimeSinkSessionsByDate(date: string): Promise<TimeSinkSession[]> {
    const startOfDay = new Date(`${date}T00:00:00`)
    const endOfDay = new Date(`${date}T23:59:59.999`)

    const records = await this.client.timeSinkSession.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { startTime: 'asc' },
    })

    return records.map((record) =>
      recordToTimeSinkSession({
        ...record,
        startTime: record.startTime.toISOString(),
        endTime: record.endTime?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
      }),
    )
  }

  /**
   * Get the currently active time sink session (if any).
   */
  async getActiveTimeSinkSession(): Promise<TimeSinkSession | null> {
    const record = await this.client.timeSinkSession.findFirst({
      where: { endTime: null },
      orderBy: { startTime: 'desc' },
    })

    if (!record) return null

    return recordToTimeSinkSession({
      ...record,
      startTime: record.startTime.toISOString(),
      endTime: null,
      createdAt: record.createdAt.toISOString(),
    })
  }

  /**
   * Get accumulated time by time sink for a date range.
   */
  async getTimeSinkAccumulated(startDate: string, endDate: string): Promise<TimeSinkAccumulatedResult> {
    const sessionId = await this.getActiveSession()

    // Get all time sinks for the session
    const sinks = await this.client.timeSink.findMany({
      where: { sessionId },
    })

    const sinkIds = sinks.map(s => s.id)

    // Get all completed sessions in the date range for these sinks
    const sessions = await this.client.timeSinkSession.findMany({
      where: {
        timeSinkId: { in: sinkIds },
        startTime: { gte: new Date(startDate) },
        endTime: { lte: new Date(endDate + 'T23:59:59.999Z') },
        actualMinutes: { not: null },
      },
    })

    // Aggregate by sink
    const bySink: Record<string, number> = {}
    let total = 0

    for (const session of sessions) {
      const minutes = session.actualMinutes ?? 0
      bySink[session.timeSinkId] = (bySink[session.timeSinkId] ?? 0) + minutes
      total += minutes
    }

    return { bySink, total }
  }

  /**
   * Delete a time sink session.
   */
  async deleteTimeSinkSession(id: string): Promise<void> {
    await this.client.timeSinkSession.delete({
      where: { id },
    })

    dbLogger.info('Deleted time sink session', { id })
  }

  // Tasks
  async getTasks(includeArchived = false): Promise<Task[]> {
    const sessionId = await this.getActiveSession()
    dbLogger.debug('Getting tasks', { sessionId, includeArchived })

    const tasks = await this.client.task.findMany({
      where: {
        sessionId,
        ...(includeArchived ? {} : { archived: false }),
      },
      include: {
        TaskStep: true, // Include steps for workflows
      },
      orderBy: { createdAt: 'desc' },
    })

    dbLogger.debug('Found tasks', {
      tasksCount: tasks.length,
      sessionId,
    })
    const formattedTasks = tasks.map(task => this.formatTask(task))
    dbLogger.debug('Returning formatted tasks', {
      formattedCount: formattedTasks.length,
    })
    return formattedTasks
  }

  @loggedVerbose({ scope: LogScope.Database, logArgs: true, tag: 'createTask' })
  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<Task> {
    const sessionId = await this.getActiveSession()
    const { steps, ...coreTaskData } = taskData as any

    // Create the task
    const task = await this.client.task.create({
      data: {
        id: crypto.randomUUID(),
        ...coreTaskData,
        sessionId,
        dependencies: JSON.stringify(taskData.dependencies || []),
        overallStatus: taskData.overallStatus || 'not_started',
        hasSteps: !!steps && steps.length > 0,
        criticalPathDuration: taskData.criticalPathDuration || taskData.duration,
        worstCaseDuration: taskData.worstCaseDuration || taskData.duration,
        updatedAt: getCurrentTime(),
      },
    })

    // Create steps if this is a workflow
    if (steps && steps.length > 0) {
      // Steps should already have proper IDs from the frontend
      // If not, generate new ones (for backward compatibility)
      const stepsWithIds = steps.map((step: TaskStep, index: number) => ({
        id: step.id || crypto.randomUUID(),
        taskId: task.id,
        name: step.name,
        duration: step.duration,
        type: step.type,
        dependsOn: JSON.stringify(step.dependsOn || []),
        asyncWaitTime: step.asyncWaitTime || 0,
        status: step.status || 'pending',
        stepIndex: step.stepIndex ?? index,
        percentComplete: step.percentComplete ?? 0,
        notes: step.notes || null,
        cognitiveComplexity: step.cognitiveComplexity || null,
        importance: step.importance || null,
        urgency: step.urgency || null,
      }))

      await this.client.taskStep.createMany({
        data: stepsWithIds,
      })

      // Return task with steps
      const taskWithSteps = await this.client.task.findUnique({
        where: { id: task.id },
        include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
      })
      return this.formatTask(taskWithSteps!)
    }

    return this.formatTask(task)
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'sessionId'>>): Promise<Task> {
    const { steps, ...rawUpdates } = updates as any

    // Define allowed fields for Task model update
    const allowedFields = [
      'name', 'duration', 'importance', 'urgency', 'type', 'category',
      'asyncWaitTime', 'dependencies', 'completed', 'completedAt',
      'actualDuration', 'notes', 'projectId', 'deadline', 'isLocked',
      'lockedStartTime', 'hasSteps', 'currentStepId', 'overallStatus',
      'criticalPathDuration', 'worstCaseDuration', 'cognitiveComplexity',
    ]

    // Clean update data - only include allowed fields
    const cleanUpdateData = Object.entries(rawUpdates).reduce((acc, [key, value]) => {
      // Only include fields that are allowed
      // Include defined values, or null for nullable fields like deadline
      if (allowedFields.includes(key) && (value !== undefined || (key === 'deadline' && value === null))) {
        if (key === 'dependencies') {
          acc[key] = JSON.stringify(value)
        } else {
          acc[key] = value
        }
      }
      return acc
    }, {} as any)

    const task = await this.client.task.update({
      where: { id },
      data: {
        ...cleanUpdateData,
        updatedAt: getCurrentTime(),
      },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    // If steps are provided, update them
    if (steps && Array.isArray(steps)) {
      // Get existing steps to determine which are new vs updates
      const existingSteps = await this.client.taskStep.findMany({
        where: { taskId: id },
      })
      const existingStepIds = new Set(existingSteps.map(s => s.id))

      // First pass: ensure all steps have IDs
      const stepsWithIds = steps.map((step: TaskStep) => {
        // If step doesn't have an ID or it's not in existing steps, it's new
        if (!step.id) {
          // Generate ID for new step
          return { ...step, id: crypto.randomUUID() }
        }
        return step
      })

      // Delete steps that are no longer in the new list
      const newStepIds = new Set(stepsWithIds.map((s: TaskStep) => s.id))
      const stepsToDelete = existingSteps.filter(s => !newStepIds.has(s.id))
      for (const step of stepsToDelete) {
        await this.client.taskStep.delete({
          where: { id: step.id },
        })
      }

      // Update or create each step
      for (let i = 0; i < stepsWithIds.length; i++) {
        const step = stepsWithIds[i]

        // Dependencies should already be properly mapped from frontend
        const dependencies = step.dependsOn || []

        const stepData = {
          name: step.name,
          duration: step.duration,
          type: step.type,
          dependsOn: JSON.stringify(dependencies),
          asyncWaitTime: step.asyncWaitTime || 0,
          stepIndex: i,
          status: step.status || 'pending',
          percentComplete: step.percentComplete || 0,
          notes: step.notes || null,
          cognitiveComplexity: step.cognitiveComplexity || null,
          importance: step.importance || null,
          urgency: step.urgency || null,
        }

        if (existingStepIds.has(step.id)) {
          // Check if type changed
          const existingStep = existingSteps.find(s => s.id === step.id)
          if (existingStep && existingStep.type !== step.type) {
            // Type changed, update work sessions
            await this.updateWorkSessionTypesForStep(step.id, step.type)
          }

          // Update existing step
          await this.client.taskStep.update({
            where: { id: step.id },
            data: stepData,
          })
        } else {
          // Create new step with the already generated UUID
          await this.client.taskStep.create({
            data: {
              id: step.id, // Use the ID we already generated above
              ...stepData,
              taskId: id,
            },
          })
        }
      }

      // Return task with updated steps
      const updatedTask = await this.client.task.findUnique({
        where: { id },
        include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
      })

      return this.formatTask(updatedTask!)
    }

    return this.formatTask(task)
  }

  @logged({ scope: LogScope.Database, tag: 'deleteTask' })
  async deleteTask(id: string): Promise<void> {
    await this.client.task.delete({
      where: { id },
    })
  }

  async archiveTask(id: string): Promise<Task> {
    const task = await this.client.task.update({
      where: { id },
      data: { archived: true },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })
    return this.formatTask(task)
  }

  async unarchiveTask(id: string): Promise<Task> {
    const task = await this.client.task.update({
      where: { id },
      data: { archived: false },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })
    return this.formatTask(task)
  }

  /**
   * Promotes a standalone task to a workflow (empty workflow with no steps initially)
   * Preserves all existing task data and sets up workflow structure
   * @param taskId - ID of the task to promote
   * @returns Updated task with hasSteps=true and empty steps array
   */
  @logged({ scope: LogScope.Database, tag: 'promoteTaskToWorkflow' })
  async promoteTaskToWorkflow(taskId: string): Promise<Task> {
    // Fetch the standalone task
    const existingTask = await this.client.task.findUnique({
      where: { id: taskId },
      include: { TaskStep: true },
    })

    if (!existingTask) {
      throw new Error(`Task ${taskId} not found`)
    }

    if (existingTask.hasSteps) {
      throw new Error(`Task ${taskId} is already a workflow`)
    }

    if (existingTask.completed) {
      throw new Error(`Cannot promote completed task ${taskId} to workflow`)
    }

    // Calculate initial workflow durations based on current task duration
    const criticalPathDuration = existingTask.duration
    const worstCaseDuration = Math.round(existingTask.duration * 1.5)

    // Update task to workflow
    const promotedTask = await this.client.task.update({
      where: { id: taskId },
      data: {
        hasSteps: true,
        criticalPathDuration,
        worstCaseDuration,
        overallStatus: 'not_started',
        updatedAt: getCurrentTime(),
      },
      include: {
        TaskStep: { orderBy: { stepIndex: 'asc' } },
      },
    })

    return this.formatTask(promotedTask)
  }

  async completeTask(id: string, actualDuration?: number): Promise<Task> {
    const task = await this.client.task.update({
      where: { id },
      data: {
        completed: true,
        completedAt: getCurrentTime(),
        actualDuration: actualDuration ?? null,
        overallStatus: 'completed',
      },
    })

    // Record time estimate accuracy
    if (actualDuration !== undefined) {
      const sessionId = await this.getActiveSession()
      await this.recordTimeEstimateAccuracy(sessionId, {
        taskType: task.type,
        estimatedMinutes: task.duration,
        actualMinutes: actualDuration,
      })
    }

    return this.formatTask(task)
  }

  async updateTaskStep(taskId: string, stepId: string, updates: { status?: string; actualDuration?: number; notes?: string; percentComplete?: number; completedAt?: Date; startedAt?: Date }): Promise<void> {
    await this.client.taskStep.update({
      where: { id: stepId },
      data: updates,
    })

    // Update task's current step if completed
    if (updates.status === 'completed') {
      const steps = await this.client.taskStep.findMany({
        where: { taskId },
        orderBy: { stepIndex: 'asc' },
      })

      const nextStep = steps.find((s: any) => s.status === 'pending')
      if (nextStep) {
        await this.client.task.update({
          where: { id: taskId },
          data: { currentStepId: nextStep.id },
        })
      } else {
        // All steps completed
        await this.client.task.update({
          where: { id: taskId },
          data: {
            currentStepId: null,
            overallStatus: 'completed',
            completed: true,
            completedAt: getCurrentTime(),
          },
        })
      }
    }
  }

  // Helper to format task from DB
  private formatTask(task: any): Task {
    if (!task) {
      throw new Error('Cannot format null or undefined task')
    }

    // Debug log to see what we're getting
    if (task.hasSteps) {
      // Task has steps - will be processed below
    }

    return {
      ...task,
      dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
      completedAt: task.completedAt ?? null,
      actualDuration: task.actualDuration ?? null,
      deadline: task.deadline ?? null,
      currentStepId: task.currentStepId ?? null,
      steps: task.hasSteps && task.TaskStep ? task.TaskStep
        .sort((a: any, b: any) => a.stepIndex - b.stepIndex)
        .map((step: any) => ({
          ...step,
          dependsOn: step.dependsOn ? JSON.parse(step.dependsOn) : [],
        })) : undefined,
    }
  }

  async getTaskById(id: string): Promise<Task | null> {
    const task = await this.client.task.findUnique({
      where: { id },
      include: {
        TaskStep: true, // Include steps for workflows
      },
    })

    return task ? this.formatTask(task) : null
  }

  // Job Context methods
  async getJobContexts(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const contexts = await this.client.jobContext.findMany({
      where: { sessionId },
      include: {
        ContextEntry: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return contexts.map(context => ({
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
      contextEntries: context.ContextEntry,
    }))
  }

  async getActiveJobContext(): Promise<any | null> {
    const sessionId = await this.getActiveSession()
    const context = await this.client.jobContext.findFirst({
      where: {
        sessionId,
        isActive: true,
      },
      include: {
        ContextEntry: true,
      },
    })

    if (!context) return null

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
      contextEntries: context.ContextEntry,
    }
  }

  async createJobContext(data: {
    name: string
    description: string
    context: string
    asyncPatterns?: any
    reviewCycles?: any
    tools?: string[]
    isActive?: boolean
  }): Promise<any> {
    // Deactivate other contexts if this one is being set as active
    if (data.isActive) {
      const sessionId = await this.getActiveSession()
      await this.client.jobContext.updateMany({
        where: { sessionId, isActive: true },
        data: { isActive: false },
      })
    }

    const sessionId = await this.getActiveSession()
    const context = await this.client.jobContext.create({
      data: {
        id: crypto.randomUUID(),
        ...data,
        sessionId,
        asyncPatterns: JSON.stringify(data.asyncPatterns || {}),
        reviewCycles: JSON.stringify(data.reviewCycles || {}),
        tools: JSON.stringify(data.tools || []),
      },
      include: {
        ContextEntry: true,
      },
    })

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
      contextEntries: context.ContextEntry,
    }
  }

  async updateJobContext(id: string, data: {
    name?: string
    description?: string
    context?: string
    asyncPatterns?: any
    reviewCycles?: any
    tools?: string[]
    isActive?: boolean
  }): Promise<any> {
    // Deactivate other contexts if this one is being set as active
    if (data.isActive) {
      const sessionId = await this.getActiveSession()
      await this.client.jobContext.updateMany({
        where: { sessionId, isActive: true },
        data: { isActive: false },
      })
    }

    const updateData: any = {
      ...data,
      updatedAt: getCurrentTime(),
    }

    if (data.asyncPatterns !== undefined) {
      updateData.asyncPatterns = JSON.stringify(data.asyncPatterns)
    }
    if (data.reviewCycles !== undefined) {
      updateData.reviewCycles = JSON.stringify(data.reviewCycles)
    }
    if (data.tools !== undefined) {
      updateData.tools = JSON.stringify(data.tools)
    }

    const context = await this.client.jobContext.update({
      where: { id },
      data: updateData,
      include: {
        ContextEntry: true,
      },
    })

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
      contextEntries: context.ContextEntry,
    }
  }

  async deleteJobContext(id: string): Promise<void> {
    await this.client.jobContext.delete({
      where: { id },
    })
  }

  async upsertContextEntry(entry: {
    jobContextId: string
    key: string
    value: string
    category: string
    notes?: string
  }): Promise<any> {
    return await this.client.contextEntry.upsert({
      where: {
        jobContextId_key: {
          jobContextId: entry.jobContextId,
          key: entry.key,
        },
      },
      update: {
        value: entry.value,
        category: entry.category,
        notes: entry.notes ?? null,
      },
      create: {
        id: crypto.randomUUID(),
        key: entry.key,
        value: entry.value,
        category: entry.category,
        notes: entry.notes ?? null,
        jobContextId: entry.jobContextId,
      },
    })
  }

  async deleteContextEntry(jobContextId: string, key: string): Promise<void> {
    await this.client.contextEntry.delete({
      where: {
        jobContextId_key: {
          jobContextId,
          key,
        },
      },
    })
  }

  // Jargon methods
  async createJargonEntry(jargon: {
    term: string
    definition: string
    category?: string
    examples?: string
    relatedTerms?: string
  }): Promise<any> {
    const sessionId = await this.getActiveSession()
    return await this.client.jargonEntry.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        term: jargon.term,
        definition: jargon.definition,
        category: jargon.category ?? null,
        examples: jargon.examples || '',
        relatedTerms: jargon.relatedTerms || '',
      },
    })
  }

  async getJargonEntries(filters?: { category?: string; searchTerm?: string }): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const where: any = { sessionId }

    if (filters?.category) {
      where.category = filters.category
    }

    if (filters?.searchTerm) {
      where.OR = [
        { term: { contains: filters.searchTerm, mode: 'insensitive' } },
        { definition: { contains: filters.searchTerm, mode: 'insensitive' } },
      ]
    }

    return await this.client.jargonEntry.findMany({
      where,
      orderBy: { term: 'asc' },
    })
  }

  async updateJargonEntry(id: string, updates: Partial<{
    term: string
    definition: string
    category?: string
    examples?: string
    relatedTerms?: string
  }>): Promise<any> {
    return await this.client.jargonEntry.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: getCurrentTime(),
      },
    })
  }

  async deleteJargonEntry(id: string): Promise<void> {
    await this.client.jargonEntry.delete({
      where: { id },
    })
  }

  // Sequenced Tasks - NOW USING UNIFIED TASK MODEL
  async getSequencedTasks(): Promise<any[]> {
    // Get all workflows (tasks with steps) and format them as SequencedTasks for backward compatibility
    const allTasks = await this.getTasks()
    const workflows = allTasks.filter(task => task.hasSteps && task.steps)

    // Format as SequencedTask for UI compatibility
    return workflows.map(task => ({
      ...task,
      totalDuration: task.duration,
      steps: task.steps || [],
      // Ensure we have the right structure for UI
      overallStatus: task.overallStatus || 'not_started',
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
    }))
  }

  async getSequencedTaskById(id: string): Promise<any | null> {
    // Get task and format as SequencedTask for UI compatibility
    const task = await this.getTaskById(id)
    if (!task || !task.hasSteps) return null

    return {
      ...task,
      totalDuration: task.duration,
      steps: task.steps || [],
      overallStatus: task.overallStatus || 'not_started',
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
    }
  }

  async createSequencedTask(taskData: any): Promise<any> {
    // Create task as workflow and format as SequencedTask
    const task = await this.createTask({
      ...taskData,
      hasSteps: true,
      steps: taskData.steps,
    })

    // Return in SequencedTask format for UI compatibility
    return {
      ...task,
      totalDuration: task.duration,
      steps: task.steps || [],
      overallStatus: task.overallStatus || 'not_started',
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
    }
  }

  async updateSequencedTask(id: string, updates: any): Promise<any> {
    // Update task and format as SequencedTask
    const task = await this.updateTask(id, updates)

    // Return in SequencedTask format for UI compatibility
    return {
      ...task,
      totalDuration: task.duration,
      steps: task.steps || [],
      overallStatus: task.overallStatus || 'not_started',
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
    }
  }

  async deleteSequencedTask(id: string): Promise<void> {
    // Redirect to deleteTask
    await this.deleteTask(id)
  }

  async addStepToWorkflow(workflowId: string, stepData: {
    name: string
    duration: number
    type: string // User-defined task type ID
    afterStep?: string
    beforeStep?: string
    dependencies?: string[]
    asyncWaitTime?: number
  }): Promise<any> {

    dbLogger.debug('addStepToWorkflow called', {
      workflowId,
      stepName: stepData.name,
      duration: stepData.duration,
      afterStep: stepData.afterStep,
      beforeStep: stepData.beforeStep,
      dependencies: stepData.dependencies,
    })

    // Get existing steps to determine order
    const existingSteps = await this.client.taskStep.findMany({
      where: { taskId: workflowId },
      orderBy: { stepIndex: 'asc' },
    })

    dbLogger.debug('Existing steps in workflow', {
      existingStepCount: existingSteps.length,
      existingStepNames: existingSteps.map(s => s.name),
      existingStepIds: existingSteps.map(s => s.id),
    })

    // Determine the index for the new step
    let newStepIndex = existingSteps.length // Default to end

    if (stepData.afterStep) {
      const afterIndex = existingSteps.findIndex(s => s.name === stepData.afterStep)
      if (afterIndex !== -1) {
        newStepIndex = afterIndex + 1
        dbLogger.debug('Inserting after step', {
          afterStep: stepData.afterStep,
          afterIndex,
          newStepIndex,
        })
      } else {
        dbLogger.warn('afterStep not found, appending to end', {
          afterStep: stepData.afterStep,
        })
      }
    } else if (stepData.beforeStep) {
      const beforeIndex = existingSteps.findIndex(s => s.name === stepData.beforeStep)
      if (beforeIndex !== -1) {
        newStepIndex = beforeIndex
        dbLogger.debug('Inserting before step', {
          beforeStep: stepData.beforeStep,
          beforeIndex,
          newStepIndex,
        })
      } else {
        dbLogger.warn('beforeStep not found, appending to end', {
          beforeStep: stepData.beforeStep,
        })
      }
    } else {
      dbLogger.debug('No position specified, appending to end', {
        newStepIndex,
      })
    }

    // Shift existing steps if inserting in the middle
    if (newStepIndex < existingSteps.length) {
      dbLogger.debug('Shifting existing steps', {
        shiftStartIndex: newStepIndex,
        numberOfStepsToShift: existingSteps.length - newStepIndex,
      })
      for (let i = newStepIndex; i < existingSteps.length; i++) {
        await this.client.taskStep.update({
          where: { id: existingSteps[i].id },
          data: { stepIndex: existingSteps[i].stepIndex + 1 },
        })
      }
    }

    // CRITICAL: Dependencies are provided as step NAMES but need to be stored as step IDs
    // Currently storing names directly which causes the dependency wiring bug
    const dependenciesToStore = stepData.dependencies || []
    dbLogger.debug('About to create step with dependencies', {
      stepName: stepData.name,
      dependenciesProvided: stepData.dependencies,
      willStoreAs: dependenciesToStore,
      note: 'BUG: These should be step IDs but are currently step names',
    })

    // Create the new step
    const newStepId = generateRandomStepId()
    await this.client.taskStep.create({
      data: {
        id: newStepId,
        taskId: workflowId,
        name: stepData.name,
        duration: stepData.duration,
        type: stepData.type,
        stepIndex: newStepIndex,
        dependsOn: JSON.stringify(dependenciesToStore),
        asyncWaitTime: stepData.asyncWaitTime || 0,
        status: 'pending',
        percentComplete: 0,
      },
    })

    dbLogger.debug('Step created in database', {
      newStepId,
      stepName: stepData.name,
      stepIndex: newStepIndex,
      storedDependsOn: JSON.stringify(dependenciesToStore),
    })

    // Update the workflow's total duration
    const updatedTask = await this.client.task.findUnique({
      where: { id: workflowId },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    if (updatedTask) {
      const totalDuration = updatedTask.TaskStep.reduce((sum, step) => sum + step.duration, 0)
      await this.client.task.update({
        where: { id: workflowId },
        data: { duration: totalDuration },
      })
      dbLogger.debug('Updated workflow duration', {
        workflowId,
        oldDuration: updatedTask.duration,
        newDuration: totalDuration,
        totalSteps: updatedTask.TaskStep.length,
      })
    }


    // Return the updated workflow in SequencedTask format
    const finalTask = await this.client.task.findUnique({
      where: { id: workflowId },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    dbLogger.debug('addStepToWorkflow completed', {
      workflowId,
      totalStepsNow: finalTask?.TaskStep.length,
      stepNames: finalTask?.TaskStep.map(s => s.name),
    })

    return this.formatTask(finalTask!)
  }

  private formatSequencedTask(task: any): any {
    // Redirect to formatTask since we're using unified model
    return this.formatTask(task)
  }

  // Work patterns
  async getWorkPatterns(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    dbLogger.debug('getWorkPatterns - Looking for patterns', { sessionId })
    const patterns = await this.client.workPattern.findMany({
      where: {
        sessionId,
        isTemplate: false,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
      orderBy: { date: 'desc' },
    })

    // Session isolation: Return only current session's patterns
    // Empty result is correct behavior for new sessions - user should create their own patterns
    dbLogger.debug('getWorkPatterns - Found patterns for current session', {
      count: patterns.length,
      sessionId,
    })

    return patterns.map(pattern => ({
      ...pattern,
      blocks: pattern.WorkBlock.map(mapDatabaseBlock),
      meetings: pattern.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }))
  }

  async getWorkPattern(date: string): Promise<any | null> {
    const sessionId = await this.getActiveSession()
    dbLogger.info('getWorkPattern - Query', {
      date,
      sessionId,
      timestamp: getCurrentTime().toISOString(),
      localTime: getCurrentTime().toLocaleTimeString('en-US', { hour12: false }),
    })
    const pattern = await this.client.workPattern.findUnique({
      where: {
        sessionId_date: {
          sessionId,
          date,
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
        WorkSession: true,
      },
    })

    // Use only the current session's pattern - no fallback to other sessions
    if (!pattern) {
      // No pattern found for current session - return null instead of checking other sessions
      dbLogger.debug('getWorkPattern - No pattern found', {
        date,
        sessionId,
        searchKey: `${sessionId}_${date}`,
      })
      return null
    }

    // Pattern found, process it
    dbLogger.info('getWorkPattern - Found pattern', {
      date,
      patternId: pattern.id,
      blocks: pattern.WorkBlock.length,
      blockDetails: pattern.WorkBlock.map((b: WorkBlockLogData) => ({
        start: b.startTime,
        end: b.endTime,
        typeConfig: b.typeConfig,
      })),
      meetings: pattern.WorkMeeting.length,
    })

    return {
      ...pattern,
      blocks: pattern.WorkBlock.map(mapDatabaseBlock),
      meetings: pattern.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async createWorkPattern(data: {
    date: string
    blocks?: any[]
    meetings?: any[]
    isTemplate?: boolean
    templateName?: string
    recurring?: 'none' | 'daily' | 'weekly'
  }): Promise<any> {
    const sessionId = await this.getActiveSession()

    // [WorkPatternLifeCycle] START: Creating work pattern
    dbLogger.info('createWorkPattern - START', {
      date: data.date,
      sessionId,
      isTemplate: data.isTemplate || false,
      templateName: data.templateName || null,
      blocksCount: data.blocks?.length || 0,
      meetingsCount: data.meetings?.length || 0,
      recurring: data.recurring || null,
      timestamp: getCurrentTime().toISOString(),
      localTime: getCurrentTime().toLocaleTimeString('en-US', { hour12: false }),
    })

    dbLogger.info('createWorkPattern - Creating pattern', { date: data.date, sessionId, blocksCount: data.blocks?.length || 0 })
    const { blocks, meetings, recurring, ...patternData } = data

    // First, delete existing pattern if it exists (to replace it)
    if (!data.isTemplate) {
      await this.client.workPattern.deleteMany({
        where: {
          sessionId,
          date: data.date,
        },
      })
    }

    const pattern = await this.client.workPattern.create({
      data: {
        id: crypto.randomUUID(),
        ...patternData,
        sessionId,
        WorkBlock: {
          create: (blocks || []).map((b: any) => {
            // Extract typeConfig from input block
            const typeConfig: BlockTypeConfig = b.typeConfig || DEFAULT_TYPE_CONFIG
            const blockCapacity = calculateBlockCapacity(typeConfig, b.startTime, b.endTime)

            return {
              id: crypto.randomUUID(),
              startTime: b.startTime,
              endTime: b.endTime,
              typeConfig: JSON.stringify(typeConfig),
              totalCapacity: blockCapacity.totalMinutes,
            }
          }),
        },
        WorkMeeting: {
          create: (meetings || []).map((m: any) => {
            const { patternId: _patternId, id: _id, ...meetingData } = m
            return {
              id: crypto.randomUUID(),
              ...meetingData,
              daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
            }
          }),
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
        WorkSession: true,
      },
    })

    // Handle repetition for sleep blocks
    if (recurring === 'daily' && !data.isTemplate) {
      // Check if this pattern has sleep blocks (in meetings array)
      const hasSleepBlocks = meetings?.some(m =>
        m.name === 'Sleep' || m.type === 'blocked',
      )

      if (hasSleepBlocks) {
        // Create patterns for the next 30 days
        const startDate = new Date(data.date)
        for (let i = 1; i <= 30; i++) {
          const futureDate = new Date(startDate)
          futureDate.setDate(futureDate.getDate() + i)
          const futureDateStr = futureDate.toISOString().split('T')[0]

          // Check if pattern already exists for this date
          const existingPattern = await this.client.workPattern.findUnique({
            where: {
              sessionId_date: {
                sessionId,
                date: futureDateStr,
              },
            },
          })

          // Only create if it doesn't exist
          if (!existingPattern) {
            await this.client.workPattern.create({
              data: {
                id: crypto.randomUUID(),
                date: futureDateStr,
                sessionId,
                isTemplate: false,
                WorkBlock: {
                  create: (blocks || []).map((b: any) => {
                    const typeConfig: BlockTypeConfig = b.typeConfig || DEFAULT_TYPE_CONFIG
                    const blockCapacity = calculateBlockCapacity(typeConfig, b.startTime, b.endTime)
                    return {
                      id: crypto.randomUUID(),
                      startTime: b.startTime,
                      endTime: b.endTime,
                      typeConfig: JSON.stringify(typeConfig),
                      totalCapacity: blockCapacity.totalMinutes,
                    }
                  }),
                },
                WorkMeeting: {
                  create: (meetings || []).map((m: any) => {
                    const { patternId: _patternId, id: _id, ...meetingData } = m
                    return {
                      id: crypto.randomUUID(),
                      ...meetingData,
                      daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
                    }
                  }),
                },
              },
            })
          }
        }

        dbLogger.info('Created daily sleep patterns', {
          startDate: data.date,
          daysCreated: 30,
        })
      }
    }

    const formattedPattern = {
      ...pattern,
      blocks: pattern.WorkBlock.map(mapDatabaseBlock),
      meetings: pattern.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }

    dbLogger.info('createWorkPattern - COMPLETE', {
      patternId: pattern.id,
      date: pattern.date,
      sessionId: pattern.sessionId,
      totalBlocks: pattern.WorkBlock.length,
      totalMeetings: pattern.WorkMeeting.length,
      timestamp: getCurrentTime().toISOString(),
    })

    return formattedPattern
  }

  async createWorkPatternFromTemplate(date: string, templateName: string): Promise<any> {
    const sessionId = await this.getActiveSession()
    const existingPattern = await this.client.workPattern.findFirst({
      where: {
        sessionId,
        isTemplate: true,
        templateName,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    if (!existingPattern) {
      throw new Error(`Template "${templateName}" not found`)
    }

    const template = await this.client.workPattern.create({
      data: {
        id: crypto.randomUUID(),
        date,
        isTemplate: false,
        templateName,
        sessionId,
        WorkBlock: {
          create: existingPattern.WorkBlock.map((b: any) => ({
            id: crypto.randomUUID(),
            startTime: b.startTime,
            endTime: b.endTime,
            typeConfig: b.typeConfig, // Copy typeConfig from template
            totalCapacity: b.totalCapacity || 0,
          })),
        },
        WorkMeeting: {
          create: existingPattern.WorkMeeting.map((m: any) => ({
            id: crypto.randomUUID(),
            name: m.name,
            startTime: m.startTime,
            endTime: m.endTime,
            type: m.type,
            recurring: m.recurring,
            daysOfWeek: m.daysOfWeek,
          })),
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    return {
      ...template,
      blocks: template.WorkBlock.map(mapDatabaseBlock),
      meetings: template.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async updateWorkPattern(id: string, updates: {
    blocks?: any[]
    meetings?: any[]
  }): Promise<any> {
    // [WorkPatternLifeCycle] START: Updating work pattern

    // Get existing blocks to preserve IDs and check for sessions
    const existingBlocks = await this.client.workBlock.findMany({
      where: { patternId: id },
    })
    const existingBlockIds = new Set(existingBlocks.map(b => b.id))

    // Build map of incoming blocks by ID (for blocks that have IDs)
    const incomingBlocks = updates.blocks || []
    const incomingBlockIds = new Set(
      incomingBlocks.map((b: any) => b.id).filter(Boolean),
    )

    // Determine which blocks to delete (no longer in the incoming list)
    const blocksToDelete = existingBlocks.filter(b => !incomingBlockIds.has(b.id))

    // Check for sessions before deleting - blocks with sessions cannot be deleted
    for (const block of blocksToDelete) {
      const sessionCount = await this.client.workSession.count({
        where: { blockId: block.id },
      })
      if (sessionCount > 0) {
        throw new Error(
          `Cannot delete block ${block.id} (${block.startTime}-${block.endTime}): ` +
          `has ${sessionCount} work session(s). Remove sessions first or keep the block.`,
        )
      }
    }

    // Delete blocks that are no longer present (validated above as having no sessions)
    if (blocksToDelete.length > 0) {
      await this.client.workBlock.deleteMany({
        where: { id: { in: blocksToDelete.map(b => b.id) } },
      })
    }

    // Update existing blocks (preserve IDs!)
    for (const block of incomingBlocks) {
      if (block.id && existingBlockIds.has(block.id)) {
        const typeConfig: BlockTypeConfig = block.typeConfig || DEFAULT_TYPE_CONFIG
        const blockCapacity = calculateBlockCapacity(typeConfig, block.startTime, block.endTime)
        await this.client.workBlock.update({
          where: { id: block.id },
          data: {
            startTime: block.startTime,
            endTime: block.endTime,
            typeConfig: JSON.stringify(typeConfig),
            totalCapacity: blockCapacity.totalMinutes,
          },
        })
      }
    }

    // Create new blocks (those without existing IDs)
    const blocksToCreate = incomingBlocks.filter(
      (b: any) => !b.id || !existingBlockIds.has(b.id),
    )

    // Delete all meetings (meetings don't have sessions referencing them)
    await this.client.workMeeting.deleteMany({
      where: { patternId: id },
    })

    // Now update pattern with new blocks and meetings
    const pattern = await this.client.workPattern.update({
      where: { id },
      data: {
        updatedAt: getCurrentTime(),
        WorkBlock: {
          create: blocksToCreate.map((b: any) => {
            const typeConfig: BlockTypeConfig = b.typeConfig || DEFAULT_TYPE_CONFIG
            const blockCapacity = calculateBlockCapacity(typeConfig, b.startTime, b.endTime)
            return {
              id: b.id || crypto.randomUUID(),
              startTime: b.startTime,
              endTime: b.endTime,
              typeConfig: JSON.stringify(typeConfig),
              totalCapacity: blockCapacity.totalMinutes,
            }
          }),
        },
        WorkMeeting: {
          create: (updates.meetings || []).map((m: any) => {
            const { patternId: _patternId, id: _id, ...meetingData } = m
            return {
              id: crypto.randomUUID(),
              ...meetingData,
              daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
            }
          }),
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    dbLogger.debug('updateWorkPattern - Pattern updated', {
      patternId: id,
      date: pattern.date,
      sessionId: pattern.sessionId,
      blocksCount: pattern.WorkBlock.length,
      meetingsCount: pattern.WorkMeeting.length,
      blocks: pattern.WorkBlock.map(b => ({
        startTime: b.startTime,
        endTime: b.endTime,
        typeConfig: b.typeConfig,
        totalCapacity: b.totalCapacity,
      })),
      meetings: pattern.WorkMeeting.map(m => ({
        name: m.name,
        startTime: m.startTime,
        endTime: m.endTime,
        type: m.type,
      })),
      timestamp: getCurrentTime().toISOString(),
    })

    const formattedPattern = {
      ...pattern,
      blocks: pattern.WorkBlock.map(mapDatabaseBlock),
      meetings: pattern.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }

    dbLogger.info('updateWorkPattern - COMPLETE', {
      patternId: id,
      date: pattern.date,
      sessionId: pattern.sessionId,
      totalBlocks: pattern.WorkBlock.length,
      totalMeetings: pattern.WorkMeeting.length,
      timestamp: getCurrentTime().toISOString(),
    })

    return formattedPattern
  }

  async deleteWorkPattern(id: string): Promise<void> {
    // [WorkPatternLifeCycle] START: Deleting work pattern
    dbLogger.info('deleteWorkPattern - START', {
      patternId: id,
      timestamp: getCurrentTime().toISOString(),
      localTime: getCurrentTime().toLocaleTimeString('en-US', { hour12: false }),
    })

    // Get pattern details before deletion for logging
    const pattern = await this.client.workPattern.findUnique({
      where: { id },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    if (pattern) {
      dbLogger.debug('deleteWorkPattern - Pattern to delete', {
        patternId: id,
        date: pattern.date,
        sessionId: pattern.sessionId,
        blocksCount: pattern.WorkBlock.length,
        meetingsCount: pattern.WorkMeeting.length,
        isTemplate: pattern.isTemplate,
        timestamp: getCurrentTime().toISOString(),
      })
    }

    await this.client.workPattern.delete({
      where: { id },
    })

    dbLogger.info('deleteWorkPattern - COMPLETE', {
      patternId: id,
      timestamp: getCurrentTime().toISOString(),
    })
  }

  async getWorkPatternTemplates(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const templates = await this.client.workPattern.findMany({
      where: {
        sessionId,
        isTemplate: true,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return templates.map(t => ({
      ...t,
      blocks: t.WorkBlock.map(mapDatabaseBlock),
      meetings: t.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }))
  }

  /**
   * Find the work block that contains a given time on a given date.
   * Used to associate work sessions with their containing blocks.
   */
  async findBlockAtTime(date: string, timeMinutes: number): Promise<{ id: string } | null> {
    const pattern = await this.getWorkPattern(date)
    if (!pattern?.blocks) return null

    for (const block of pattern.blocks) {
      const blockStart = timeStringToMinutes(block.startTime)
      const blockEnd = timeStringToMinutes(block.endTime)

      // Handle blocks that cross midnight
      if (blockEnd < blockStart) {
        if (timeMinutes >= blockStart || timeMinutes < blockEnd) {
          return { id: block.id }
        }
      } else {
        if (timeMinutes >= blockStart && timeMinutes < blockEnd) {
          return { id: block.id }
        }
      }
    }
    return null
  }

  // Work sessions
  async createWorkSession(data: {
    taskId: string
    stepId?: string
    startTime: Date
    endTime?: Date
    plannedMinutes: number
    actualMinutes?: number
    notes?: string
  }): Promise<any> {
    // Validate required fields
    if (!data.taskId) {
      throw new Error('taskId is required for creating a work session')
    }
    // Type is no longer required - it's derived from the task
    if (data.plannedMinutes === undefined || data.plannedMinutes === null) {
      throw new Error('plannedMinutes is required for creating a work session')
    }
    if (!data.startTime) {
      throw new Error('startTime is required for creating a work session')
    }

    // SINGLE ACTIVE SESSION ENFORCEMENT
    // Check for any existing active work sessions (sessions without endTime)
    const activeSession = await this.client.workSession.findFirst({
      where: {
        endTime: null,
      },
      orderBy: {
        startTime: 'desc',
      },
    })

    if (activeSession) {
      dbLogger.warn('Found existing active session - auto-closing before creating new session', {
        existingSessionId: activeSession.id,
        existingTaskId: activeSession.taskId,
        existingStepId: activeSession.stepId,
        existingStartTime: activeSession.startTime.toISOString(),
      })

      // Auto-close the existing session using time provider
      const now = getCurrentTime()
      const elapsedMinutes = Math.floor((now.getTime() - activeSession.startTime.getTime()) / (1000 * 60))

      await this.client.workSession.update({
        where: { id: activeSession.id },
        data: {
          endTime: now,
          actualMinutes: Math.max(elapsedMinutes, 1), // Ensure at least 1 minute
        },
      })

      dbLogger.info('Auto-closed stale session', {
        sessionId: activeSession.id,
        actualMinutes: Math.max(elapsedMinutes, 1),
      })
    }

    // Look up the task to derive the type
    const task = await this.client.task.findUnique({
      where: { id: data.taskId },
      include: {
        TaskStep: true,
      },
    })

    if (!task) {
      throw new Error(`Task not found: ${data.taskId}`)
    }

    // Derive type from step or task (user-defined task type ID)
    let derivedType: string = task.type || ''
    if (data.stepId) {
      const step = task.TaskStep?.find(s => s.id === data.stepId)
      if (step?.type) {
        derivedType = step.type
      }
    }

    // Find overlapping work block for this session
    const sessionDate = getLocalDateString(data.startTime)
    const sessionMinutes = data.startTime.getHours() * 60 + data.startTime.getMinutes()
    const overlappingBlock = await this.findBlockAtTime(sessionDate, sessionMinutes)
    const blockId = overlappingBlock?.id ?? null

    if (blockId) {
      dbLogger.debug('Assigned work session to block', { blockId, sessionDate, sessionMinutes })
    } else {
      dbLogger.info('Work session created outside any work block', { sessionDate, sessionMinutes })
    }

    const sessionId = crypto.randomUUID()

    dbLogger.debug('Creating work session in database', {
      sessionId,
      taskId: data.taskId,
      stepId: data.stepId,
      blockId,
      derivedType,
      taskType: task.type,
      startTime: data.startTime.toISOString(),
      plannedMinutes: data.plannedMinutes,
      actualMinutes: data.actualMinutes,
      hasNotes: !!data.notes,
    })

    const session = await this.client.workSession.create({
      data: {
        id: sessionId,
        taskId: data.taskId,
        stepId: data.stepId ?? null,
        blockId,
        type: derivedType, // Still store it for backwards compatibility, will remove field later
        startTime: data.startTime,
        endTime: data.endTime ?? null,
        plannedMinutes: data.plannedMinutes,
        actualMinutes: data.actualMinutes ?? null,
        notes: data.notes ?? null,
      },
    })

    dbLogger.debug('Work session created successfully', {
      sessionId: session.id,
      taskId: session.taskId,
      plannedMinutes: session.plannedMinutes,
      actualMinutes: session.actualMinutes,
      session: session,
    })

    return session
  }

  async getWorkSessionsForPattern(patternId: string): Promise<any[]> {
    const pattern = await this.client.workPattern.findUnique({
      where: { id: patternId },
      include: { WorkSession: true },
    })

    return pattern?.WorkSession || []
  }

  async endWorkSession(id: string, actualMinutes: number): Promise<any> {
    return await this.client.workSession.update({
      where: { id },
      data: {
        endTime: getCurrentTime(),
        actualMinutes,
      },
    })
  }

  /**
   * Get accumulated work time for a date, grouped by user-defined type ID.
   * Returns a map of typeId -> minutes, plus a total.
   */
  async getTodayAccumulated(date: string): Promise<AccumulatedTimeResult> {
    const { startOfDay, endOfDay } = this.getLocalDateRange(date)

    const workSessions = await this.client.workSession.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        Task: {
          include: {
            TaskStep: true,
          },
        },
      },
    })

    // Also check task steps that were completed today with actualDuration
    const completedSteps = await this.client.taskStep.findMany({
      where: {
        completedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        actualDuration: {
          gt: 0,
        },
      },
    })

    // Accumulate from work sessions - now using dynamic type IDs
    const accumulated: AccumulatedTimeResult = {
      byType: {},
      total: 0,
    }

    workSessions.forEach(session => {
      // Only count actualMinutes (completed work), not plannedMinutes
      const minutes = session.actualMinutes || 0
      if (minutes === 0) return

      // Get type ID from task or step (string, user-defined type ID)
      let typeId: string
      if (session.stepId) {
        const step = session.Task?.TaskStep?.find(s => s.id === session.stepId)
        typeId = step?.type || session.Task?.type || ''
      } else {
        typeId = session.Task?.type || ''
      }

      // Skip if no type ID
      if (!typeId) {
        dbLogger.warn('getTodayAccumulated - Session has no type ID', {
          sessionId: session.id,
          taskId: session.taskId,
        })
        return
      }

      // Accumulate by type ID
      accumulated.byType[typeId] = (accumulated.byType[typeId] || 0) + minutes
      accumulated.total += minutes

      dbLogger.debug('getTodayAccumulated - Processing work session', {
        sessionId: session.id,
        typeId,
        minutes,
        taskName: session.Task?.name,
      })
    })

    // Add time from completed steps (if not already in work sessions)
    completedSteps.forEach(step => {
      if (step.actualDuration) {
        const hasWorkSession = workSessions.some(ws => ws.stepId === step.id)
        if (!hasWorkSession) {
          const typeId = step.type || ''
          if (typeId) {
            accumulated.byType[typeId] = (accumulated.byType[typeId] || 0) + step.actualDuration
            accumulated.total += step.actualDuration
          }
        }
      }
    })

    dbLogger.info('getTodayAccumulated - Final accumulated time', {
      date,
      totalSessions: workSessions.length,
      byType: accumulated.byType,
      total: accumulated.total,
    })

    return accumulated
  }

  async getTaskTotalLoggedTime(taskId: string): Promise<number> {
    dbLogger.debug('Fetching work sessions for task', { taskId })

    const workSessions = await this.client.workSession.findMany({
      where: { taskId },
    })

    dbLogger.debug('Found work sessions', {
      taskId,
      sessionCount: workSessions.length,
      sessions: workSessions.map(s => ({
        id: s.id,
        plannedMinutes: s.plannedMinutes,
        actualMinutes: s.actualMinutes,
        startTime: s.startTime,
      })),
    })

    const total = workSessions.reduce((total, session) => {
      return total + (session.actualMinutes || session.plannedMinutes || 0)
    }, 0)

    dbLogger.debug('Calculated total logged time', {
      taskId,
      totalMinutes: total,
      sessionCount: workSessions.length,
    })

    return total
  }

  // Time estimate accuracy
  async recordTimeEstimateAccuracy(sessionId: string, data: {
    taskType: string
    estimatedMinutes: number
    actualMinutes: number
    workflowCategory?: string
  }): Promise<void> {
    const variance = ((data.actualMinutes - data.estimatedMinutes) / data.estimatedMinutes) * 100

    await this.client.timeEstimateAccuracy.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        taskType: data.taskType,
        estimatedMinutes: data.estimatedMinutes,
        actualMinutes: data.actualMinutes ?? null,
        variance,
        workflowCategory: data.workflowCategory ?? null,
      },
    })
  }

  async getTimeEstimateStats(taskType?: string): Promise<{
    avgVariance: number
    totalEstimates: number
    overestimateCount: number
    underestimateCount: number
  }> {
    const sessionId = await this.getActiveSession()
    const where: any = { sessionId }

    if (taskType) {
      where.taskType = taskType
    }

    const estimates = await this.client.timeEstimateAccuracy.findMany({
      where,
    })

    if (estimates.length === 0) {
      return {
        avgVariance: 0,
        totalEstimates: 0,
        overestimateCount: 0,
        underestimateCount: 0,
      }
    }

    const totalVariance = estimates.reduce((sum, e) => sum + e.variance, 0)
    const overestimateCount = estimates.filter(e => e.variance < 0).length
    const underestimateCount = estimates.filter(e => e.variance > 0).length

    return {
      avgVariance: totalVariance / estimates.length,
      totalEstimates: estimates.length,
      overestimateCount,
      underestimateCount,
    }
  }

  // Log persistence (dev mode only)
  async persistLog(logEntry: {
    level: string
    message: string
    source: string
    context: any
    sessionId?: string
  }): Promise<void> {
    // Only persist in development mode or when not in production
    if (process.env.NODE_ENV === 'production') {
      return
    }

    dbLogger.debug('Persisting log', { level: logEntry.level, message: logEntry.message })

    try {
      await this.client.appLog.create({
        data: {
          level: logEntry.level,
          message: logEntry.message,
          source: logEntry.source,
          context: JSON.stringify(logEntry.context || {}),
          sessionId: logEntry.sessionId || (await this.getActiveSession()),
        },
      })
    } catch (error) {
      // Don't let logging errors crash the app
      dbLogger.error('Failed to persist log', error)
    }
  }

  // Batch persist logs for performance
  async persistLogs(logs: Array<{
    level: string
    message: string
    source: string
    context: any
    sessionId?: string
  }>): Promise<void> {
    // Only persist in development mode or when not in production
    if (process.env.NODE_ENV === 'production') {
      return
    }

    try {
      const sessionId = await this.getActiveSession()
      await this.client.appLog.createMany({
        data: logs.map(log => ({
          level: log.level,
          message: log.message,
          source: log.source,
          context: JSON.stringify(log.context || {}),
          sessionId: log.sessionId || sessionId,
        })),
      })
    } catch (error) {
      // Don't let logging errors crash the app
      dbLogger.error('Failed to persist logs', error)
    }
  }

  // Log retrieval for LogViewer component
  async getSessionLogs(options?: LogQueryOptionsInternal): Promise<LogEntryInternal[]> {
    const { sessionId, level, source, since, limit = 100 } = options || {}

    const where: {
      sessionId?: string
      level?: string
      source?: string
      createdAt?: { gte: Date }
    } = {}

    if (sessionId) where.sessionId = sessionId
    if (level) where.level = level
    if (source) where.source = source
    if (since) where.createdAt = { gte: since }

    return this.client.appLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  // Get distinct sessions that have logs
  async getLoggedSessions(): Promise<SessionLogSummary[]> {
    const result = await this.client.appLog.groupBy({
      by: ['sessionId'],
      _count: { id: true },
      where: { sessionId: { not: null } },
      orderBy: { _count: { id: 'desc' } },
    })

    return result
      .filter((r): r is typeof r & { sessionId: string } => r.sessionId !== null)
      .map(r => ({
        sessionId: r.sessionId,
        logCount: r._count.id,
      }))
  }

  // Cleanup
  async disconnect(): Promise<void> {
    await this.client.$disconnect()
  }

  // Missing methods for compatibility
  async initializeDefaultData(): Promise<void> {
    // No-op - data is created on demand
  }

  async addContextEntry(jobContextId: string, entry: any): Promise<any> {
    return this.upsertContextEntry({ ...entry, jobContextId })
  }

  async getJargonDictionary(): Promise<Record<string, string>> {
    const entries = await this.getJargonEntries()
    const dictionary: Record<string, string> = {}
    for (const entry of entries) {
      dictionary[entry.term] = entry.definition || ''
    }
    return dictionary
  }

  async updateJargonDefinition(term: string, definition: string): Promise<void> {
    const sessionId = await this.getActiveSession()
    const existing = await this.client.jargonEntry.findFirst({
      where: { sessionId, term },
    })

    if (existing) {
      await this.client.jargonEntry.update({
        where: { id: existing.id },
        data: { definition, updatedAt: getCurrentTime() },
      })
    } else {
      // Create new entry if it doesn't exist
      await this.client.jargonEntry.create({
        data: {
          id: generateUniqueId('jargon'),
          term,
          definition,
          sessionId,
          category: 'custom',
          createdAt: getCurrentTime(),
          updatedAt: getCurrentTime(),
        },
      })
    }
  }

  async deleteAllTasks(): Promise<void> {
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({ where: { sessionId } })
  }

  async deleteAllSequencedTasks(): Promise<void> {
    // Delete all workflows (tasks with hasSteps=true)
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({ where: { sessionId, hasSteps: true } })
  }

  async deleteAllUserData(): Promise<void> {
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({ where: { sessionId } })
    // Note: SequencedTasks are now part of Task table with hasSteps=true
    await this.client.workPattern.deleteMany({ where: { sessionId } })
    await this.client.jobContext.deleteMany({ where: { sessionId } })
    await this.client.jargonEntry.deleteMany({ where: { sessionId } })
  }

  async getWorkTemplates(): Promise<any[]> {
    return this.getWorkPatternTemplates()
  }

  async saveAsTemplate(date: string, templateName: string): Promise<any> {
    const pattern = await this.getWorkPattern(date)
    if (!pattern) throw new Error('No pattern found for date')

    return this.createWorkPattern({
      date: `template-${Date.now()}`,
      isTemplate: true,
      templateName,
      blocks: pattern.blocks,
      meetings: pattern.meetings,
    })
  }

  async updateWorkSession(id: string, data: any): Promise<any> {
    // Get the session to know which task/step to update
    const session = await this.client.workSession.findUnique({
      where: { id },
    })

    if (!session) throw new Error(`Work session not found: ${id}`)

    // If only actualMinutes is provided, use the old method
    if (Object.keys(data).length === 1 && data.actualMinutes !== undefined) {
      const result = await this.endWorkSession(id, data.actualMinutes)
      // Recalculate actualDuration
      if (session.stepId) {
        await this.recalculateStepActualDuration(session.stepId)
      } else if (session.taskId) {
        await this.recalculateTaskActualDuration(session.taskId)
      }
      return result
    }

    // Otherwise, do a full update
    const updateData: any = {}
    if (data.plannedMinutes !== undefined) updateData.plannedMinutes = data.plannedMinutes
    if (data.actualMinutes !== undefined) updateData.actualMinutes = data.actualMinutes
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.startTime !== undefined) updateData.startTime = data.startTime
    if (data.endTime !== undefined) updateData.endTime = data.endTime

    const result = await this.client.workSession.update({
      where: { id },
      data: updateData,
    })

    // Recalculate actualDuration after update
    if (session.stepId) {
      await this.recalculateStepActualDuration(session.stepId)
    } else if (session.taskId) {
      await this.recalculateTaskActualDuration(session.taskId)
    }

    return result
  }

  async deleteWorkSession(id: string): Promise<void> {
    // Get the work session before deleting to know which task/step to update
    const session = await this.client.workSession.findUnique({
      where: { id },
    })

    if (!session) return

    // Delete the session
    await this.client.workSession.delete({
      where: { id },
    })

    // Recalculate actualDuration for the task/step
    if (session.stepId) {
      await this.recalculateStepActualDuration(session.stepId)
    } else if (session.taskId) {
      await this.recalculateTaskActualDuration(session.taskId)
    }
  }

  async recalculateStepActualDuration(stepId: string): Promise<void> {
    // Get all work sessions for this step
    const sessions = await this.client.workSession.findMany({
      where: { stepId },
    })

    // Calculate total actual duration from work sessions
    const totalActualMinutes = sessions.reduce((sum, session) =>
      sum + (session.actualMinutes || session.plannedMinutes || 0), 0)

    // Update the step's actualDuration
    await this.client.taskStep.update({
      where: { id: stepId },
      data: { actualDuration: totalActualMinutes > 0 ? totalActualMinutes : null },
    })
  }

  async recalculateTaskActualDuration(taskId: string): Promise<void> {
    // Get all work sessions for this task (not including step sessions)
    const sessions = await this.client.workSession.findMany({
      where: {
        taskId,
        stepId: null,
      },
    })

    // Calculate total actual duration from work sessions
    const totalActualMinutes = sessions.reduce((sum, session) =>
      sum + (session.actualMinutes || session.plannedMinutes || 0), 0)

    // Update the task's actualDuration
    await this.client.task.update({
      where: { id: taskId },
      data: { actualDuration: totalActualMinutes > 0 ? totalActualMinutes : null },
    })
  }

  async getWorkSessionsForTask(taskId: string): Promise<any[]> {
    // Session isolation: Only return work sessions if task belongs to current session
    const sessionId = await this.getActiveSession()

    return this.client.workSession.findMany({
      where: {
        taskId,
        // Filter through Task relationship to ensure session isolation
        Task: {
          sessionId,
        },
      },
      orderBy: { startTime: 'desc' },
    })
  }

  async getWorkSessions(date: string): Promise<any[]> {
    // Get work sessions for the given date, filtered by current session
    // Session isolation: Only return work sessions for tasks belonging to current session
    const sessionId = await this.getActiveSession()
    const { startOfDay, endOfDay } = this.getLocalDateRange(date)

    const sessions = await this.client.workSession.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        // Session isolation: Filter through Task relationship
        Task: {
          sessionId,
        },
      },
      include: {
        Task: true,
      },
      orderBy: { startTime: 'asc' },
    })

    dbLogger.debug('getWorkSessions - Session-filtered results', {
      date,
      sessionId,
      count: sessions.length,
    })

    return sessions
  }

  async getActiveWorkSession(): Promise<any | null> {
    // Get any active work session (no endTime) regardless of date
    // This is used for session restoration on app startup
    const session = await this.client.workSession.findFirst({
      where: {
        endTime: null,
      },
      include: {
        Task: {
          include: {
            TaskStep: true, // Include task steps so we can get step names
          },
        },
      },
      orderBy: {
        startTime: 'desc',
      },
    })

    if (!session) {
      return null
    }

    // Enrich with step name and workflowId if it's a step session
    const enriched = {
      ...session,
      taskName: session.Task?.name,
      stepName: session.stepId && session.Task?.TaskStep
        ? session.Task.TaskStep.find((s: any) => s.id === session.stepId)?.name
        : undefined,
      // If there's a stepId, this is a workflow step session, so taskId is actually the workflowId
      workflowId: session.stepId ? session.taskId : undefined,
    }

    dbLogger.info('getActiveWorkSession returning enriched session', {
      sessionId: enriched.id,
      taskId: enriched.taskId,
      stepId: enriched.stepId,
      workflowId: enriched.workflowId,
      taskName: enriched.taskName,
      stepName: enriched.stepName,
    })

    return enriched
  }

  async createStepWorkSession(data: any): Promise<any> {

    // Transform the data from UI format to database format
    // UI sends: { taskStepId, startTime, duration, notes }
    // DB needs: { taskId, stepId, type, startTime, plannedMinutes, notes }

    // Handle both taskStepId and stepId field names
    const stepId = data.taskStepId || data.stepId || data.taskStepld || data.stepld

    if (!stepId) {
      throw new Error('Step ID is required')
    }

    // First, we need to get the task ID from the step
    const step = await this.client.taskStep.findUnique({
      where: { id: stepId },
      include: { Task: true },
    })

    if (!step) {
      throw new Error(`Step not found: ${stepId}`)
    }

    // Transform the data - type is now derived from task/step in createWorkSession
    const workSessionData = {
      taskId: step.taskId,
      stepId: step.id,
      startTime: data.startTime || getCurrentTime(),
      endTime: data.endTime || null,
      plannedMinutes: data.duration || data.plannedMinutes || 0,
      actualMinutes: data.actualMinutes || data.duration || null,
      notes: data.notes || null,
    }


    const result = await this.createWorkSession(workSessionData)

    // Recalculate actualDuration after creating session
    await this.recalculateStepActualDuration(step.id)

    return result
  }

  async updateTaskStepProgress(stepId: string, data: any): Promise<void> {
    // Find task ID from step
    const step = await this.client.taskStep.findUnique({ where: { id: stepId } })

    if (!step) {
      throw new Error(`Step not found: ${stepId}`)
    }

    if (!step.taskId) {
      throw new Error(`Step ${stepId} has no associated taskId`)
    }

    await this.updateTaskStep(step.taskId, stepId, data)
  }

  async getStepWorkSessions(stepId: string): Promise<any[]> {
    return this.client.workSession.findMany({ where: { stepId } })
  }

  async updateWorkSessionTypesForStep(stepId: string, newType: string): Promise<void> {
    await this.client.workSession.updateMany({
      where: { stepId },
      data: { type: newType },
    })
  }

  async recordTimeEstimate(data: any): Promise<void> {
    const sessionId = await this.getActiveSession()
    return this.recordTimeEstimateAccuracy(sessionId, data)
  }

  async getTimeAccuracyStats(filters?: any): Promise<any> {
    return this.getTimeEstimateStats(filters?.taskType)
  }
}

// Export a singleton instance
export const getDatabase = (): DatabaseService => DatabaseService.getInstance()
