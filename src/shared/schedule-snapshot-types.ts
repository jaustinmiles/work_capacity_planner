/**
 * Schedule Snapshot Types
 *
 * Types for capturing and storing schedule state at a point in time.
 * Used for "freeze schedule" feature to compare planned vs actual time use.
 */

import { ScheduleResult, SchedulingDebugInfo, SchedulingMetrics } from './unified-scheduler'

/**
 * The serializable data captured in a schedule snapshot.
 * Contains all necessary information to display the planned schedule state.
 */
export interface ScheduleSnapshotData {
  /** When the snapshot was captured */
  capturedAt: string // ISO date string for serialization

  /** The scheduled items at time of capture */
  scheduledItems: SchedulingDebugInfo['scheduledItems']

  /** Items that couldn't be scheduled */
  unscheduledItems: SchedulingDebugInfo['unscheduledItems']

  /** Block utilization at time of capture */
  blockUtilization: SchedulingDebugInfo['blockUtilization']

  /** Scheduling metrics at time of capture */
  metrics: SchedulingMetrics | null

  /** Any warnings from the scheduler */
  warnings: string[]

  /** Total items scheduled */
  totalScheduled: number

  /** Total items unscheduled */
  totalUnscheduled: number

  /** Schedule efficiency percentage */
  scheduleEfficiency: number
}

/**
 * A complete schedule snapshot entity.
 * Represents a "frozen" view of the schedule at a specific point in time.
 */
export interface ScheduleSnapshot {
  /** Unique identifier for this snapshot */
  id: string

  /** Session this snapshot belongs to */
  sessionId: string

  /** When the snapshot was created */
  createdAt: Date

  /** Optional user-provided label (e.g., "Morning Plan", "After Standup") */
  label: string | null

  /** The captured schedule data */
  data: ScheduleSnapshotData
}

/**
 * Database record representation (dates as strings).
 */
export interface ScheduleSnapshotRecord {
  id: string
  sessionId: string
  createdAt: string
  label: string | null
  snapshotData: string // JSON serialized ScheduleSnapshotData
}

/**
 * Create snapshot data from a ScheduleResult.
 */
export function createSnapshotData(
  result: ScheduleResult,
  capturedAt: Date,
): ScheduleSnapshotData {
  return {
    capturedAt: capturedAt.toISOString(),
    scheduledItems: result.debugInfo.scheduledItems,
    unscheduledItems: result.debugInfo.unscheduledItems,
    blockUtilization: result.debugInfo.blockUtilization,
    metrics: result.metrics ?? null,
    warnings: result.debugInfo.warnings,
    totalScheduled: result.debugInfo.totalScheduled,
    totalUnscheduled: result.debugInfo.totalUnscheduled,
    scheduleEfficiency: result.debugInfo.scheduleEfficiency,
  }
}

/**
 * Serialize snapshot data for database storage.
 */
export function serializeSnapshotData(data: ScheduleSnapshotData): string {
  return JSON.stringify(data)
}

/**
 * Deserialize snapshot data from database storage.
 */
export function deserializeSnapshotData(json: string): ScheduleSnapshotData {
  return JSON.parse(json) as ScheduleSnapshotData
}

/**
 * Convert a database record to a ScheduleSnapshot entity.
 */
export function recordToSnapshot(record: ScheduleSnapshotRecord): ScheduleSnapshot {
  return {
    id: record.id,
    sessionId: record.sessionId,
    createdAt: new Date(record.createdAt),
    label: record.label,
    data: deserializeSnapshotData(record.snapshotData),
  }
}

/**
 * Convert a ScheduleSnapshot entity to a database record.
 */
export function snapshotToRecord(snapshot: ScheduleSnapshot): ScheduleSnapshotRecord {
  return {
    id: snapshot.id,
    sessionId: snapshot.sessionId,
    createdAt: snapshot.createdAt.toISOString(),
    label: snapshot.label,
    snapshotData: serializeSnapshotData(snapshot.data),
  }
}
