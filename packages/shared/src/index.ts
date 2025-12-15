/**
 * @task-planner/shared
 *
 * Shared types, enums, constants, and utilities used by:
 * - Server (packages/server)
 * - Mobile (packages/mobile)
 * - Desktop (packages/desktop)
 */

// Types
export {
  ChatMessageRole,
  type AICallOptions,
  type TaskStep,
  type Logger,
  defaultLogger,
} from './types.js'

// Services
export { AIService, getAIService, SpeechService, getSpeechService } from './services/index.js'

// Version
export const SHARED_VERSION = '0.1.0'
