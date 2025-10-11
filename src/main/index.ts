import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { DatabaseService } from './database'
import { getAIService } from '../shared/ai-service'
import { getSpeechService } from '../shared/speech-service'
import { getMainLogger } from '../logging/index.main'
import type { Task } from '../shared/types'
import type { TaskStep } from '../shared/sequencing-types'

// Initialize logger
const logger = getMainLogger()


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId(app.getName())
}

let mainWindow: InstanceType<typeof BrowserWindow> | null = null

async function createWindow(): Promise<void> {
  // Prevent creating multiple windows
  if (mainWindow) {
    return
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Set main window for logger to forward logs to renderer
  logger.setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined')
    }
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5174')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// Initialize database service (declare it here for IPC handlers)
let db: DatabaseService

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Initialize database service once when app is ready
  db = DatabaseService.getInstance()

  // Log database path for debugging
  const dbPath = process.env.DATABASE_URL || 'file:./dev.db'
  logger.info(`[main] Database path: ${dbPath}`)
  logger.info(`[main] Working directory: ${process.cwd()}`)
  logger.info('[main] Main process initialized successfully')

  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC handlers for database operations
// Session management handlers
ipcMain.handle('db:getSessions', async () => {
  logger.info('[ipc] Getting sessions...')
  if (!db) db = DatabaseService.getInstance()
  return await db.getSessions()
})

ipcMain.handle('db:createSession', async (_event: IpcMainInvokeEvent, name: string, description?: string) => {
  return await db.createSession(name, description)
})

ipcMain.handle('db:switchSession', async (_event: IpcMainInvokeEvent, sessionId: string) => {
  return await db.switchSession(sessionId)
})

ipcMain.handle('db:updateSession', async (_event: IpcMainInvokeEvent, id: string, updates: { name?: string; description?: string }) => {
  return await db.updateSession(id, updates)
})

ipcMain.handle('db:getCurrentSession', async () => {
  return await db.getCurrentSession()
})

ipcMain.handle('db:updateSchedulingPreferences', async (_event: IpcMainInvokeEvent, sessionId: string, updates: any) => {
  return await db.updateSchedulingPreferences(sessionId, updates)
})

ipcMain.handle('db:deleteSession', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteSession(id)
})

ipcMain.handle('db:getTasks', async (_event, includeArchived = false) => {
  logger.info('[ipc] Getting tasks from database...', { includeArchived })
  try {
    const tasks = await db.getTasks(includeArchived)
    logger.info(`[ipc] Found ${tasks.length} tasks`)
    return tasks
  } catch (error) {
    logger.error('[ipc] Error getting tasks', { error })
    throw error
  }
})

ipcMain.handle('db:getSequencedTasks', async () => {
  return await db.getSequencedTasks()
})

ipcMain.handle('db:createTask', async (_event: IpcMainInvokeEvent, taskData: Partial<Task>) => {
  return await db.createTask(taskData as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>)
})

ipcMain.handle('db:createSequencedTask', async (_event: IpcMainInvokeEvent, taskData: unknown) => {
  return await db.createSequencedTask(taskData)
})

ipcMain.handle('db:updateTask', async (_event: IpcMainInvokeEvent, id: string, updates: Partial<Task>) => {
  return await db.updateTask(id, updates)
})

ipcMain.handle('db:updateSequencedTask', async (_event: IpcMainInvokeEvent, id: string, updates: unknown) => {
  return await db.updateSequencedTask(id, updates)
})
ipcMain.handle('db:addStepToWorkflow', async (_event: IpcMainInvokeEvent, workflowId: string, stepData: Partial<TaskStep>) => {
  return await db.addStepToWorkflow(workflowId, stepData as any)
})

ipcMain.handle('db:deleteTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteTask(id)
})

ipcMain.handle('db:archiveTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.archiveTask(id)
})

ipcMain.handle('db:unarchiveTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.unarchiveTask(id)
})

