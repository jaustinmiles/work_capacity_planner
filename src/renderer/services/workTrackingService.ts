import { logger, logged, LogScope } from '@/logger'
import { getDatabase } from './database'
import type {
  WorkSessionPersistenceOptions,
} from './types/workTracking'
import type { Task, TaskStep } from '../../shared/types'
import {
  UnifiedWorkSession,
  fromDatabaseWorkSession,
  toDatabaseWorkSession,
  createUnifiedWorkSession,
} from '../../shared/unified-work-session-types'
import { TaskType } from '../../shared/enums'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '@/shared/time-provider'

/**
 * WorkTrackingService - Manages active work sessions with database persistence
 */
// We'll store active work sessions using the existing work session infrastructure
// and track which ones are "active" vs "completed" in the session data

export class WorkTrackingService {
  private activeSessions: Map<string, UnifiedWorkSession> = new Map()
  private options: Required<WorkSessionPersistenceOptions>
  private database: ReturnType<typeof getDatabase>
  private instanceId: string

  constructor(options: WorkSessionPersistenceOptions = {}, database?: ReturnType<typeof getDatabase>) {
    // Generate unique instance ID for tracking multiple instances in development
    this.instanceId = generateUniqueId('WTS')
    logger.ui.debug(`[WorkTrackingService] Instance created: ${this.instanceId}`, {})
      // instanceId: this.instanceId,
      // Capture call stack (first 5 lines) to debug why multiple instances are created
      // stackTrace: this.getCallerStackTrace(),
    // })

    this.options = {
      clearStaleSessionsOnStartup: true,
      maxSessionAgeHours: 24,
      ...options,
    }
    this.database = database || getDatabase()
  }

  /**
   * Get abbreviated call stack for debugging instance creation
   * Returns first 5 lines of stack trace to identify where service was instantiated
   */
  private getCallerStackTrace(): string {
    return new Error().stack?.split('\n').slice(0, 5).join('\n') || 'No stack trace available'
  }

