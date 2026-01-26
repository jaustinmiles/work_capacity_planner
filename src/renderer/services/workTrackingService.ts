import { logger } from '@/logger'
import { getDatabase } from './database'
import type { Task, TaskStep } from '../../shared/types'
import {
  UnifiedWorkSession,
  fromDatabaseWorkSession,
  toDatabaseWorkSession,
  createUnifiedWorkSession,
} from '../../shared/unified-work-session-types'
import { getCurrentTime } from '@/shared/time-provider'
import { dateToYYYYMMDD, addDays } from '@/shared/time-utils'

/**
 * Options for work session persistence behavior
 */
export interface WorkSessionPersistenceOptions {
  clearStaleSessionsOnStartup?: boolean
  maxSessionAgeHours?: number
}

/**
 * WorkTrackingService - Manages active work sessions with database persistence
 */

export class WorkTrackingService {
  private activeSessions: Map<string, UnifiedWorkSession> = new Map()
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
    // Clear local state first
    this.activeSessions.clear()

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
    }
  }

  async startWorkSession(taskId?: string, stepId?: string, workflowId?: string): Promise<UnifiedWorkSession> {
    try {
      // Stop any active time sink session (mutual exclusivity)
      // Using dynamic import to avoid circular dependency with useTaskStore
      const { useTimeSinkStore } = await import('../store/useTimeSinkStore')
      const timeSinkState = useTimeSinkStore.getState()
      if (timeSinkState.activeSinkSession) {
        logger.system.info('Stopping active time sink to start work session', {
          timeSinkSessionId: timeSinkState.activeSinkSession.id,
          taskId,
          stepId,
        }, 'work-stopping-time-sink')
        await timeSinkState.stopSession()
      }

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

      // Fetch task and step names for display
      let taskName: string | undefined
      let stepName: string | undefined
      let plannedMinutes: number | undefined

      if (workflowId && stepId) {
        // For workflow steps, get the workflow task and find the specific step
        const workflow = await this.database.getTaskById(workflowId)
        if (workflow?.steps) {
          const step = workflow.steps.find((s: any) => s.id === stepId)
          if (step) {
            stepName = step.name
            taskName = workflow.name // Also include workflow name for context
            // Use the step's duration as planned minutes (no default)
            plannedMinutes = step.duration
          }
        }
      } else if (taskId) {
        // For regular tasks, just get the task name
        const task = await this.database.getTaskById(taskId)
        if (task) {
          taskName = task.name
          // Use the task's duration as planned minutes (no default)
          plannedMinutes = task.duration
        }
      }

      // Create new unified work session (without ID - database will generate)
      const dbTaskId = workflowId || taskId
      if (!dbTaskId) {
        throw new Error('Either taskId or workflowId must be provided for work session')
      }

      const sessionParams: Parameters<typeof createUnifiedWorkSession>[0] = {
        taskId: dbTaskId,
        type: '', // Will be set from task/step type
        plannedMinutes, // Use actual task/step duration
      }

      // Only add optional fields if they have values
      if (stepId) sessionParams.stepId = stepId
      if (workflowId) sessionParams.workflowId = workflowId
      if (taskName) sessionParams.taskName = taskName
      if (stepName) sessionParams.stepName = stepName

      const workSession = createUnifiedWorkSession(sessionParams)

      // Set runtime state
      workSession.isPaused = false

      // Save to database as an active work session (no endTime)
      // For workflows: taskId = workflowId, stepId = stepId
      // For regular tasks: taskId = taskId, stepId = undefined
      const dbPayload = toDatabaseWorkSession(workSession)

      // Create session in database and get the database-generated ID
      const dbSession = await this.database.createWorkSession(dbPayload)

      // Update the work session with the database-generated ID
      workSession.id = dbSession.id

      // Store in local state with the correct database ID
      const sessionKey = this.getSessionKey(workSession)
      this.activeSessions.set(sessionKey, workSession)

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
      session.endTime = getCurrentTime()

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
    } catch (error) {
      this.handleSessionError(error as Error, 'stopping work session')
      throw error
    }
  }

  async saveActiveSession(session: UnifiedWorkSession): Promise<void> {
    try {
      const dbData = toDatabaseWorkSession(session)
      const result = await this.database.updateWorkSession(session.id, dbData)
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
        return null
      }

      if (!this.isValidSession(activeSession)) {
        return null
      }

      // Convert to unified format
      const unified = fromDatabaseWorkSession(activeSession)

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
        const date = addDays(cutoffDate, -i)
        const dateStr = dateToYYYYMMDD(date)
        dates.push(dateStr)
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

      return cleanedCount
    } catch (error) {
      this.handleSessionError(error as Error, 'clearing stale sessions')
      throw new Error(`Failed to clear stale sessions: ${(error as Error).message}`)
    }
  }

  getCurrentActiveSession(): UnifiedWorkSession | null {
    const sessions = Array.from(this.activeSessions.values())

    // Filter out sessions that are paused
    const activeSession = sessions.find(s => !s.isPaused) || null

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
    logger.ui.error('WorkTrackingService error', {
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
    // For workflow steps, always use workflowId as key
    // For regular tasks, use taskId
    // This ensures consistency across the system
    if (session.workflowId && session.stepId) {
      return session.workflowId
    }
    if (!session.taskId) {
      throw new Error('Session must have either workflowId or taskId')
    }
    return session.taskId
  }

  private isValidSession(session: any): session is UnifiedWorkSession {
    return (
      session &&
      typeof session.id === 'string' &&
      (session.startTime instanceof Date || typeof session.startTime === 'string') &&
      // type is nullable in the database schema (String?), so accept null/undefined
      // fromDatabaseWorkSession() will default it to '' for the UI
      (session.type === null || session.type === undefined || typeof session.type === 'string') &&
      (typeof session.plannedMinutes === 'number' || typeof session.actualMinutes === 'number')
    )
  }
}
