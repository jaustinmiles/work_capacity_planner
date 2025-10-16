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
    logger.ui.info(`[WorkTrackingService] Instance created: ${this.instanceId}`, {    startTime: activeSession.startTime.toISOString(),
      })
    } else {
      logger.ui.info('[WorkTrackingService] No active sessions to restore')
    }

    logger.ui.info('[WorkTrackingService] Initialization complete', {    actualMinutes: Math.max(elapsedMinutes, 1), // Ensure at least 1 minute
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

      logger.ui.info('Stopped work session', {    actualMinutes: Math.max(elapsedMinutes, 1), // Ensure at least 1 minute
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
