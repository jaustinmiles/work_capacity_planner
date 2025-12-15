/**
 * @task-planner/shared services
 *
 * AI and Speech services that can be used by:
 * - Server (packages/server) for API routes
 * - Desktop (src/main) for IPC handlers
 * - Mobile (packages/mobile) for direct integration
 */

export { AIService, getAIService } from './ai-service.js'
export { SpeechService, getSpeechService } from './speech-service.js'
