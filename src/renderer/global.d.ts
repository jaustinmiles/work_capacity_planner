// Type definitions for window.electron API exposed by preload script

export {}

declare global {
  interface Window {
    electron: {
      log: {
        info: (scope: string, message: string, data?: any) => void
        debug: (scope: string, message: string, data?: any) => void
        warn: (scope: string, message: string, data?: any) => void
        error: (scope: string, message: string, error?: any, data?: any) => void
      }
    }
    electronAPI: {
      // Database operations
      db: any
      // AI operations
      ai: any
      // Speech operations
      speech: any
      // Logging operations
      log: (level: string, scope: string, message: string, data?: any) => void
      sendLog: (channel: string, payload: any) => void
      persistLog: (logEntry: any) => Promise<void>
      persistLogs: (logs: any[]) => Promise<void>
      // Feedback operations
      saveFeedback: (feedback: any) => Promise<void>
      readFeedback: () => Promise<any>
      loadFeedback: () => Promise<any>
      updateFeedback: (updatedFeedback: any) => Promise<void>
      getSessionId: () => Promise<string>
    }
  }
}
