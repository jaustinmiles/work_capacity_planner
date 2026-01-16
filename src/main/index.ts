import { app, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { DatabaseService } from './database'
import { getAIService } from '../shared/ai-service'
import { getSpeechService } from '../shared/speech-service'
import { LogScope } from '../logger'
import { getScopedLogger } from '../logger/scope-helper'
import type { Task, AICallOptions } from '../shared/types'
import type { TaskStep } from '../shared/sequencing-types'
import type { LogQueryOptions } from '../shared/log-types'
import type { AmendmentCard } from '../shared/conversation-types'
import { AmendmentCardStatus, ChatMessageRole } from '../shared/enums'

// Get scoped logger for main process
const mainLogger = getScopedLogger(LogScope.System)

// Check if we're in client mode (tRPC connects to remote server, no local DB)
const isClientMode = process.env.TASK_PLANNER_MODE === 'client'

// Initialize database service (declare it here for IPC handlers)
// In client mode, db will remain undefined - renderer uses tRPC instead
let db: DatabaseService | undefined

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  if (isClientMode) {
    // Client mode: renderer uses tRPC to connect to remote server
    // No local database needed
    mainLogger.info('Running in CLIENT mode - no local database')
    mainLogger.info('Server URL', { url: process.env.TASK_PLANNER_SERVER_URL })
  } else {
    // Local or server mode: initialize local database
    db = DatabaseService.getInstance()

    // Log database path for debugging
    const dbPath = process.env.DATABASE_URL || 'file:./dev.db'
    mainLogger.info('Database path', { path: dbPath })
    mainLogger.info('Working directory', { cwd: process.cwd() })
  }
  mainLogger.info('Main process initialized successfully')
})

// Helper to get database instance, throws if in client mode
function getDb(): DatabaseService {
  if (isClientMode || !db) {
    throw new Error('Database not available in client mode - use tRPC instead')
  }
  return db
}

// IPC handlers for database operations
// In client mode, these won't be used (renderer uses tRPC)
// Session management handlers
ipcMain.handle('db:getSessions', async () => {
  mainLogger.info('Getting sessions...')
  return await getDb().getSessions()
})

ipcMain.handle('db:createSession', async (_event: IpcMainInvokeEvent, name: string, description?: string) => {
  return await getDb().createSession(name, description)
})

ipcMain.handle('db:switchSession', async (_event: IpcMainInvokeEvent, sessionId: string) => {
  return await getDb().switchSession(sessionId)
})

ipcMain.handle('db:updateSession', async (_event: IpcMainInvokeEvent, id: string, updates: { name?: string; description?: string }) => {
  return await getDb().updateSession(id, updates)
})

ipcMain.handle('db:getCurrentSession', async () => {
  return await getDb().getCurrentSession()
})

ipcMain.handle('db:updateSchedulingPreferences', async (_event: IpcMainInvokeEvent, sessionId: string, updates: any) => {
  return await getDb().updateSchedulingPreferences(sessionId, updates)
})

ipcMain.handle('db:deleteSession', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteSession(id)
})

// User task type handlers
ipcMain.handle('db:getUserTaskTypes', async (_event: IpcMainInvokeEvent, sessionId?: string) => {
  return await getDb().getUserTaskTypes(sessionId)
})

ipcMain.handle('db:getUserTaskTypeById', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().getUserTaskTypeById(id)
})

ipcMain.handle('db:createUserTaskType', async (_event: IpcMainInvokeEvent, input: any) => {
  // Inject the current session ID
  const sessionId = await getDb().getActiveSession()
  return await getDb().createUserTaskType({ ...input, sessionId })
})

ipcMain.handle('db:updateUserTaskType', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
  return await getDb().updateUserTaskType(id, updates)
})

ipcMain.handle('db:deleteUserTaskType', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteUserTaskType(id)
})

ipcMain.handle('db:reorderUserTaskTypes', async (_event: IpcMainInvokeEvent, orderedIds: string[]) => {
  // Get the current session ID for the reorder operation
  const sessionId = await getDb().getActiveSession()
  return await getDb().reorderUserTaskTypes(sessionId, orderedIds)
})

