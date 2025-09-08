/**
 * Types for work tracking service - stubbed for testing
 * These interfaces define the shape of the WorkTrackingService API
 */

import type { WorkSession } from '../../../shared/work-blocks-types'
import type { Task, TaskStep } from '../../../shared/types'

export interface WorkSessionPersistenceOptions {
  clearStaleSessionsOnStartup?: boolean
  maxSessionAgeHours?: number
}

export interface WorkTrackingServiceInterface {
  // Session management
  startWorkSession(taskId?: string, stepId?: string, workflowId?: string): Promise<WorkSession>
  pauseWorkSession(sessionId: string): Promise<void>
  resumeWorkSession(sessionId: string): Promise<void>
  stopWorkSession(sessionId: string): Promise<void>

  // Persistence
  saveActiveSession(session: WorkSession): Promise<void>
  getLastActiveWorkSession(): Promise<WorkSession | null>
  clearStaleSessionsBeforeDate(cutoffDate: Date): Promise<number>

  // Current work tracking
  getCurrentActiveSession(): WorkSession | null
  getCurrentActiveTask(): Task | TaskStep | null
  isAnyWorkActive(): boolean

  // Next task logic (will be implemented in Phase 2)
  getNextScheduledTask(): Promise<Task | TaskStep | null>

  // Error handling
  handleSessionError(error: Error, context: string): void
}
