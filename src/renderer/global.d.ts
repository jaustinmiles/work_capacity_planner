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
  }
}