ipcMain.handle('db:deleteSequencedTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteSequencedTask(id)
})

ipcMain.handle('db:initializeDefaultData', async () => {
  return await db.initializeDefaultData()
})

ipcMain.handle('db:getTaskById', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.getTaskById(id)
})

ipcMain.handle('db:getSequencedTaskById', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.getSequencedTaskById(id)
})

// Job context handlers
ipcMain.handle('db:getJobContexts', async () => {
  return await db.getJobContexts()
})

ipcMain.handle('db:getActiveJobContext', async () => {
  return await db.getActiveJobContext()
})

ipcMain.handle('db:createJobContext', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await db.createJobContext(data as any)
})

ipcMain.handle('db:updateJobContext', async (_event: IpcMainInvokeEvent, id: string, updates: unknown) => {
  return await db.updateJobContext(id, updates as any)
})

ipcMain.handle('db:deleteJobContext', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteJobContext(id)
})

ipcMain.handle('db:addContextEntry', async (_event: IpcMainInvokeEvent, jobContextId: string, entry: unknown) => {
  return await db.addContextEntry(jobContextId, entry)
})

// Jargon dictionary handlers
ipcMain.handle('db:getJargonEntries', async () => {
  return await db.getJargonEntries()
})

ipcMain.handle('db:createJargonEntry', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await db.createJargonEntry(data as any)
})

ipcMain.handle('db:updateJargonEntry', async (_event: IpcMainInvokeEvent, id: string, updates: unknown) => {
  return await db.updateJargonEntry(id, updates as any)
})

ipcMain.handle('db:updateJargonDefinition', async (_event: IpcMainInvokeEvent, term: string, definition: string) => {
  return await db.updateJargonDefinition(term, definition)
})

ipcMain.handle('db:deleteJargonEntry', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteJargonEntry(id)
})

ipcMain.handle('db:getJargonDictionary', async () => {
  return await db.getJargonDictionary()
})

// Development helpers
ipcMain.handle('db:deleteAllTasks', async () => {
  return await db.deleteAllTasks()
})

ipcMain.handle('db:deleteAllSequencedTasks', async () => {
  return await db.deleteAllSequencedTasks()
})

ipcMain.handle('db:deleteAllUserData', async () => {
  return await db.deleteAllUserData()
})

// Log persistence handlers (dev mode only)
ipcMain.handle('log:persist', async (_event: IpcMainInvokeEvent, logEntry: any) => {
  return await db.persistLog(logEntry)
})

ipcMain.handle('log:persistBatch', async (_event: IpcMainInvokeEvent, logs: any[]) => {
  return await db.persistLogs(logs)
})

// Work pattern handlers
ipcMain.handle('db:getWorkPattern', async (_event: IpcMainInvokeEvent, date: string) => {
  return await db.getWorkPattern(date)
})

ipcMain.handle('db:getWorkPatterns', async () => {
  return await db.getWorkPatterns()
})

ipcMain.handle('db:createWorkPattern', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await db.createWorkPattern(data as any)
})

ipcMain.handle('db:updateWorkPattern', async (_event: IpcMainInvokeEvent, id: string, data: unknown) => {
  return await db.updateWorkPattern(id, data as any)
})

ipcMain.handle('db:deleteWorkPattern', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteWorkPattern(id)
})

ipcMain.handle('db:getWorkTemplates', async () => {
  return await db.getWorkTemplates()
})

ipcMain.handle('db:saveAsTemplate', async (_event: IpcMainInvokeEvent, date: string, templateName: string) => {
  return await db.saveAsTemplate(date, templateName)
})

// Work session handlers
ipcMain.handle('db:createWorkSession', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await db.createWorkSession(data as any)
})

ipcMain.handle('db:updateWorkSession', async (_event: IpcMainInvokeEvent, id: string, data: unknown) => {
  return await db.updateWorkSession(id, data)
})

