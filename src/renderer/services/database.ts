/**
 * Database Service for Renderer Process
 *
 * All database operations go through tRPC to the PostgreSQL server.
 * The IPC-based local mode has been deprecated.
 *
 * This file provides:
 * - Window type declarations for Electron-specific APIs (AI, Speech)
 * - getDatabase() function that returns the tRPC database service
 */

import { AICallOptions } from '@shared/types'
import { getTrpcDatabase, TrpcDatabaseService } from './database-trpc'

// Type for the Electron API exposed by preload script
// Note: Database operations (db.*) are no longer available via IPC - use tRPC instead
declare global {
  interface Window {
    electronAPI?: {
      // Database operations - DEPRECATED (throws helpful error)
      // All database operations now go through tRPC
      db: Record<string, (...args: unknown[]) => never>

      // AI operations (for Electron desktop - web uses tRPC)
      ai: {
        extractTasksFromBrainstorm: (brainstormText: string) => Promise<{
          tasks: Array<{
            name: string
            description: string
            estimatedDuration: number
            importance: number
            urgency: number
            type: string
            needsMoreInfo?: boolean
          }>
          summary: string
        }>
        extractJargonTerms: (contextText: string) => Promise<string>
        extractWorkflowsFromBrainstorm: (
          brainstormText: string,
          jobContext?: string,
        ) => Promise<{
          workflows: Array<{
            name: string
            description: string
            importance: number
            urgency: number
            type: string
            steps: unknown[]
            totalDuration: number
            earliestCompletion: string
            worstCaseCompletion: string
            notes: string
          }>
          standaloneTasks: Array<{
            name: string
            description: string
            estimatedDuration: number
            importance: number
            urgency: number
            type: string
            needsMoreInfo?: boolean
          }>
          summary: string
        }>
        generateWorkflowSteps: (
          taskDescription: string,
          context?: unknown,
        ) => Promise<{
          workflowName: string
          steps: unknown[]
          duration: number
          notes: string
        }>
        enhanceTaskDetails: (
          taskName: string,
          currentDetails?: unknown,
        ) => Promise<{
          suggestions: unknown
          confidence: number
        }>
        getContextualQuestions: (
          taskName: string,
          taskDescription?: string,
        ) => Promise<{
          questions: Array<{
            question: string
            type: 'text' | 'number' | 'choice'
            choices?: string[]
            purpose: string
          }>
        }>
        getJobContextualQuestions: (
          brainstormText: string,
          jobContext?: string,
        ) => Promise<{
          questions: Array<{
            question: string
            type: 'text' | 'number' | 'choice'
            choices?: string[]
            purpose: string
            priority: 'high' | 'medium' | 'low'
          }>
          suggestedJobContext?: string
        }>
        extractScheduleFromVoice: (
          voiceText: string,
          targetDate: string,
        ) => Promise<{
          date: string
          blocks: Array<{
            id: string
            startTime: string
            endTime: string
            type: string | 'mixed'
            capacity?: {
              focused: number
              admin: number
            }
          }>
          meetings: Array<{
            id: string
            name: string
            startTime: string
            endTime: string
            type: 'meeting' | 'break' | 'personal' | 'blocked'
          }>
          summary: string
        }>
        extractMultiDayScheduleFromVoice: (
          voiceText: string,
          startDate: string,
        ) => Promise<
          Array<{
            date: string
            blocks: Array<{
              id: string
              startTime: string
              endTime: string
              type: string | 'mixed' | 'personal'
              capacity?: {
                focusMinutes?: number
                adminMinutes?: number
                personalMinutes?: number
              }
            }>
            meetings: Array<{
              id: string
              name: string
              startTime: string
              endTime: string
              type: 'meeting' | 'break' | 'personal' | 'blocked'
            }>
            summary: string
          }>
        >
        parseAmendment: (transcription: string, context: unknown) => Promise<unknown>
        callAI: (options: AICallOptions) => Promise<{ content: string }>
      }

      // Speech operations (for Electron desktop - web uses tRPC)
      speech: {
        transcribeAudio: (
          audioFilePath: string,
          options?: unknown,
        ) => Promise<{
          text: string
        }>
        transcribeAudioBuffer: (
          audioBuffer: Buffer,
          filename: string,
          options?: unknown,
        ) => Promise<{
          text: string
        }>
        getSupportedFormats: () => Promise<string[]>
        getBrainstormingSettings: () => Promise<{
          language: string
          prompt: string
        }>
        getWorkflowSettings: () => Promise<{
          language: string
          prompt: string
        }>
        getSchedulingSettings: () => Promise<{
          language: string
          prompt: string
        }>
      }

      // Log persistence (Electron-specific)
      persistLog?: (logEntry: unknown) => Promise<void>
      persistLogs?: (logs: unknown[]) => Promise<void>

      // Feedback operations (file-based, Electron-specific)
      saveFeedback?: (feedback: unknown) => Promise<boolean>
      readFeedback?: () => Promise<unknown[]>
      loadFeedback?: () => Promise<unknown[]>
      updateFeedback?: (updatedFeedback: unknown) => Promise<boolean>
      getSessionId?: () => Promise<string>

      // Main process logging
      onMainLog?: (callback: (entry: unknown) => void) => void
    }
  }
}

// Singleton instance
let dbInstance: TrpcDatabaseService | null = null

/**
 * Get the database service instance.
 *
 * All database operations go through tRPC to the PostgreSQL server.
 * The local IPC mode has been deprecated.
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
