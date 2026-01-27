/**
 * Electron Main Process
 *
 * Simplified main process that serves as a window shell.
 * All database operations go through tRPC - no local database.
 *
 * Keeps:
 * - AI operation handlers (for Electron desktop)
 * - Speech operation handlers (for Electron desktop)
 * - Feedback handlers (file-based, for development)
 * - Logging handlers
 */

import { app, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { getAIService } from '../shared/ai-service'
import { getSpeechService } from '../shared/speech-service'
import { LogScope } from '../logger'
import { getScopedLogger } from '../logger/scope-helper'
import type { AICallOptions } from '../shared/types'

// Get scoped logger for main process
const mainLogger = getScopedLogger(LogScope.System)

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  mainLogger.info('Main process initialized (tRPC mode - no local database)')
  mainLogger.info('Server URL', { url: process.env.TASK_PLANNER_SERVER_URL || 'http://localhost:3001' })
})

// ============================================================================
// AI Operation Handlers (Electron Desktop)
// Note: Web clients use tRPC AI router instead
// ============================================================================

ipcMain.handle('ai:extractTasksFromBrainstorm', async (_event: IpcMainInvokeEvent, brainstormText: string) => {
  const aiService = getAIService()
  return await aiService.extractTasksFromBrainstorm(brainstormText)
})

ipcMain.handle('ai:extractWorkflowsFromBrainstorm', async (_event: IpcMainInvokeEvent, brainstormText: string, jobContext?: string) => {
  const aiService = getAIService()
  return await aiService.extractWorkflowsFromBrainstorm(brainstormText, jobContext)
})

ipcMain.handle('ai:extractJargonTerms', async (_event: IpcMainInvokeEvent, contextText: string) => {
  const aiService = getAIService()
  return await aiService.extractJargonTerms(contextText)
})

ipcMain.handle('ai:generateWorkflowSteps', async (_event: IpcMainInvokeEvent, taskDescription: string, context?: unknown) => {
  const aiService = getAIService()
  return await aiService.generateWorkflowSteps(taskDescription, context as Parameters<typeof aiService.generateWorkflowSteps>[1])
})

ipcMain.handle('ai:enhanceTaskDetails', async (_event: IpcMainInvokeEvent, taskName: string, currentDetails?: unknown) => {
  const aiService = getAIService()
  return await aiService.enhanceTaskDetails(taskName, currentDetails as Parameters<typeof aiService.enhanceTaskDetails>[1])
})

ipcMain.handle('ai:getContextualQuestions', async (_event: IpcMainInvokeEvent, taskName: string, taskDescription?: string) => {
  const aiService = getAIService()
  return await aiService.getContextualQuestions(taskName, taskDescription)
})

ipcMain.handle('ai:getJobContextualQuestions', async (_event: IpcMainInvokeEvent, brainstormText: string, jobContext?: string) => {
  const aiService = getAIService()
  return await aiService.getJobContextualQuestions(brainstormText, jobContext)
})

ipcMain.handle('ai:extractScheduleFromVoice', async (_event: IpcMainInvokeEvent, voiceText: string, targetDate: string) => {
  const aiService = getAIService()
  return await aiService.extractScheduleFromVoice(voiceText, targetDate)
})

ipcMain.handle('ai:callAI', async (_event: IpcMainInvokeEvent, options: AICallOptions) => {
  const aiService = getAIService()
  return await aiService.callAI(options)
})

ipcMain.handle('ai:extractMultiDayScheduleFromVoice', async (_event: IpcMainInvokeEvent, voiceText: string, startDate: string) => {
  const aiService = getAIService()
  return await aiService.extractMultiDayScheduleFromVoice(voiceText, startDate)
})

ipcMain.handle('ai:parseAmendment', async (_event: IpcMainInvokeEvent, transcription: string, context: unknown) => {
  const { AmendmentParser } = await import('../shared/amendment-parser')
  const parser = new AmendmentParser({ useAI: true })
  return await parser.parseTranscription(transcription, context as Parameters<typeof parser.parseTranscription>[1])
})

// ============================================================================
// Speech Operation Handlers (Electron Desktop)
// Note: Web clients use tRPC speech router instead
// ============================================================================

ipcMain.handle('speech:transcribeAudio', async (_event: IpcMainInvokeEvent, audioFilePath: string, options?: unknown) => {
  const speechService = getSpeechService()
  return await speechService.transcribeAudio(audioFilePath, options as Parameters<typeof speechService.transcribeAudio>[1])
})

ipcMain.handle('speech:transcribeAudioBuffer', async (_event: IpcMainInvokeEvent, audioBuffer: Buffer, filename: string, options?: unknown) => {
  const speechService = getSpeechService()
  return await speechService.transcribeAudioBuffer(audioBuffer, filename, options as Parameters<typeof speechService.transcribeAudioBuffer>[2])
})

ipcMain.handle('speech:getSupportedFormats', async () => {
  const speechService = getSpeechService()
  return speechService.getSupportedFormats()
})

ipcMain.handle('speech:getBrainstormingSettings', async () => {
  const speechService = getSpeechService()
  return speechService.getBrainstormingSettings()
})

ipcMain.handle('speech:getWorkflowSettings', async () => {
  const speechService = getSpeechService()
  return speechService.getWorkflowSettings()
})

ipcMain.handle('speech:getSchedulingSettings', async () => {
  const speechService = getSpeechService()
  return speechService.getSchedulingSettings()
})

// ============================================================================
// Feedback Handlers (File-based, Development Only)
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