ipcMain.handle('db:deleteWorkSession', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteWorkSession(id)
})

ipcMain.handle('db:getWorkSessionsForTask', async (_event: IpcMainInvokeEvent, taskId: string) => {
  return await db.getWorkSessionsForTask(taskId)
})

ipcMain.handle('db:getWorkSessions', async (_event: IpcMainInvokeEvent, date: string) => {
  return await db.getWorkSessions(date)
})

ipcMain.handle('db:getActiveWorkSession', async () => {
  return await db.getActiveWorkSession()
})

ipcMain.handle('db:getTaskTotalLoggedTime', async (_event: IpcMainInvokeEvent, taskId: string) => {
  return await db.getTaskTotalLoggedTime(taskId)
})

ipcMain.handle('db:getTodayAccumulated', async (_event: IpcMainInvokeEvent, date: string) => {
  return await db.getTodayAccumulated(date)
})

// Progress tracking handlers
ipcMain.handle('db:createStepWorkSession', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await db.createStepWorkSession(data)
})

ipcMain.handle('db:updateTaskStepProgress', async (_event: IpcMainInvokeEvent, stepId: string, data: unknown) => {
  return await db.updateTaskStepProgress(stepId, data)
})

ipcMain.handle('db:getStepWorkSessions', async (_event: IpcMainInvokeEvent, stepId: string) => {
  return await db.getStepWorkSessions(stepId)
})

ipcMain.handle('db:recordTimeEstimate', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await db.recordTimeEstimate(data)
})

ipcMain.handle('db:getTimeAccuracyStats', async (_event: IpcMainInvokeEvent, filters?: unknown) => {
  return await db.getTimeAccuracyStats(filters)
})

// AI operation handlers
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
  return await aiService.generateWorkflowSteps(taskDescription, context as any)
})

