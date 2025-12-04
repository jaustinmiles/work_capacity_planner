/**
 * Shared types for the logging system
 * Used across main process, preload, and renderer
 */

/** Log levels supported by the application */
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

/** Log sources indicating where the log originated */
export type LogSource = 'main' | 'renderer' | 'worker'

/** Options for querying logs from the database */
export interface LogQueryOptions {
  /** Filter by session ID */
  sessionId?: string
  /** Filter by log level */
  level?: LogLevel
  /** Filter by log source */
  source?: LogSource
  /** Only return logs created after this date (ISO string for IPC, Date for internal) */
  since?: string
  /** Maximum number of logs to return (default: 100) */
  limit?: number
}

/** Internal version with Date type for database queries */
export interface LogQueryOptionsInternal {
  sessionId?: string
  level?: string
  source?: string
  since?: Date
  limit?: number
}

/** A log entry as stored in the database */
export interface LogEntry {
  id: string
  level: string
  message: string
  source: string
  context: string
  sessionId: string | null
  createdAt: string
}

/** A log entry with Date type for internal use */
export interface LogEntryInternal {
  id: string
  level: string
  message: string
  source: string
  context: string
  sessionId: string | null
  createdAt: Date
}

/** Summary of logs for a session */
export interface SessionLogSummary {
  sessionId: string
  logCount: number
}
