/**
 * IPC transport for renderer→main log forwarding
 */

import { LogEntry, IPCLogPayload } from '../types'

// Conditionally import electron based on environment
let ipcRenderer: any
let ipcMain: any
type IpcMainEvent = any

// Only import electron in Node.js environment
if (typeof window === 'undefined') {
  // Main process
  try {
    const electron = require('electron')
    ipcMain = electron.ipcMain
  } catch (e) {
    // Electron not available (e.g., in tests)
    ipcMain = null
  }
} else if (typeof window !== 'undefined' && (window as any).require) {
  // Renderer process with nodeIntegration (shouldn't happen in our case)
  try {
    const electron = (window as any).require('electron')
    ipcRenderer = electron.ipcRenderer
  } catch (e) {
    // Electron not available
    ipcRenderer = null
  }
}

export class IPCTransport {
  private isRenderer: boolean
  private enabled: boolean
  private channel: string = 'logger:forward'

  constructor(options: { enabled?: boolean; isRenderer: boolean } = { isRenderer: true }) {
    this.enabled = options.enabled ?? true
    this.isRenderer = options.isRenderer

    if (!this.isRenderer) {
      this.setupMainHandler()
    }
  }

  write(entries: LogEntry[]): void {
    if (!this.enabled || !this.isRenderer) return

    // Send logs to main process
    for (const entry of entries) {
      const payload: IPCLogPayload = {
        type: 'log',
        entry,
      }

      try {
        if (ipcRenderer) {
          // Use electron's ipcRenderer if available
          ipcRenderer.send(this.channel, payload)
        } else if (typeof window !== 'undefined' && (window as any).electronAPI?.sendLog) {
          // Use preload API if available
          (window as any).electronAPI.sendLog(this.channel, payload)
        } else {
          // Fallback to console if no IPC available
          console.log('[IPC Transport] No IPC available, logging to console:', entry)
        }
      } catch (error) {
        console.error('Failed to send log via IPC:', error)
      }
    }
  }

  /**
   * Setup handler in main process to receive logs
   */
  private setupMainHandler(): void {
    if (!ipcMain) {
      // In test environment, ipcMain may not be available
      return
    }
    ipcMain.on(this.channel, (event: IpcMainEvent, payload: IPCLogPayload) => {
      // This will be handled by the main logger
      // Just emit an event that the main logger can listen to
      ;(process as any).emit('renderer-log', payload.entry)
    })
  }

  close(): void {
    if (!this.isRenderer && ipcMain) {
      ipcMain.removeAllListeners(this.channel)
    }
  }
}