ipcMain.handle('db:sessionHasTaskTypes', async (_event: IpcMainInvokeEvent, sessionId?: string) => {
  return await getDb().sessionHasTaskTypes(sessionId)
})

// Time sink handlers
ipcMain.handle('db:getTimeSinks', async (_event: IpcMainInvokeEvent, sessionId?: string) => {
  return await getDb().getTimeSinks(sessionId)
})

ipcMain.handle('db:getTimeSinkById', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().getTimeSinkById(id)
})

ipcMain.handle('db:createTimeSink', async (_event: IpcMainInvokeEvent, input: { name: string; emoji: string; color: string; typeId?: string; sortOrder?: number }) => {
  const sessionId = await getDb().getActiveSession()
  return await getDb().createTimeSink({ ...input, sessionId })
})

ipcMain.handle('db:updateTimeSink', async (_event: IpcMainInvokeEvent, id: string, updates: { name?: string; emoji?: string; color?: string; typeId?: string | null; sortOrder?: number }) => {
  return await getDb().updateTimeSink(id, updates)
})

ipcMain.handle('db:deleteTimeSink', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteTimeSink(id)
})

ipcMain.handle('db:reorderTimeSinks', async (_event: IpcMainInvokeEvent, orderedIds: string[]) => {
  const sessionId = await getDb().getActiveSession()
  return await getDb().reorderTimeSinks(sessionId, orderedIds)
})

// Time sink session handlers
ipcMain.handle('db:createTimeSinkSession', async (_event: IpcMainInvokeEvent, data: { timeSinkId: string; startTime: string; endTime?: string; actualMinutes?: number; notes?: string }) => {
  return await getDb().createTimeSinkSession({
    ...data,
    startTime: new Date(data.startTime),
    endTime: data.endTime ? new Date(data.endTime) : undefined,
  })
})

ipcMain.handle('db:endTimeSinkSession', async (_event: IpcMainInvokeEvent, id: string, actualMinutes: number, notes?: string) => {
  return await getDb().endTimeSinkSession(id, actualMinutes, notes)
})

ipcMain.handle('db:getTimeSinkSessions', async (_event: IpcMainInvokeEvent, timeSinkId: string) => {
  return await getDb().getTimeSinkSessions(timeSinkId)
})

ipcMain.handle('db:getTimeSinkSessionsByDate', async (_event: IpcMainInvokeEvent, date: string) => {
  return await getDb().getTimeSinkSessionsByDate(date)
})

ipcMain.handle('db:getActiveTimeSinkSession', async () => {
  return await getDb().getActiveTimeSinkSession()
})

ipcMain.handle('db:getTimeSinkAccumulated', async (_event: IpcMainInvokeEvent, startDate: string, endDate: string) => {
  return await getDb().getTimeSinkAccumulated(startDate, endDate)
})

ipcMain.handle('db:deleteTimeSinkSession', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteTimeSinkSession(id)
})

ipcMain.handle('db:getTasks', async (_event: IpcMainInvokeEvent, includeArchived = false) => {
  mainLogger.info('Getting tasks from database...', { includeArchived })
  const tasks = await getDb().getTasks(includeArchived)
  mainLogger.info(`Found ${tasks.length} tasks`)
  return tasks
})

ipcMain.handle('db:getSequencedTasks', async () => {
  return await getDb().getSequencedTasks()
})

ipcMain.handle('db:createTask', async (_event: IpcMainInvokeEvent, taskData: Partial<Task>) => {
  return await getDb().createTask(taskData as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>)
})

ipcMain.handle('db:createSequencedTask', async (_event: IpcMainInvokeEvent, taskData: unknown) => {
  return await getDb().createSequencedTask(taskData)
})

ipcMain.handle('db:updateTask', async (_event: IpcMainInvokeEvent, id: string, updates: Partial<Task>) => {
  return await getDb().updateTask(id, updates)
})