  @logged({ scope: LogScope.UI })
  async initialize(): Promise<void> {
    // Clear local state first
    this.activeSessions.clear()
    logger.ui.info('[WorkTrackingService] Cleared all local active sessions on initialization')

    // Clear stale sessions if enabled (older than maxSessionAgeHours)
    if (this.options.clearStaleSessionsOnStartup) {
      const cutoffDate = new Date(Date.now() - this.options.maxSessionAgeHours * 60 * 60 * 1000)
      await this.clearStaleSessionsBeforeDate(cutoffDate)
    }

    // Restore any active session from database (within 24 hours)
    const activeSession = await this.getLastActiveWorkSession()
    if (activeSession) {
      // Restore to memory so UI can show it
      const sessionKey = this.getSessionKey(activeSession)
      this.activeSessions.set(sessionKey, activeSession)

      logger.ui.info('[WorkTrackingService] Restored active session from database', {})
        sessionId: activeSession.id,
        taskId: activeSession.taskId,
        stepId: activeSession.stepId,
        startTime: activeSession.startTime.toISOString(),
      })
    } else {
      logger.ui.info('[WorkTrackingService] No active sessions to restore')
    }

    logger.ui.info('[WorkTrackingService] Initialization complete', {})
    LOGGER_REMOVED: undefined
  }

  async startWorkSession(taskId?: string, stepId?: string, workflowId?: string): Promise<UnifiedWorkSession> {
    try {
      logger.ui.warn(`[WorkTrackingService ${this.instanceId}] 🟢 Starting work session`, {})
        // instanceId: this.instanceId,
        // taskId, stepId, workflowId,
        // currentActiveSessions: this.activeSessions.size,
        // activeSessionIds: Array.from(this.activeSessions.keys()),
      // })

      // Validate inputs
      if (!taskId && !stepId) {
        throw new Error('Must provide either taskId or stepId to start work session')
      }
      if (taskId && stepId) {
        throw new Error('Cannot provide both taskId and stepId for a work session')
      }

      // Check for existing active session
      if (this.activeSessions.size > 0) {
        logger.ui.warn('[WorkTrackingService] Cannot start new session - another session is active', {})
    LOGGER_REMOVED: undefined
        throw new Error('Cannot start new work session: another session is already active')
      }

      // Get current session info from database
      const currentSession = await this.database.getCurrentSession()

      // Fetch task and step names for display
      let taskName: string | undefined
      let stepName: string | undefined

      if (workflowId && stepId) {
        // For workflow steps, get the workflow task and find the specific step
        const workflow = await this.database.getTaskById(workflowId)
        if (workflow?.steps) {
          const step = workflow.steps.find((s: any) => s.id === stepId)
          if (step) {
            stepName = step.name
            taskName = workflow.name // Also include workflow name for context
          }
        }
      } else if (taskId) {
        // For regular tasks, just get the task name
        const task = await this.database.getTaskById(taskId)
        if (task) {
          taskName = task.name
        }
      }

      // Create new unified work session
      const workSession = createUnifiedWorkSession({
        taskId: workflowId || taskId || '',
        stepId,
        type: TaskType.Focused,
        plannedMinutes: 60, // Default 1 hour
        workflowId,
        taskName,
        stepName,
      })

      // Set runtime state
      workSession.isPaused = false

      // Save to database as an active work session (no endTime)
      // For workflows: taskId = workflowId, stepId = stepId
      // For regular tasks: taskId = taskId, stepId = undefined
      const dbTaskId = workflowId || taskId
      if (!dbTaskId) {
        throw new Error('Either taskId or workflowId must be provided')
      }

      const dbPayload = {
        ...toDatabaseWorkSession(workSession),
        sessionId: currentSession?.id || 'session-1',
        date: new Date().toISOString().split('T')[0],
      }

      logger.ui.info('[WorkTrackingService] Creating database work session', {})
        // dbPayload: {
          // ...dbPayload,
          // startTime: dbPayload.startTime.toISOString(),
        // },
      // })

      await this.database.createWorkSession(dbPayload)

      // Store in local state
      const sessionKey = this.getSessionKey(workSession)
      this.activeSessions.set(sessionKey, workSession)

      logger.ui.info('[WorkTrackingService] Work session started successfully', {})
    LOGGER_REMOVED: undefined

      return workSession
    } catch (error) {
      this.handleSessionError(error as Error, 'starting work session')
      throw new Error(`Failed to start work session: ${(error as Error).message}`)
    }
  }

  async pauseWorkSession(sessionId: string): Promise<void> {
    try {
      logger.ui.warn(`[WorkTrackingService ${this.instanceId}] 🟡 Attempting to pause session`, {})
        // instanceId: this.instanceId,
        // sessionId,
        // activeSessionsCount: this.activeSessions.size,
        // activeSessionIds: Array.from(this.activeSessions.keys()),
      // })

      const session = this.findSessionById(sessionId)
      if (!session) {
        logger.ui.error(`[WorkTrackingService ${this.instanceId}] ❌ PAUSE FAILED: No session found`, {})
          // instanceId: this.instanceId,
          // requestedSessionId: sessionId,
          // availableSessions: Array.from(this.activeSessions.values()).map(s => ({ id: s.id, stepId: s.stepId })),
        // })
        throw new Error(`No active session found with ID: ${sessionId}`)
      }

      // Calculate actual minutes worked
      const now = getCurrentTime()
      const elapsedMinutes = Math.floor((now.getTime() - session.startTime.getTime()) / (1000 * 60))

      // Close the session in database by setting endTime
      await this.database.updateWorkSession(session.id, {
        endTime: now,
        actualMinutes: Math.max(elapsedMinutes, 1), // Ensure at least 1 minute
      })

      // Remove from active sessions (it's now closed)
      const sessionKey = this.getSessionKey(session)
      this.activeSessions.delete(sessionKey)

      logger.ui.info('Paused work session (closed in database)', {
        // sessionId,
        // actualMinutes: Math.max(elapsedMinutes, 1),
      // })
    } catch (error) {
      this.handleSessionError(error as Error, 'pausing work session')
      throw error
    }
  }

  async resumeWorkSession(sessionId: string): Promise<void> {
    try {
      const session = this.findSessionById(sessionId)
      if (!session) {
        throw new Error(`No active session found with ID: ${sessionId}`)
      }

      // Remove pause state
      delete (session as any).isPaused
      delete (session as any).pausedAt
      delete session.endTime

      // Update database to remove pause state
      await this.database.updateWorkSession(session.id, {
        isPaused: false,
        pausedAt: null,
      })

      logger.ui.info('Resumed work session', { sessionId })
    } catch (error) {
      this.handleSessionError(error as Error, 'resuming work session')
      throw error
    }
  }

  async stopWorkSession(sessionId: string): Promise<void> {
    try {
      const session = this.findSessionById(sessionId)
      if (!session) {
        throw new Error(`No active session found with ID: ${sessionId}`)
      }

      // Set final end time and calculate actual duration
      session.endTime = new Date()

      // Ensure startTime is a Date object
      const startTime = session.startTime instanceof Date ? session.startTime : new Date(session.startTime)
      const endTime = session.endTime

      session.actualMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60))

      // Ensure we have at least 1 minute if any time has passed
      if (session.actualMinutes === 0 && endTime.getTime() > startTime.getTime()) {
        session.actualMinutes = 1
      }

      // Remove from active sessions
      const sessionKey = this.getSessionKey(session)
      this.activeSessions.delete(sessionKey)

      // Update database with end time (marks as completed, not active)
      const dbData = toDatabaseWorkSession(session)
      await this.database.updateWorkSession(session.id, dbData)

      logger.ui.info('Stopped work session', {})
    LOGGER_REMOVED: undefined
    } catch (error) {
      this.handleSessionError(error as Error, 'stopping work session')
      throw error
    }
  }

  async saveActiveSession(session: UnifiedWorkSession): Promise<void> {
    try {
      const dbData = toDatabaseWorkSession(session)
      const result = await this.database.updateWorkSession(session.id, dbData)
      logger.ui.debug('Saved active work session', { sessionId: session.id })
      return result
    } catch (error) {
      this.handleSessionError(error as Error, 'saving active session')
      throw error
    }
  }

  async getLastActiveWorkSession(): Promise<UnifiedWorkSession | null> {
    try {
      // Get any active work session from database (regardless of date)
      const activeSession = await this.database.getActiveWorkSession()

      if (!activeSession) {
        logger.ui.info('[WorkTrackingService] No active work session found in database')
        return null
      }

      if (!this.isValidSession(activeSession)) {
        logger.ui.warn('[WorkTrackingService] Active session found but invalid', { activeSession })
        return null
      }

      // Convert to unified format
      const unified = fromDatabaseWorkSession(activeSession)

      logger.ui.info('[WorkTrackingService] Found active work session', {})
    LOGGER_REMOVED: undefined

      return unified
    } catch (error) {
      this.handleSessionError(error as Error, 'getting last active work session')
      return null
    }
  }

  async clearStaleSessionsBeforeDate(cutoffDate: Date): Promise<number> {
    try {
      // Get work sessions from the past few days and clean up stale ones
      const dates: string[] = []
      for (let i = 0; i < 7; i++) {
        const date = new Date(cutoffDate)
        date.setDate(date.getDate() - i)
        // TODO: use a utility function here. We shouldn't do date parsing hardcoded.
        dates.push(date.toISOString().split('T')[0])
      }

      let cleanedCount = 0
      for (const date of dates) {
        const sessions = await this.database.getWorkSessions(date)
        const staleSessions = sessions.filter((session: any) =>
          !session.endTime && new Date(session.startTime) < cutoffDate,
        )

        for (const session of staleSessions) {
          const now = getCurrentTime()
          const elapsedMinutes = Math.floor((now.getTime() - new Date(session.startTime).getTime()) / (1000 * 60))

          await this.database.updateWorkSession(session.id, {
            endTime: now,
            actualMinutes: Math.max(elapsedMinutes, 1), // Ensure at least 1 minute
          })
          cleanedCount++
        }
      }

      logger.ui.info('Cleaned up stale work sessions', { cleanedCount, cutoffDate })
      return cleanedCount
    } catch (error) {
      this.handleSessionError(error as Error, 'clearing stale sessions')
      throw new Error(`Failed to clear stale sessions: ${(error as Error).message}`)
    }
  }

  getCurrentActiveSession(): UnifiedWorkSession | null {
    const sessions = Array.from(this.activeSessions.values())
    logger.ui.warn(`[WorkTrackingService ${this.instanceId}] 🔍 Getting current active session`, {})
      // instanceId: this.instanceId,
      // activeSessionsCount: this.activeSessions.size,
      // hasActiveSession: sessions.length > 0,
      // sessionIds: sessions.map(s => s.id),
    // })

    // Filter out sessions that are paused
    const activeSession = sessions.find(s => !s.isPaused) || null
    if (activeSession) {
      logger.ui.warn(`[WorkTrackingService ${this.instanceId}] Found active (non-paused) session`, {
        // sessionId: activeSession.id,
        // isPaused: activeSession.isPaused,
      // })
    }

    return activeSession
  }

  getCurrentActiveTask(): Task | TaskStep | null {
    // This would need to fetch the actual Task or TaskStep from the database
    // For now, return null as this will be implemented in Phase 2
    return null
  }

  isAnyWorkActive(): boolean {
    return this.activeSessions.size > 0
  }

  async getNextScheduledTask(): Promise<Task | TaskStep | null> {
    // This will be implemented in Phase 2
    return null
  }

  handleSessionError(error: Error, context: string): void {
    logger.ui.error('WorkTrackingService error', {})
      error: error.message,
      context,
    }, 'work-tracking-error')
  }

  // Helper methods for testing
  getPersistenceOptions(): Required<WorkSessionPersistenceOptions> {
    return { ...this.options }
  }

  // Private helper methods
  private findSessionById(sessionId: string): UnifiedWorkSession | null {
    for (const session of this.activeSessions.values()) {
      if (session.id === sessionId) {
        return session
      }
    }
    return null
  }

  private getSessionKey(session: UnifiedWorkSession): string {
    return session.taskId || session.stepId || session.workflowId || 'default'
  }

  private isValidSession(session: any): session is UnifiedWorkSession {
    return (
      session &&
      typeof session.id === 'string' &&
      (session.startTime instanceof Date || typeof session.startTime === 'string') &&
      typeof session.type === 'string' &&
      (typeof session.plannedMinutes === 'number' || typeof session.actualMinutes === 'number')
    )
  }
}
