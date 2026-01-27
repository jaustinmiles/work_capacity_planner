/**
 * Database Service for Renderer Process
 *
 * All operations (database, AI, speech) go through tRPC to the server.
 * Electron main process only handles logging and feedback file operations.
 *
 * This file provides:
 * - Window type declarations for Electron-specific APIs (logging, feedback)
 * - getDatabase() function that returns the tRPC database service
 */

import { getTrpcDatabase, TrpcDatabaseService } from './database-trpc'

// Type for the Electron API exposed by preload script
// All data operations (database, AI, speech) go through tRPC
declare global {
  interface Window {
    electronAPI?: {
      // Logging operations
      log?: (level: string, scope: string, message: string, data?: unknown) => void
      sendLog?: (channel: string, payload: unknown) => void
      persistLog?: (logEntry: unknown) => Promise<void>
      persistLogs?: (logs: unknown[]) => Promise<void>
      onMainLog?: (callback: (entry: unknown) => void) => void

      // Feedback operations (file-based, Electron-specific)
      saveFeedback?: (feedback: unknown) => Promise<boolean>
      readFeedback?: () => Promise<unknown[]>
      loadFeedback?: () => Promise<unknown[]>
      updateFeedback?: (updatedFeedback: unknown) => Promise<boolean>

      // App metadata
      getSessionId?: () => Promise<string>
    }
  }
}

// Singleton instance
let dbInstance: TrpcDatabaseService | null = null

/**
 * Get the database service instance.
 *
 * All operations go through tRPC to the PostgreSQL server.
 */
export const getDatabase = (): TrpcDatabaseService => {
  if (!dbInstance) {
    dbInstance = getTrpcDatabase()
  }
  return dbInstance
}

// Re-export for direct access when needed
export { getTrpcDatabase }
export type { TrpcDatabaseService }
