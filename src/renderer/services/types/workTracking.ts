/**
 * Types for work tracking service - stubbed for testing
 * These interfaces define the shape of the WorkTrackingService API
 */

export interface ActiveWorkSession {
  id: string
  taskId?: string
  stepId?: string
  workflowId?: string
  startTime: Date
  pausedAt?: Date
  duration: number // minutes of active work
  sessionId: string
  createdAt: Date
  updatedAt: Date
}

export interface LocalWorkSession {
  id: string
  taskId?: string
  stepId?: string
  workflowId?: string
  startTime: Date
  pausedAt?: Date
  duration: number // minutes accumulated before current session
  isPaused: boolean
}

export interface WorkSessionPersistenceOptions {
  clearStaleSessionsOnStartup?: boolean
  maxSessionAgeHours?: number
}

export interface NextTaskCandidate {
  id: string
  name: string
  type: 'task' | 'step'
  parentWorkflowId?: string
  priorityScore: number
  isBlocked: boolean
  scheduledStartTime?: Date
}

export interface WorkTrackingServiceInterface {
  // Session management
  startWorkSession(taskId?: string, stepId?: string, workflowId?: string): Promise<ActiveWorkSession>
  pauseWorkSession(sessionId: string): Promise<void>
  resumeWorkSession(sessionId: string): Promise<void>
  stopWorkSession(sessionId: string): Promise<void>

  // Persistence
  saveActiveSession(session: LocalWorkSession): Promise<void>
  restoreActiveSessions(): Promise<Map<string, LocalWorkSession>>
  clearStaleSessionsBeforeDate(cutoffDate: Date): Promise<number>

  // Current work tracking
  getCurrentActiveSession(): LocalWorkSession | null
  getCurrentActiveTask(): NextTaskCandidate | null
  isAnyWorkActive(): boolean

  // Next task logic (will be implemented in Phase 2)
  getNextScheduledTask(): Promise<NextTaskCandidate | null>

  // Error handling
  handleSessionError(error: Error, context: string): void
}