ipcMain.handle('db:updateSequencedTask', async (_event: IpcMainInvokeEvent, id: string, updates: unknown) => {
  return await getDb().updateSequencedTask(id, updates)
})
ipcMain.handle('db:addStepToWorkflow', async (_event: IpcMainInvokeEvent, workflowId: string, stepData: Partial<TaskStep>) => {
  return await getDb().addStepToWorkflow(workflowId, stepData as any)
})

ipcMain.handle('db:deleteTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteTask(id)
})

ipcMain.handle('db:archiveTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().archiveTask(id)
})

ipcMain.handle('db:unarchiveTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().unarchiveTask(id)
})

ipcMain.handle('db:promoteTaskToWorkflow', async (_event: IpcMainInvokeEvent, taskId: string) => {
  return await getDb().promoteTaskToWorkflow(taskId)
})

ipcMain.handle('db:deleteSequencedTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteSequencedTask(id)
})

ipcMain.handle('db:initializeDefaultData', async () => {
  return await getDb().initializeDefaultData()
})

ipcMain.handle('db:getTaskById', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().getTaskById(id)
})

ipcMain.handle('db:getSequencedTaskById', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().getSequencedTaskById(id)
})

// Job context handlers
ipcMain.handle('db:getJobContexts', async () => {
  return await getDb().getJobContexts()
})

ipcMain.handle('db:getActiveJobContext', async () => {
  return await getDb().getActiveJobContext()
})

ipcMain.handle('db:createJobContext', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await getDb().createJobContext(data as any)
})

ipcMain.handle('db:updateJobContext', async (_event: IpcMainInvokeEvent, id: string, updates: unknown) => {
  return await getDb().updateJobContext(id, updates as any)
})

ipcMain.handle('db:deleteJobContext', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteJobContext(id)
})

ipcMain.handle('db:addContextEntry', async (_event: IpcMainInvokeEvent, jobContextId: string, entry: unknown) => {
  return await getDb().addContextEntry(jobContextId, entry)
})

// Jargon dictionary handlers
ipcMain.handle('db:getJargonEntries', async () => {
  return await getDb().getJargonEntries()
})

ipcMain.handle('db:createJargonEntry', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await getDb().createJargonEntry(data as any)
})

ipcMain.handle('db:updateJargonEntry', async (_event: IpcMainInvokeEvent, id: string, updates: unknown) => {
  return await getDb().updateJargonEntry(id, updates as any)
})

ipcMain.handle('db:updateJargonDefinition', async (_event: IpcMainInvokeEvent, term: string, definition: string) => {
  return await getDb().updateJargonDefinition(term, definition)
})

ipcMain.handle('db:deleteJargonEntry', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteJargonEntry(id)
})

ipcMain.handle('db:getJargonDictionary', async () => {
  return await getDb().getJargonDictionary()
})

// Conversation & Chat Message handlers
ipcMain.handle('db:getConversations', async () => {
  return await getDb().getConversations()
})

ipcMain.handle('db:getConversationById', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().getConversationById(id)
})

ipcMain.handle('db:createConversation', async (_event: IpcMainInvokeEvent, data: { title?: string; jobContextId?: string }) => {
  return await getDb().createConversation(data)
})

ipcMain.handle('db:updateConversation', async (_event: IpcMainInvokeEvent, id: string, updates: { title?: string; jobContextId?: string | null; isArchived?: boolean }) => {
  return await getDb().updateConversation(id, updates)
})

ipcMain.handle('db:deleteConversation', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteConversation(id)
})

ipcMain.handle('db:getChatMessages', async (_event: IpcMainInvokeEvent, conversationId: string) => {
  return await getDb().getChatMessages(conversationId)
})

ipcMain.handle('db:createChatMessage', async (_event: IpcMainInvokeEvent, data: { conversationId: string; role: ChatMessageRole; content: string; amendments?: AmendmentCard[] }) => {
  return await getDb().createChatMessage(data)
})

ipcMain.handle('db:updateMessageAmendmentStatus', async (_event: IpcMainInvokeEvent, messageId: string, cardId: string, status: AmendmentCardStatus) => {
  return await getDb().updateMessageAmendmentStatus(messageId, cardId, status)
})

