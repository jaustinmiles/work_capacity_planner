/**
 * UNIFIED WORK SESSION TYPES - Single Source of Truth
 *
 * ✅ COMPLETED: All work session types consolidated into UnifiedWorkSession
 *
 * This file provides the single UnifiedWorkSession type used throughout the codebase.
 * All duplicate session types have been removed:
 * - LocalWorkSession (useTaskStore.ts) - ✅ DELETED
 * - WorkSession (work-blocks-types.ts) - ✅ DELETED
 * - WorkSession (workflow-progress-types.ts) - ✅ DELETED
 * - WorkSession (WorkLoggerCalendar.tsx) - ✅ DELETED
 * - WorkSession (WorkSessionsModal.tsx) - ✅ DELETED
 * - WorkSession (StepWorkSessionsModal.tsx) - ✅ DELETED
 *
 * ARCHITECTURE:
 * - UnifiedWorkSession flows unchanged through all layers
 * - Date objects used throughout (no string conversions in data layer)
 * - Formatting happens only at render time
 * - UI state (dirty/new) tracked separately from domain data
 *
 * Last Updated: 2025-10-02 (Completed unification)
 */

import { TaskType } from './enums'

/**
 * Unified work session structure that serves as single source of truth
 * Maps directly to database WorkSession model
 */
export interface UnifiedWorkSession {
  // Core identification
  id: string
  taskId: string
  stepId?: string  | undefined;       // For workflow step tracking

  // Time tracking (aligns with database schema)
  startTime: Date
  endTime?: Date         // null = in progress, Date = completed
  plannedMinutes: number // Estimated duration
  actualMinutes?: number // null = in progress, number = completed duration

  // Type and context
  /** @deprecated The type should be derived from the task itself, not stored in the session */
  type: TaskType         // 'focused' | 'admin' | 'personal' - DEPRECATED: derive from task
  notes?: string | undefined

  // Metadata (from database)
  createdAt?: Date
  updatedAt?: Date

  // Computed/UI fields (not persisted, calculated at runtime)
  workflowId?: string | undefined    // Computed from stepId relationship
  taskName?: string | undefined      // Loaded from task relation
  stepName?: string | undefined     // Loaded from step relation
  isPaused?: boolean | undefined     // Runtime state for active sessions
  color?: string | undefined         // UI color computed from type
}

/**
 * Migration adapters for converting legacy session types
 */

// Convert LocalWorkSession to UnifiedWorkSession
export function fromLocalWorkSession(session: any): UnifiedWorkSession {
  const result: UnifiedWorkSession = {
    id: session.id,
    taskId: session.taskId,
    startTime: new Date(session.startTime),
    plannedMinutes: session.plannedDuration || session.duration || 0,
    type: session.type, // @deprecated - should derive from task
  }

  // Add optional fields only if they have values
  if (session.stepId !== undefined) result.stepId = session.stepId
  if (session.workflowId !== undefined) result.workflowId = session.workflowId
  if (session.endTime) result.endTime = new Date(session.endTime)
  if (session.duration !== undefined) result.actualMinutes = session.duration
  if (session.isPaused !== undefined) result.isPaused = session.isPaused
  if (session.taskName !== undefined) result.taskName = session.taskName
  if (session.stepName !== undefined) result.stepName = session.stepName

  return result
}

// Convert database WorkSession to UnifiedWorkSession
export function fromDatabaseWorkSession(dbSession: any): UnifiedWorkSession {
  const result: UnifiedWorkSession = {
    id: dbSession.id,
    taskId: dbSession.taskId,
    startTime: new Date(dbSession.startTime),
    plannedMinutes: dbSession.plannedMinutes || 0,
    type: dbSession.type as TaskType, // @deprecated - should derive from task
  }

  // Add optional fields only if they have values
  if (dbSession.stepId !== undefined && dbSession.stepId !== null) result.stepId = dbSession.stepId
  if (dbSession.endTime) result.endTime = new Date(dbSession.endTime)
  if (dbSession.actualMinutes !== undefined && dbSession.actualMinutes !== null) result.actualMinutes = dbSession.actualMinutes
  if (dbSession.notes !== undefined && dbSession.notes !== null) result.notes = dbSession.notes
  if (dbSession.createdAt) result.createdAt = new Date(dbSession.createdAt)
  if (dbSession.updatedAt) result.updatedAt = new Date(dbSession.updatedAt)
  if (dbSession.workflowId !== undefined && dbSession.workflowId !== null) result.workflowId = dbSession.workflowId
  if (dbSession.taskName !== undefined && dbSession.taskName !== null) result.taskName = dbSession.taskName
  if (dbSession.stepName !== undefined && dbSession.stepName !== null) result.stepName = dbSession.stepName

  return result
}

