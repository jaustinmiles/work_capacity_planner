/**
 * UNIFIED WORK SESSION TYPES - Partially Implemented Consolidation
 * 
 * ⚠️  CRITICAL STATUS: This unification is INCOMPLETE despite claims otherwise.
 * This file exists and provides UnifiedWorkSession type, but most of the codebase
 * still uses the OLD session types that this was supposed to replace.
 * 
 * INTENDED PURPOSE (NOT FULLY REALIZED):
 * Replace 5+ duplicate session types scattered across the codebase:
 * - LocalWorkSession (useTaskStore.ts) - ❌ STILL USED
 * - WorkSession (work-blocks-types.ts) - ❌ STILL USED  
 * - WorkSession (workflow-progress-types.ts) - ❌ STILL USED
 * - WorkSession (WorkLoggerCalendar.tsx) - ❌ STILL USED
 * - WorkSession (WorkSessionsModal.tsx) - ❌ STILL USED
 * 
 * WHAT EXISTS (PARTIAL IMPLEMENTATION):
 * ✅ UnifiedWorkSession interface defined
 * ✅ Migration adapter functions created
 * ✅ Some tests use UnifiedWorkSession
 * ✅ Database schema alignment
 * 
 * WHAT'S MISSING (WHY IT'S NOT COMPLETE):
 * ❌ Most UI components still import old session interfaces
 * ❌ Database operations not fully migrated
 * ❌ Old session type files still exist and are imported
 * ❌ No systematic replacement of old types throughout codebase
 * 
 * IMPACT OF INCOMPLETE MIGRATION:
 * - Type confusion and field name mismatches
 * - Multiple session interfaces with overlapping purposes  
 * - Maintenance burden of keeping old and new systems in sync
 * - False documentation claiming this work is "complete"
 * 
 * VERIFICATION:
 * Run `grep -r "LocalWorkSession\|WorkSession" src/` to see all the old types still in use
 * 
 * Last Updated: 2025-09-09 (Added reality check during PR #67 cleanup)
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
  stepId?: string        // For workflow step tracking

  // Time tracking (aligns with database schema)
  startTime: Date
  endTime?: Date         // null = in progress, Date = completed
  plannedMinutes: number // Estimated duration
  actualMinutes?: number // null = in progress, number = completed duration

  // Type and context
  type: TaskType         // 'focused' | 'admin'
  notes?: string

  // Metadata (from database)
  createdAt?: Date
  updatedAt?: Date

  // Computed/UI fields (not persisted, calculated at runtime)
  workflowId?: string    // Computed from stepId relationship
  taskName?: string      // Loaded from task relation
  stepName?: string      // Loaded from step relation
  isPaused?: boolean     // Runtime state for active sessions
  color?: string         // UI color computed from type

  // Legacy compatibility (for migration period)
  duration?: number      // Deprecated: use actualMinutes or computed elapsed
}

/**
 * Migration adapters for converting legacy session types
 */

// Convert LocalWorkSession to UnifiedWorkSession
export function fromLocalWorkSession(session: any): UnifiedWorkSession {
  return {
    id: session.id,
    taskId: session.taskId,
    stepId: session.stepId,
    workflowId: session.workflowId,
    startTime: new Date(session.startTime),
    endTime: session.endTime ? new Date(session.endTime) : undefined,
    plannedMinutes: session.plannedDuration || session.duration || 0,
    actualMinutes: session.duration || undefined, // Convert accumulated duration
    type: session.type,
    isPaused: session.isPaused,
    taskName: session.taskName,
    stepName: session.stepName,
  }
}

// Convert database WorkSession to UnifiedWorkSession
export function fromDatabaseWorkSession(dbSession: any): UnifiedWorkSession {
  return {
    id: dbSession.id,
    taskId: dbSession.taskId,
    stepId: dbSession.stepId,
    startTime: new Date(dbSession.startTime),
    endTime: dbSession.endTime ? new Date(dbSession.endTime) : undefined,
    plannedMinutes: dbSession.plannedMinutes || 0,
    actualMinutes: dbSession.actualMinutes,
    type: dbSession.type as TaskType,
    notes: dbSession.notes,
    createdAt: new Date(dbSession.createdAt),
    updatedAt: new Date(dbSession.updatedAt),
  }
}

// Convert WorkSessionData (clock format) to UnifiedWorkSession
export function fromWorkSessionData(sessionData: any): UnifiedWorkSession {
  // Convert minutes since midnight to Date objects
  const today = new Date()
  const startTime = new Date(today)
  startTime.setHours(0, sessionData.startMinutes, 0, 0)

  const endTime = new Date(today)
  endTime.setHours(0, sessionData.endMinutes, 0, 0)

  const actualMinutes = sessionData.endMinutes - sessionData.startMinutes

  return {
    id: sessionData.id,
    taskId: sessionData.taskId,
    stepId: sessionData.stepId,
    startTime,
    endTime: sessionData.completed ? endTime : undefined,
    plannedMinutes: actualMinutes, // Use actual as estimate for completed sessions
    actualMinutes: sessionData.completed ? actualMinutes : undefined,
    type: sessionData.type,
    notes: sessionData.notes,
    taskName: sessionData.taskName,
    stepName: sessionData.stepName,
    color: sessionData.color,
  }
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
    id: `session-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`,
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
