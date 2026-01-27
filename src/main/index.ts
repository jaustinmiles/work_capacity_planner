/**
 * Electron Main Process
 *
 * Minimal shell that handles Electron-specific features only.
 * All data operations (database, AI, speech) go through tRPC to the server.
 *
 * Keeps:
 * - Feedback handlers (file-based, for development)
 * - Logging handlers (forward renderer logs to main)
 * - App metadata handlers
 */

import { app, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { LogScope } from '../logger'
import { getScopedLogger } from '../logger/scope-helper'

// Get scoped logger for main process
const mainLogger = getScopedLogger(LogScope.System)

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  mainLogger.info('Main process initialized (tRPC mode)')
  mainLogger.info('Server URL', { url: process.env.TASK_PLANNER_SERVER_URL || 'http://localhost:3001' })
})

// ============================================================================
// Feedback Handlers (File-based, Development Only)
// Used to collect user feedback during development via the DevTools panel
// ============================================================================

ipcMain.handle('feedback:save', async (_event: IpcMainInvokeEvent, feedback: unknown) => {
  const fs = await import('fs/promises')
  const projectRoot = process.cwd()
  const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')

  mainLogger.info('Saving feedback', { path: feedbackPath })

  // Ensure directory exists
  await fs.mkdir(path.dirname(feedbackPath), { recursive: true })

  // Read existing feedback or create empty array
  let allFeedback: unknown[] = []
  try {
    const existingData = await fs.readFile(feedbackPath, 'utf-8')
    const parsed = JSON.parse(existingData) as unknown

    // Flatten the structure if needed
    const flattenItems = (items: unknown): unknown[] => {
      const result: unknown[] = []
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (Array.isArray(item)) {
            result.push(...flattenItems(item))
          } else if (item && typeof item === 'object' && 'type' in item) {
            result.push(item)
          }
        })
      } else if (items && typeof items === 'object' && 'type' in items) {
        result.push(items)
      }
      return result
    }

    allFeedback = flattenItems(parsed)
  } catch (error) {
    mainLogger.debug('No existing feedback file found or invalid format', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Append new feedback
  if (Array.isArray(feedback)) {
    feedback.forEach(item => {
      if (item && typeof item === 'object' && 'type' in item) {
        const feedbackItem = item as { timestamp?: string; sessionId?: string }
        const isDuplicate = allFeedback.some(existing => {
          const existingItem = existing as { timestamp?: string; sessionId?: string }
          return existingItem.timestamp === feedbackItem.timestamp &&
            existingItem.sessionId === feedbackItem.sessionId
        })
        if (!isDuplicate) {
          allFeedback.push(item)
        }
      }
    })
  } else if (feedback && typeof feedback === 'object' && 'type' in feedback) {
    const feedbackItem = feedback as { timestamp?: string; sessionId?: string }
    const isDuplicate = allFeedback.some(existing => {
      const existingItem = existing as { timestamp?: string; sessionId?: string }
      return existingItem.timestamp === feedbackItem.timestamp &&
        existingItem.sessionId === feedbackItem.sessionId
    })
    if (!isDuplicate) {
      allFeedback.push(feedback)
    }
  }

  await fs.writeFile(feedbackPath, JSON.stringify(allFeedback, null, 2))
  mainLogger.info('Feedback saved to context folder')
  return true
})

ipcMain.handle('feedback:read', async () => {
  try {
    const fs = await import('fs/promises')
    const projectRoot = process.cwd()
    const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')
    const data = await fs.readFile(feedbackPath, 'utf-8')
    return JSON.parse(data) as unknown
  } catch {
    return []
  }
})

ipcMain.handle('feedback:load', async () => {
  try {
    const fs = await import('fs/promises')
    const projectRoot = process.cwd()
    const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')
    const data = await fs.readFile(feedbackPath, 'utf-8')
    return JSON.parse(data) as unknown
  } catch {
    return []
  }
})

ipcMain.handle('feedback:update', async (_event: IpcMainInvokeEvent, updatedFeedback: unknown) => {
  const fs = await import('fs/promises')
  const projectRoot = process.cwd()
  const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')

  mainLogger.info('Updating feedback', { path: feedbackPath })
  await fs.mkdir(path.dirname(feedbackPath), { recursive: true })

  const flattenItems = (items: unknown): unknown[] => {
    const result: unknown[] = []
    if (Array.isArray(items)) {
      items.forEach(item => {
        if (Array.isArray(item)) {
          result.push(...flattenItems(item))
        } else if (item && typeof item === 'object' && 'type' in item) {
          result.push(item)
        }
      })
    } else if (items && typeof items === 'object' && 'type' in items) {
      result.push(items)
    }
    return result
  }

  const flatFeedback = flattenItems(updatedFeedback)

  const uniqueFeedback = flatFeedback.filter((item, index, self) => {
    const feedbackItem = item as { timestamp?: string; sessionId?: string }
    return index === self.findIndex(f => {
      const existing = f as { timestamp?: string; sessionId?: string }
      return existing.timestamp === feedbackItem.timestamp &&
        existing.sessionId === feedbackItem.sessionId
    })
  })

  await fs.writeFile(feedbackPath, JSON.stringify(uniqueFeedback, null, 2))
  mainLogger.info('Feedback updated in context folder')
  return true
})

// ============================================================================
// App Operation Handlers
// ============================================================================

ipcMain.handle('app:getSessionId', () => {
  return `session-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
})

// ============================================================================
// Logging Handler - Forward Renderer Logs
// ============================================================================

ipcMain.on('log:message', (_event: unknown, { level, scope, message, data }: { level: string; scope?: string; message: string; data?: Record<string, unknown> }) => {
  const contextData = scope ? { ...data, scope } : data

  switch (level) {
    case 'debug':
      mainLogger.debug(message, contextData)
      break
    case 'info':
      mainLogger.info(message, contextData)
      break
    case 'warn':
      mainLogger.warn(message, contextData)
      break
    case 'error':
      mainLogger.error(message, contextData)
      break
    default:
      mainLogger.info(message, contextData)
  }
})