// Convert WorkSessionData (clock format) to UnifiedWorkSession
export function fromWorkSessionData(sessionData: any): UnifiedWorkSession {
  // Convert minutes since midnight to Date objects
  const today = new Date()
  const startTime = new Date(today)
  startTime.setHours(0, sessionData.startMinutes, 0, 0)

  const actualMinutes = sessionData.endMinutes - sessionData.startMinutes

  const result: UnifiedWorkSession = {
    id: sessionData.id,
    taskId: sessionData.taskId,
    startTime,
    plannedMinutes: actualMinutes, // Use actual as estimate for completed sessions
    type: sessionData.type, // @deprecated - should derive from task
  }

  // Add optional fields only if they have values
  if (sessionData.stepId !== undefined && sessionData.stepId !== null) result.stepId = sessionData.stepId
  if (sessionData.completed && sessionData.endMinutes) {
    const endTime = new Date(today)
    endTime.setHours(0, sessionData.endMinutes, 0, 0)
    result.endTime = endTime
    result.actualMinutes = actualMinutes
  }
  if (sessionData.notes !== undefined && sessionData.notes !== null) result.notes = sessionData.notes
  if (sessionData.taskName !== undefined && sessionData.taskName !== null) result.taskName = sessionData.taskName
  if (sessionData.stepName !== undefined && sessionData.stepName !== null) result.stepName = sessionData.stepName
  if (sessionData.color !== undefined && sessionData.color !== null) result.color = sessionData.color

  return result
}

// Convert UnifiedWorkSession to database format
export function toDatabaseWorkSession(session: UnifiedWorkSession): any {
  return {
    id: session.id,
    taskId: session.taskId,
    stepId: session.stepId || null,
    patternId: null, // Not used in current implementation
    type: session.type,
    startTime: session.startTime,
    endTime: session.endTime || null,
    plannedMinutes: session.plannedMinutes,
    actualMinutes: session.actualMinutes || null,
    notes: session.notes || null,
    // createdAt/updatedAt handled by database
  }
}

/**
 * Utility functions for session management
 */

// Check if session is currently active (not completed)
export function isActiveSession(session: UnifiedWorkSession): boolean {
  return !session.endTime && !session.actualMinutes
}

// Check if session is paused
export function isPausedSession(session: UnifiedWorkSession): boolean {
  return session.isPaused === true
}

// Get elapsed minutes for active session
export function getElapsedMinutes(session: UnifiedWorkSession): number {
  if (session.actualMinutes) {
    return session.actualMinutes // Completed session
  }

  if (!session.endTime) {
    // Active session - calculate elapsed time
    const elapsed = Date.now() - session.startTime.getTime()
    return Math.floor(elapsed / 60000) // Convert to minutes
  }

  // Ended but not marked complete
  const elapsed = session.endTime.getTime() - session.startTime.getTime()
  return Math.floor(elapsed / 60000)
}

// Get UI color for session type
export function getSessionColor(session: UnifiedWorkSession): string {
  return session.color || (session.type === TaskType.Focused ? '#165DFF' : '#00B42A')
}

// Create new session with defaults
export function createUnifiedWorkSession(params: {
  id?: string  // ID is now optional - database will generate if not provided
  taskId: string
  stepId?: string
  type: TaskType
  plannedMinutes: number
  workflowId?: string
  taskName?: string
  stepName?: string
}): UnifiedWorkSession {
  const now = new Date()

  return {
    // Only generate ID if not provided (for compatibility)
    // Database should generate the real ID
    id: params.id || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    taskId: params.taskId,
    stepId: params.stepId,
    workflowId: params.workflowId,
    startTime: now,
    plannedMinutes: params.plannedMinutes,
    type: params.type,
    createdAt: now,
    updatedAt: now,
    taskName: params.taskName,
    stepName: params.stepName,
    color: getSessionColor({ type: params.type } as UnifiedWorkSession),
  }
}
