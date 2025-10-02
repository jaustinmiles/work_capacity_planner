/**
 * IPC transport for renderer→main log forwarding
 */

import { LogEntry, IPCLogPayload } from '../types'
import { generateLogId } from '../../shared/step-id-utils'

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
  } catch (_e) {
    // Electron not available (e.g., in tests)
    ipcMain = null
  }
} else if (typeof window !== 'undefined' && (window as any).require) {
  // Renderer process with nodeIntegration (shouldn't happen in our case)
  try {
    const electron = (window as any).require('electron')
    ipcRenderer = electron.ipcRenderer
  } catch (_e) {
    // Electron not available
    ipcRenderer = null
  }
}

export class IPCTransport {
  private static rendererHandlerSetup: boolean = false
  private isRenderer: boolean
  private enabled: boolean
  private channel: string = 'logger:forward'
  private toRendererChannel: string = 'logger:from-main'
  private mainWindow: any = null
  private sentLogIds: Set<string> = new Set()
  private maxTrackedIds: number = 10000

  constructor(options: { enabled?: boolean; isRenderer: boolean } = { isRenderer: true }) {
    this.enabled = options.enabled ?? true
    this.isRenderer = options.isRenderer

    if (!this.isRenderer) {
      this.setupMainHandler()
    } else {
      this.setupRendererHandler()
    }
  }

  /**
   * Set the main window reference for sending logs to renderer
   */
  setMainWindow(window: any): void {
    this.mainWindow = window
  }

  write(entries: LogEntry[]): void {
    if (!this.enabled) return

    if (this.isRenderer) {
      this.writeFromRenderer(entries)
    } else {
      this.writeFromMain(entries)
    }
  }

  private writeFromRenderer(entries: LogEntry[]): void {

    // Send logs to main process
    for (const entry of entries) {
      try {
        // Sanitize the entry to remove non-serializable data
        const sanitizedEntry = JSON.parse(JSON.stringify(entry))

        const payload: IPCLogPayload = {
          type: 'log',
          entry: sanitizedEntry,
        }

        if (ipcRenderer) {
          // Use electron's ipcRenderer if available
          ipcRenderer.send(this.channel, payload)
        } else if (typeof window !== 'undefined' && (window as any).electronAPI?.sendLog) {
          // Use preload API if available
          (window as any).electronAPI.sendLog(this.channel, payload)
        } else if (typeof window !== 'undefined' && (window as any).electron?.sendLog) {
          // Use electron context bridge API
          (window as any).electron.sendLog(this.channel, payload)
        } else {
          // Fallback to console if no IPC available
          console.log('[IPC Transport] No IPC available, logging to console:', sanitizedEntry)
        }
      } catch (_error) {
        // Warn about entries that can't be serialized to help with debugging
        console.warn('[IPC Transport] Failed to serialize log entry, skipping:', _error)
      }
    }
  }

  private writeFromMain(entries: LogEntry[]): void {
    if (!this.mainWindow || !this.mainWindow.webContents) return

    console.log('[DEBUG] writeFromMain called with', entries.length, 'entries')

    // Log first 3 entries to see if they're duplicates
    entries.slice(0, 3).forEach((e, i) => {
      console.log(`[DEBUG] Entry ${i}:`, e.message, e.context.timestamp)
    })

    // Only forward logs that originated in main process (prevent loop)
    for (const entry of entries) {
      // Skip renderer logs that were forwarded to main - don't send them back
      if (entry.context.processType !== 'main') {
        continue
      }

      // Create unique ID for deduplication (prevents sending same log multiple times)
      const logId = generateLogId(entry.context.timestamp, entry.message, entry.level)

      // Skip if already sent
      if (this.sentLogIds.has(logId)) {
        continue
      }

      try {
        const sanitizedEntry = JSON.parse(JSON.stringify(entry))
        this.mainWindow.webContents.send(this.toRendererChannel, sanitizedEntry)

        // Track sent log
        this.sentLogIds.add(logId)

        // Limit Set size to prevent memory leak
        if (this.sentLogIds.size > this.maxTrackedIds) {
          const firstId = this.sentLogIds.values().next().value
          if (firstId) {
            this.sentLogIds.delete(firstId)
          }
        }
      } catch (_error) {
        console.warn('[IPC Transport] Failed to send main log to renderer:', _error)
      }
    }
  }

  /**
   * Setup handler in renderer to receive logs from main
   */
  private setupRendererHandler(): void {
    // Only set up the handler once globally to prevent memory leak
    if (IPCTransport.rendererHandlerSetup) {
      return
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.onMainLog) {
      (window as any).electronAPI.onMainLog((entry: LogEntry) => {
        // Emit an event that the renderer logger can listen to
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new (window as any).CustomEvent('main-log', { detail: entry }))
        }
      })
      IPCTransport.rendererHandlerSetup = true
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
    ipcMain.on(this.channel, (_event: IpcMainEvent, payload: IPCLogPayload) => {
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
