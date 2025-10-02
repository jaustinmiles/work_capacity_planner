import { logger } from '@/shared/logger'
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
    this.instanceId = `WTS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    logger.ui.warn(`[WorkTrackingService] 🔴 NEW INSTANCE CREATED: ${this.instanceId}`, {
      instanceId: this.instanceId,
      stackTrace: new Error().stack,
    })

    this.options = {
      clearStaleSessionsOnStartup: true,
      maxSessionAgeHours: 24,
      ...options,
    }
    this.database = database || getDatabase()
  }

  async initialize(): Promise<void> {
    try {
      // Clear local state first - ALWAYS start fresh
      this.activeSessions.clear()
      logger.ui.info('[WorkTrackingService] Cleared all local active sessions on initialization')

      // Clear stale sessions if enabled
      if (this.options.clearStaleSessionsOnStartup) {
        const cutoffDate = new Date(Date.now() - this.options.maxSessionAgeHours * 60 * 60 * 1000)
        await this.clearStaleSessionsBeforeDate(cutoffDate)
      }

      // DO NOT restore sessions - always start with clean slate
      // This prevents stale sessions from blocking new work
      logger.ui.info('[WorkTrackingService] Initialization complete - starting with no active sessions')
    } catch (error) {
      logger.ui.error('Failed to initialize WorkTrackingService', error)
      throw error
    }
  }

  async startWorkSession(taskId?: string, stepId?: string, workflowId?: string): Promise<UnifiedWorkSession> {
    try {
      logger.ui.warn(`[WorkTrackingService ${this.instanceId}] 🟢 Starting work session`, {
        instanceId: this.instanceId,
        taskId, stepId, workflowId,
        currentActiveSessions: this.activeSessions.size,
        activeSessionIds: Array.from(this.activeSessions.keys()),
      })

      // Validate inputs
      if (!taskId && !stepId) {
        throw new Error('Must provide either taskId or stepId to start work session')
      }
      if (taskId && stepId) {
        throw new Error('Cannot provide both taskId and stepId for a work session')
      }

      // Check for existing active session
      if (this.activeSessions.size > 0) {
        logger.ui.warn('[WorkTrackingService] Cannot start new session - another session is active', {
          activeSessionCount: this.activeSessions.size,
        })
        throw new Error('Cannot start new work session: another session is already active')
      }

      // Get current session info from database
      const currentSession = await this.database.getCurrentSession()

      // Create new unified work session
      const workSession = createUnifiedWorkSession({
        taskId: workflowId || taskId || '',
        stepId,
        type: TaskType.Focused,
        plannedMinutes: 60, // Default 1 hour
        workflowId,
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

      logger.ui.info('[WorkTrackingService] Creating database work session', {
        dbPayload: {
          ...dbPayload,
          startTime: dbPayload.startTime.toISOString(),
        },
      })

      await this.database.createWorkSession(dbPayload)

      // Store in local state
      const sessionKey = this.getSessionKey(workSession)
      this.activeSessions.set(sessionKey, workSession)

      logger.ui.info('[WorkTrackingService] Work session started successfully', {
        sessionId: workSession.id,
        sessionKey,
        taskId,
        stepId,
        workflowId,
      })

      return workSession
    } catch (error) {
      this.handleSessionError(error as Error, 'starting work session')
      throw new Error(`Failed to start work session: ${(error as Error).message}`)
    }
  }

  async pauseWorkSession(sessionId: string): Promise<void> {
    try {
      logger.ui.warn(`[WorkTrackingService ${this.instanceId}] 🟡 Attempting to pause session`, {
        instanceId: this.instanceId,
        sessionId,
        activeSessionsCount: this.activeSessions.size,
        activeSessionIds: Array.from(this.activeSessions.keys()),
      })

      const session = this.findSessionById(sessionId)
      if (!session) {
        logger.ui.error(`[WorkTrackingService ${this.instanceId}] ❌ PAUSE FAILED: No session found`, {
          instanceId: this.instanceId,
          requestedSessionId: sessionId,
          availableSessions: Array.from(this.activeSessions.values()).map(s => ({ id: s.id, stepId: s.stepId })),
        })
        throw new Error(`No active session found with ID: ${sessionId}`)
      }

      // Add isPaused property for test compatibility
      ;(session as any).isPaused = true
      ;(session as any).pausedAt = new Date()

      // Update database with pause state
      await this.database.updateWorkSession(session.id, {
        isPaused: true,
        pausedAt: new Date(),
      })

      logger.ui.info('Paused work session', { sessionId })
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

      logger.ui.info('Stopped work session', {
        sessionId,
        actualMinutes: session.actualMinutes,
      })
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
      // Get today's work sessions and find active ones (no endTime)
      const today = new Date().toISOString().split('T')[0]
      const sessions = await this.database.getWorkSessions(today)
      const activeSessions = sessions.filter((session: any) => !session.endTime)

      if (activeSessions.length === 0) {
        return null
      }

      // Get the most recent active session
      const lastSession = activeSessions[activeSessions.length - 1]
      if (!this.isValidSession(lastSession)) {
        return null
      }

      // Convert to unified format
      return fromDatabaseWorkSession(lastSession)
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
        dates.push(date.toISOString().split('T')[0])
      }

      let clearedCount = 0
      for (const date of dates) {
        const sessions = await this.database.getWorkSessions(date)
        const staleSessions = sessions.filter((session: any) =>
          !session.endTime && new Date(session.startTime) < cutoffDate,
        )

        for (const session of staleSessions) {
          await this.database.deleteWorkSession(session.id)
          clearedCount++
        }
      }

      logger.ui.info('Cleared stale work sessions', { clearedCount, cutoffDate })
      return clearedCount
    } catch (error) {
      this.handleSessionError(error as Error, 'clearing stale sessions')
      throw new Error(`Failed to clear stale sessions: ${(error as Error).message}`)
    }
  }

  getCurrentActiveSession(): UnifiedWorkSession | null {
    const sessions = Array.from(this.activeSessions.values())
    logger.ui.warn(`[WorkTrackingService ${this.instanceId}] 🔍 Getting current active session`, {
      instanceId: this.instanceId,
      activeSessionsCount: this.activeSessions.size,
      hasActiveSession: sessions.length > 0,
      sessionIds: sessions.map(s => s.id),
    })

    // Filter out sessions that are paused
    const activeSession = sessions.find(s => !s.isPaused) || null
    if (activeSession) {
      logger.ui.warn(`[WorkTrackingService ${this.instanceId}] Found active (non-paused) session`, {
        sessionId: activeSession.id,
        isPaused: activeSession.isPaused,
      })
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
    logger.ui.error(`WorkTrackingService error in ${context}:`, error)
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
