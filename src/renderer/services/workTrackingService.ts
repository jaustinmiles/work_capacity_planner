import { logger } from '../utils/logger'
import { getDatabase } from './database'
import type {
  WorkSessionPersistenceOptions,
  WorkTrackingServiceInterface,
  WorkSession,
} from './types/workTracking'
import type { Task, TaskStep } from '../../shared/types'

/**
 * WorkTrackingService - Manages active work sessions with database persistence
 */
// We'll store active work sessions using the existing work session infrastructure
// and track which ones are "active" vs "completed" in the session data

export class WorkTrackingService implements WorkTrackingServiceInterface {
  private activeSessions: Map<string, WorkSession> = new Map()
  private options: Required<WorkSessionPersistenceOptions>
  private database: ReturnType<typeof getDatabase>

  constructor(options: WorkSessionPersistenceOptions = {}, database?: ReturnType<typeof getDatabase>) {
    this.options = {
      clearStaleSessionsOnStartup: true,
      maxSessionAgeHours: 24,
      ...options,
    }
    this.database = database || getDatabase()
  }

  async initialize(): Promise<void> {
    try {
      // Clear stale sessions if enabled
      if (this.options.clearStaleSessionsOnStartup) {
        const cutoffDate = new Date(Date.now() - this.options.maxSessionAgeHours * 60 * 60 * 1000)
        await this.clearStaleSessionsBeforeDate(cutoffDate)
      }

      // Restore last active session by looking for work sessions without endTime from today
      const today = new Date().toISOString().split('T')[0]
      const todaysSessions = await this.database.getWorkSessions(today)
      const activeSessions = todaysSessions.filter((session: any) => !session.endTime)

      if (activeSessions.length > 0) {
        const lastSession = activeSessions[activeSessions.length - 1]
        if (this.isValidSession(lastSession)) {
          // Check if session is stale
          const sessionAge = Date.now() - new Date(lastSession.startTime).getTime()
          const maxAgeMs = this.options.maxSessionAgeHours * 60 * 60 * 1000

          if (sessionAge > maxAgeMs && this.options.clearStaleSessionsOnStartup) {
            logger.store.info('Deleting stale session', { sessionId: lastSession.id })
            await this.database.deleteWorkSession(lastSession.id)
          } else {
            // Convert database session to our WorkSession format
            const workSession: WorkSession = {
              ...lastSession,
              startTime: new Date(lastSession.startTime),
              endTime: lastSession.endTime ? new Date(lastSession.endTime) : undefined,
            }
            const sessionKey = this.getSessionKey(workSession)
            this.activeSessions.set(sessionKey, workSession)
            logger.store.info('Restored active work session', { sessionId: workSession.id })
          }
        }
      }
    } catch (error) {
      logger.store.error('Failed to initialize WorkTrackingService', error)
      throw error
    }
  }

  async startWorkSession(taskId?: string, stepId?: string, workflowId?: string): Promise<WorkSession> {
    try {
      // Validate inputs
      if (!taskId && !stepId) {
        throw new Error('Must provide either taskId or stepId to start work session')
      }
      if (taskId && stepId) {
        throw new Error('Cannot provide both taskId and stepId for a work session')
      }

      // Check for existing active session
      if (this.activeSessions.size > 0) {
        throw new Error('Cannot start new work session: another session is already active')
      }

      // Get current session info from database
      const currentSession = await this.database.getCurrentSession()

      // Create new work session
      const workSession: WorkSession = {
        id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId,
        stepId,
        workflowId,
        startTime: new Date(),
        type: 'focused',
        plannedDuration: 60, // Default 1 hour
        duration: 0, // Initial duration
      }

      // Save to database as an active work session (no endTime)
      await this.database.createWorkSession({
        ...workSession,
        sessionId: currentSession?.id || 'session-1',
        date: new Date().toISOString().split('T')[0],
        // Don't set endTime - indicates this is active
      })

      // Store in local state
      const sessionKey = this.getSessionKey(workSession)
      this.activeSessions.set(sessionKey, workSession)

      logger.store.info('Started work session', {
        sessionId: workSession.id,
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
      const session = this.findSessionById(sessionId)
      if (!session) {
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

      logger.store.info('Paused work session', { sessionId })
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

      logger.store.info('Resumed work session', { sessionId })
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
      session.actualDuration = Math.floor((session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60))

      // Remove from active sessions
      const sessionKey = this.getSessionKey(session)
      this.activeSessions.delete(sessionKey)

      // Update database with end time (marks as completed, not active)
      await this.database.updateWorkSession(session.id, {
        endTime: session.endTime,
        actualDuration: session.actualDuration,
      })

      logger.store.info('Stopped work session', {
        sessionId,
        actualDuration: session.actualDuration,
      })
    } catch (error) {
      this.handleSessionError(error as Error, 'stopping work session')
      throw error
    }
  }

  async saveActiveSession(session: WorkSession): Promise<void> {
    try {
      const result = await this.database.updateWorkSession(session.id, {
        ...session,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime?.toISOString(),
      })
      logger.store.debug('Saved active work session', { sessionId: session.id })
      return result
    } catch (error) {
      this.handleSessionError(error as Error, 'saving active session')
      throw error
    }
  }

  async getLastActiveWorkSession(): Promise<WorkSession | null> {
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

      // Convert to WorkSession format
      return {
        ...lastSession,
        startTime: new Date(lastSession.startTime),
        endTime: lastSession.endTime ? new Date(lastSession.endTime) : undefined,
      }
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

      logger.store.info('Cleared stale work sessions', { clearedCount, cutoffDate })
      return clearedCount
    } catch (error) {
      this.handleSessionError(error as Error, 'clearing stale sessions')
      throw new Error(`Failed to clear stale sessions: ${(error as Error).message}`)
    }
  }

  getCurrentActiveSession(): WorkSession | null {
    const sessions = Array.from(this.activeSessions.values())
    return sessions.length > 0 ? sessions[0] : null
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
    logger.store.error(`WorkTrackingService error in ${context}:`, error)
  }

  // Helper methods for testing
  getPersistenceOptions(): Required<WorkSessionPersistenceOptions> {
    return { ...this.options }
  }

  // Private helper methods
  private findSessionById(sessionId: string): WorkSession | null {
    for (const session of this.activeSessions.values()) {
      if (session.id === sessionId) {
        return session
      }
    }
    return null
  }

  private getSessionKey(session: WorkSession): string {
    return session.taskId || session.stepId || session.workflowId || 'default'
  }

  private isValidSession(session: any): session is WorkSession {
    return (
      session &&
      typeof session.id === 'string' &&
      (session.startTime instanceof Date || typeof session.startTime === 'string') &&
      typeof session.type === 'string' &&
      (typeof session.plannedDuration === 'number' || typeof session.actualDuration === 'number')
    )
  }
}