ipcMain.handle('db:deleteChatMessage', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteChatMessage(id)
})

// Development helpers
ipcMain.handle('db:deleteAllTasks', async () => {
  return await getDb().deleteAllTasks()
})

ipcMain.handle('db:deleteAllSequencedTasks', async () => {
  return await getDb().deleteAllSequencedTasks()
})

ipcMain.handle('db:deleteAllUserData', async () => {
  return await getDb().deleteAllUserData()
})

// Log persistence handlers (dev mode only)
ipcMain.handle('log:persist', async (_event: IpcMainInvokeEvent, logEntry: any) => {
  return await getDb().persistLog(logEntry)
})

ipcMain.handle('log:persistBatch', async (_event: IpcMainInvokeEvent, logs: any[]) => {
  return await getDb().persistLogs(logs)
})

// Log retrieval handlers for LogViewer (dev mode)
ipcMain.handle('log:getSessionLogs', async (_event: IpcMainInvokeEvent, options?: LogQueryOptions) => {
  const parsedOptions = options ? {
    ...options,
    since: options.since ? new Date(options.since) : undefined,
  } : undefined
  return await getDb().getSessionLogs(parsedOptions)
})

ipcMain.handle('log:getLoggedSessions', async () => {
  return await getDb().getLoggedSessions()
})

// Work pattern handlers
ipcMain.handle('db:getWorkPattern', async (_event: IpcMainInvokeEvent, date: string) => {
  return await getDb().getWorkPattern(date)
})

ipcMain.handle('db:getWorkPatterns', async () => {
  return await getDb().getWorkPatterns()
})

ipcMain.handle('db:createWorkPattern', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await getDb().createWorkPattern(data as any)
})

ipcMain.handle('db:updateWorkPattern', async (_event: IpcMainInvokeEvent, id: string, data: unknown) => {
  return await getDb().updateWorkPattern(id, data as any)
})

ipcMain.handle('db:deleteWorkPattern', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteWorkPattern(id)
})

ipcMain.handle('db:getWorkTemplates', async () => {
  return await getDb().getWorkTemplates()
})

ipcMain.handle('db:saveAsTemplate', async (_event: IpcMainInvokeEvent, date: string, templateName: string) => {
  return await getDb().saveAsTemplate(date, templateName)
})

// Work session handlers
ipcMain.handle('db:createWorkSession', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await getDb().createWorkSession(data as any)
})

ipcMain.handle('db:updateWorkSession', async (_event: IpcMainInvokeEvent, id: string, data: unknown) => {
  return await getDb().updateWorkSession(id, data)
})

ipcMain.handle('db:deleteWorkSession', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteWorkSession(id)
})

ipcMain.handle(
  'db:splitWorkSession',
  async (
    _event: IpcMainInvokeEvent,
    sessionId: string,
    splitTime: string,
    secondHalfTaskId?: string,
    secondHalfStepId?: string,
  ) => {
    return await getDb().splitWorkSession(sessionId, new Date(splitTime), secondHalfTaskId, secondHalfStepId)
  },
)

ipcMain.handle(
  'db:splitTimeSinkSession',
  async (_event: IpcMainInvokeEvent, sessionId: string, splitTime: string) => {
    return await getDb().splitTimeSinkSession(sessionId, new Date(splitTime))
  },
)

ipcMain.handle('db:getWorkSessionsForTask', async (_event: IpcMainInvokeEvent, taskId: string) => {
  return await getDb().getWorkSessionsForTask(taskId)
})

ipcMain.handle('db:getWorkSessions', async (_event: IpcMainInvokeEvent, date: string) => {
  return await getDb().getWorkSessions(date)
})

ipcMain.handle('db:getActiveWorkSession', async () => {
  return await getDb().getActiveWorkSession()
})

ipcMain.handle('db:getTaskTotalLoggedTime', async (_event: IpcMainInvokeEvent, taskId: string) => {
  return await getDb().getTaskTotalLoggedTime(taskId)
})

ipcMain.handle('db:getTodayAccumulated', async (_event: IpcMainInvokeEvent, date: string) => {
  return await getDb().getTodayAccumulated(date)
})

