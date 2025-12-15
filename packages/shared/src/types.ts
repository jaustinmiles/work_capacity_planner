/**
 * Shared types for Task Planner
 * Minimal set needed by services
 */

// Chat message role for AI conversations
export enum ChatMessageRole {
  User = 'user',
  Assistant = 'assistant',
}

// AI call options for generic AI requests
export interface AICallOptions {
  systemPrompt: string
  messages: Array<{
    role: ChatMessageRole.User | ChatMessageRole.Assistant
    content: string
  }>
  model?: string
  maxTokens?: number
}

// Task step interface (minimal for AI service)
export interface TaskStep {
  id: string
  taskId: string
  name: string
  duration: number
  type: string
  stepIndex: number
  status: string
  percentComplete: number
  notes?: string
  asyncWaitTime: number
  dependsOn: string[]
  cognitiveComplexity?: number
  startedAt?: Date
  completedAt?: Date
  actualDuration?: number
}

// Simple logger interface for services
export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: unknown) => void
}

// Default console-based logger
export const defaultLogger: Logger = {
  debug: (message, data) => console.debug(`[DEBUG] ${message}`, data || ''),
  info: (message, data) => console.info(`[INFO] ${message}`, data || ''),
  warn: (message, data) => console.warn(`[WARN] ${message}`, data || ''),
  error: (message, data) => console.error(`[ERROR] ${message}`, data || ''),
}