ipcMain.handle('ai:enhanceTaskDetails', async (_event: IpcMainInvokeEvent, taskName: string, currentDetails?: unknown) => {
  const aiService = getAIService()
  return await aiService.enhanceTaskDetails(taskName, currentDetails as any)
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

ipcMain.handle('ai:extractMultiDayScheduleFromVoice', async (_event: IpcMainInvokeEvent, voiceText: string, startDate: string) => {
  const aiService = getAIService()
  return await aiService.extractMultiDayScheduleFromVoice(voiceText, startDate)
})

ipcMain.handle('ai:parseAmendment', async (_event: IpcMainInvokeEvent, transcription: string, context: unknown) => {
  const { AmendmentParser } = await import('../shared/amendment-parser')

  // Fetch job contexts to provide domain knowledge to the AI
  try {
    const jobContexts = await db.getJobContexts()
    if (jobContexts && jobContexts.length > 0) {
      (context as any).jobContexts = jobContexts
      logger.debug('[IPC] Including job contexts in amendment parsing', { count: jobContexts.length })
    }
  } catch (error) {
    logger.error('[ipc] Failed to fetch job contexts:', { error })
  }

  const parser = new AmendmentParser({ useAI: true })
  return await parser.parseTranscription(transcription, context as any)
})

// Speech operation handlers
ipcMain.handle('speech:transcribeAudio', async (_event: IpcMainInvokeEvent, audioFilePath: string, options?: unknown) => {
  const speechService = getSpeechService()
  return await speechService.transcribeAudio(audioFilePath, options as any)
})

ipcMain.handle('speech:transcribeAudioBuffer', async (_event: IpcMainInvokeEvent, audioBuffer: Buffer, filename: string, options?: unknown) => {
  const speechService = getSpeechService()
  return await speechService.transcribeAudioBuffer(audioBuffer, filename, options as any)
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

// Feedback handlers
ipcMain.handle('feedback:save', async (_event, feedback) => {
  try {
    const fs = await import('fs/promises')
    // Use process.cwd() for development, which should be the project root
    const projectRoot = process.cwd()
    const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')

    logger.info('Saving feedback', { path: feedbackPath })

    // Ensure directory exists
    await fs.mkdir(path.dirname(feedbackPath), { recursive: true })

    // Read existing feedback or create empty array
    let allFeedback: any[] = []
    try {
      const existingData = await fs.readFile(feedbackPath, 'utf-8')
      const parsed = JSON.parse(existingData)

      // Flatten the structure if needed
      const flattenItems = (items: any): any[] => {
        const result: any[] = []
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
    } catch {
      // File doesn't exist yet
    }

    // Append new feedback (ensure it's not an array being appended)
    if (Array.isArray(feedback)) {
      // If somehow an array is being saved, flatten it
      feedback.forEach(item => {
        if (item && typeof item === 'object' && 'type' in item) {
          // Check for duplicates before adding
          const isDuplicate = allFeedback.some(existing =>
            existing.timestamp === item.timestamp &&
            existing.sessionId === item.sessionId,
          )
          if (!isDuplicate) {
            allFeedback.push(item)
          }
        }
      })
    } else if (feedback && typeof feedback === 'object' && 'type' in feedback) {
      // Check for duplicates before adding
      const isDuplicate = allFeedback.some(existing =>
        existing.timestamp === feedback.timestamp &&
        existing.sessionId === feedback.sessionId,
      )
      if (!isDuplicate) {
        allFeedback.push(feedback)
      }
    }

    // Save all feedback (flat array only)
    await fs.writeFile(feedbackPath, JSON.stringify(allFeedback, null, 2))

    logger.info('Feedback saved to context folder')
    return true
  } catch (error) {
    logger.error('Failed to save feedback', { error })
    throw error
  }
})

ipcMain.handle('feedback:read', async () => {
  try {
    const fs = await import('fs/promises')
    const projectRoot = process.cwd()
    const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')

    const data = await fs.readFile(feedbackPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    // File doesn't exist yet
    return []
  }
})

ipcMain.handle('feedback:load', async () => {
  try {
    const fs = await import('fs/promises')
    const projectRoot = process.cwd()
    const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')

    const data = await fs.readFile(feedbackPath, 'utf-8')
    return JSON.parse(data)
  } catch {
    // File doesn't exist yet
    return []
  }
})

ipcMain.handle('feedback:update', async (_event, updatedFeedback) => {
  try {
    const fs = await import('fs/promises')
    const projectRoot = process.cwd()
    const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')

    logger.info('Updating feedback', { path: feedbackPath })

    // Ensure directory exists
    await fs.mkdir(path.dirname(feedbackPath), { recursive: true })

    // Flatten the structure if needed before saving
    const flattenItems = (items: any): any[] => {
      const result: any[] = []
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

    // Deduplicate feedback items based on timestamp and sessionId
    const uniqueFeedback = flatFeedback.filter((item, index, self) =>
      index === self.findIndex(f =>
        f.timestamp === item.timestamp &&
        f.sessionId === item.sessionId,
      ),
    )

    // Save updated feedback (ensure it's a flat, deduplicated array)
    await fs.writeFile(feedbackPath, JSON.stringify(uniqueFeedback, null, 2))

    logger.info('Feedback updated in context folder')
    return true
  } catch (error) {
    logger.error('Failed to update feedback', { error })
    throw error
  }
})

ipcMain.handle('app:getSessionId', () => {
  // Generate a session ID for feedback tracking
  return `session-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
})

// Logging handler - forward renderer logs
ipcMain.on('log:message', (_event, { level, scope, message, data }) => {
  // Add scope to context if provided
  const contextData = scope ? { ...data, scope } : data

  // Use the appropriate logger based on level
  switch (level) {
    case 'debug':
      logger.debug(message, contextData)
      break
    case 'info':
      logger.info(message, contextData)
      break
    case 'warn':
      logger.warn(message, contextData)
      break
    case 'error':
      logger.error(message, contextData)
      break
    default:
      logger.info(message, contextData)
  }
})
