/**
 * Electron Preload Script
 *
 * Exposes a minimal set of APIs to the renderer process.
 * All data operations (database, AI, speech) go through tRPC to the server.
 *
 * Keeps:
 * - appConfig for mode detection and server URL
 * - Feedback operations (file-based, for development)
 * - Logging operations
 */

const { contextBridge, ipcRenderer } = require('electron')

// App configuration exposed to renderer
const appConfig = {
  mode: process.env.TASK_PLANNER_MODE || 'client',
  serverUrl:
    process.env.TASK_PLANNER_MODE === 'server'
      ? `http://localhost:${process.env.TASK_PLANNER_PORT || '3001'}`
      : process.env.TASK_PLANNER_SERVER_URL || 'http://localhost:3001',
  apiKey: process.env.TASK_PLANNER_API_KEY || '',
  useTrpc: true, // Always true - all operations go through tRPC
}

// Expose app configuration to renderer
contextBridge.exposeInMainWorld('appConfig', appConfig)

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
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

  // App metadata
  getSessionId: () => ipcRenderer.invoke('app:getSessionId'),
})