// Progress tracking handlers
ipcMain.handle('db:createStepWorkSession', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await getDb().createStepWorkSession(data)
})

ipcMain.handle('db:updateTaskStepProgress', async (_event: IpcMainInvokeEvent, stepId: string, data: unknown) => {
  return await getDb().updateTaskStepProgress(stepId, data)
})

ipcMain.handle('db:getStepWorkSessions', async (_event: IpcMainInvokeEvent, stepId: string) => {
  return await getDb().getStepWorkSessions(stepId)
})

ipcMain.handle('db:recordTimeEstimate', async (_event: IpcMainInvokeEvent, data: unknown) => {
  return await getDb().recordTimeEstimate(data)
})

ipcMain.handle('db:getTimeAccuracyStats', async (_event: IpcMainInvokeEvent, filters?: unknown) => {
  return await getDb().getTimeAccuracyStats(filters)
})

// Schedule snapshot handlers
ipcMain.handle('db:createScheduleSnapshot', async (_event: IpcMainInvokeEvent, data: unknown, label?: string) => {
  return await getDb().createScheduleSnapshot(data as Parameters<DatabaseService['createScheduleSnapshot']>[0], label)
})

ipcMain.handle('db:getScheduleSnapshots', async (_event: IpcMainInvokeEvent, sessionId?: string) => {
  return await getDb().getScheduleSnapshots(sessionId)
})

ipcMain.handle('db:getScheduleSnapshotById', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().getScheduleSnapshotById(id)
})

ipcMain.handle('db:getTodayScheduleSnapshot', async () => {
  return await getDb().getTodayScheduleSnapshot()
})

ipcMain.handle('db:deleteScheduleSnapshot', async (_event: IpcMainInvokeEvent, id: string) => {
  return await getDb().deleteScheduleSnapshot(id)
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

  // Fetch job contexts to provide domain knowledge to the AI
  try {
    const jobContexts = await getDb().getJobContexts()
    if (jobContexts && jobContexts.length > 0) {
      (context as any).jobContexts = jobContexts
      mainLogger.debug('Including job contexts in amendment parsing', { count: jobContexts.length })
    }
  } catch (error) {
    mainLogger.error('Failed to fetch job contexts', { error: error instanceof Error ? error.message : String(error) })
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
ipcMain.handle('feedback:save', async (_event: IpcMainInvokeEvent, feedback: unknown) => {
  const fs = await import('fs/promises')
  // Use process.cwd() for development, which should be the project root
  const projectRoot = process.cwd()
  const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')

  mainLogger.info('Saving feedback', { path: feedbackPath })

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
  } catch (error) {
    // File doesn't exist yet or is invalid - start with empty feedback
    mainLogger.debug('No existing feedback file found or invalid format', {
      error: error instanceof Error ? error.message : String(error),
    })
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
    const feedbackItem = feedback as { timestamp?: string; sessionId?: string }
    const isDuplicate = allFeedback.some(existing =>
      existing.timestamp === feedbackItem.timestamp &&
      existing.sessionId === feedbackItem.sessionId,
    )
    if (!isDuplicate) {
      allFeedback.push(feedback)
    }
  }

  // Save all feedback (flat array only)
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

ipcMain.handle('feedback:update', async (_event: IpcMainInvokeEvent, updatedFeedback: unknown) => {
  const fs = await import('fs/promises')
  const projectRoot = process.cwd()
  const feedbackPath = path.join(projectRoot, 'context', 'feedback.json')

  mainLogger.info('Updating feedback', { path: feedbackPath })

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

  mainLogger.info('Feedback updated in context folder')
  return true
})

ipcMain.handle('app:getSessionId', () => {
  // Generate a session ID for feedback tracking
  return `session-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`
})

// Logging handler - forward renderer logs
ipcMain.on('log:message', (_event: unknown, { level, scope, message, data }: { level: string; scope?: string; message: string; data?: Record<string, unknown> }) => {
  // Add scope to context if provided
  const contextData = scope ? { ...data, scope } : data

  // Use the appropriate logger based on level
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
