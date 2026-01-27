/**
 * Electron Preload Script
 *
 * Exposes a limited set of APIs to the renderer process.
 * All database operations now go through tRPC - the db bridge is deprecated.
 *
 * Keeps:
 * - appConfig for mode detection
 * - AI operations (for Electron desktop)
 * - Speech operations (for Electron desktop)
 * - Feedback operations (file-based)
 * - Logging operations
 */

const { contextBridge, ipcRenderer } = require('electron')
import type { AICallOptions } from '../shared/types'

// App configuration exposed to renderer
// Note: 'local' mode is deprecated - defaults to 'client' with tRPC always enabled
const appConfig = {
  mode: process.env.TASK_PLANNER_MODE || 'client',
  serverUrl:
    process.env.TASK_PLANNER_MODE === 'server'
      ? `http://localhost:${process.env.TASK_PLANNER_PORT || '3001'}`
      : process.env.TASK_PLANNER_SERVER_URL || 'http://localhost:3001',
  apiKey: process.env.TASK_PLANNER_API_KEY || '',
  useTrpc: true, // Always true - local IPC database mode is deprecated
}

// Expose app configuration to renderer
contextBridge.exposeInMainWorld('appConfig', appConfig)

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations - DEPRECATED
  // All database operations now go through tRPC
  // This stub exists only for type compatibility and helpful error messages
  db: new Proxy({} as Record<string, unknown>, {
    get: (_target, prop) => {
      return (..._args: unknown[]) => {
        throw new Error(
          `IPC database calls are deprecated. Use tRPC instead. Called: db.${String(prop)}`,
        )
      }
    },
  }),

  // AI operations (for Electron desktop - web uses tRPC)
  ai: {
    extractTasksFromBrainstorm: (brainstormText: string) =>
      ipcRenderer.invoke('ai:extractTasksFromBrainstorm', brainstormText),
    extractWorkflowsFromBrainstorm: (brainstormText: string, jobContext?: string) =>
      ipcRenderer.invoke('ai:extractWorkflowsFromBrainstorm', brainstormText, jobContext),
    extractJargonTerms: (contextText: string) =>
      ipcRenderer.invoke('ai:extractJargonTerms', contextText),
    generateWorkflowSteps: (taskDescription: string, context?: unknown) =>
      ipcRenderer.invoke('ai:generateWorkflowSteps', taskDescription, context),
    enhanceTaskDetails: (taskName: string, currentDetails?: unknown) =>
      ipcRenderer.invoke('ai:enhanceTaskDetails', taskName, currentDetails),
    getContextualQuestions: (taskName: string, taskDescription?: string) =>
      ipcRenderer.invoke('ai:getContextualQuestions', taskName, taskDescription),
    getJobContextualQuestions: (brainstormText: string, jobContext?: string) =>
      ipcRenderer.invoke('ai:getJobContextualQuestions', brainstormText, jobContext),
    extractScheduleFromVoice: (voiceText: string, targetDate: string) =>
      ipcRenderer.invoke('ai:extractScheduleFromVoice', voiceText, targetDate),
    extractMultiDayScheduleFromVoice: (voiceText: string, startDate: string) =>
      ipcRenderer.invoke('ai:extractMultiDayScheduleFromVoice', voiceText, startDate),
    parseAmendment: (transcription: string, context: unknown) =>
      ipcRenderer.invoke('ai:parseAmendment', transcription, context),
    callAI: (options: AICallOptions) => ipcRenderer.invoke('ai:callAI', options),
  },

  // Speech operations (for Electron desktop - web uses tRPC)
  speech: {
    transcribeAudio: (audioFilePath: string, options?: unknown) =>
      ipcRenderer.invoke('speech:transcribeAudio', audioFilePath, options),
    transcribeAudioBuffer: (audioBuffer: Buffer, filename: string, options?: unknown) =>
      ipcRenderer.invoke('speech:transcribeAudioBuffer', audioBuffer, filename, options),
    getSupportedFormats: () => ipcRenderer.invoke('speech:getSupportedFormats'),
    getBrainstormingSettings: () => ipcRenderer.invoke('speech:getBrainstormingSettings'),
    getWorkflowSettings: () => ipcRenderer.invoke('speech:getWorkflowSettings'),
    getSchedulingSettings: () => ipcRenderer.invoke('speech:getSchedulingSettings'),
  },

  // Logging operations
  log: (level: string, scope: string, message: string, data?: unknown) =>
    ipcRenderer.send('log:message', { level, scope, message, data }),
  sendLog: (channel: string, payload: unknown) => ipcRenderer.send(channel, payload),
  persistLog: (logEntry: unknown) => ipcRenderer.invoke('log:persist', logEntry),
  persistLogs: (logs: unknown[]) => ipcRenderer.invoke('log:persistBatch', logs),
  onMainLog: (callback: (entry: unknown) => void) =>
    ipcRenderer.on('log:from-main', (_event: unknown, entry: unknown) => callback(entry)),

  // Feedback operations (file-based, for development)
  saveFeedback: (feedback: unknown) => ipcRenderer.invoke('feedback:save', feedback),
  readFeedback: () => ipcRenderer.invoke('feedback:read'),
  loadFeedback: () => ipcRenderer.invoke('feedback:load'),
  updateFeedback: (updatedFeedback: unknown) =>
    ipcRenderer.invoke('feedback:update', updatedFeedback),
  getSessionId: () => ipcRenderer.invoke('app:getSessionId'),
})
