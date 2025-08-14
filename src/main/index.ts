import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { DatabaseService } from './database'
import { getAIService } from '../shared/ai-service'
import { getSpeechService } from '../shared/speech-service'

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
  console.log('Main process initialized successfully')
  
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
  console.log('Getting sessions...')
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

ipcMain.handle('db:deleteSession', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteSession(id)
})

ipcMain.handle('db:getTasks', async () => {
  console.log('IPC: Getting tasks from database...')
  try {
    const tasks = await db.getTasks()
    console.log(`IPC: Found ${tasks.length} tasks`)
    return tasks
  } catch (error) {
    console.error('IPC: Error getting tasks:', error)
    throw error
  }
})

ipcMain.handle('db:getSequencedTasks', async () => {
  return await db.getSequencedTasks()
})

ipcMain.handle('db:createTask', async (_event: IpcMainInvokeEvent, taskData: any) => {
  return await db.createTask(taskData)
})

ipcMain.handle('db:createSequencedTask', async (_event: IpcMainInvokeEvent, taskData: any) => {
  return await db.createSequencedTask(taskData)
})

ipcMain.handle('db:updateTask', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
  return await db.updateTask(id, updates)
})

ipcMain.handle('db:updateSequencedTask', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
  return await db.updateSequencedTask(id, updates)
})

ipcMain.handle('db:deleteTask', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteTask(id)
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

ipcMain.handle('db:createJobContext', async (_event: IpcMainInvokeEvent, data: any) => {
  return await db.createJobContext(data)
})

ipcMain.handle('db:updateJobContext', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
  return await db.updateJobContext(id, updates)
})

ipcMain.handle('db:deleteJobContext', async (_event: IpcMainInvokeEvent, id: string) => {
  return await db.deleteJobContext(id)
})

ipcMain.handle('db:addContextEntry', async (_event: IpcMainInvokeEvent, jobContextId: string, entry: any) => {
  return await db.addContextEntry(jobContextId, entry)
})

// Jargon dictionary handlers
ipcMain.handle('db:getJargonEntries', async () => {
  return await db.getJargonEntries()
})

ipcMain.handle('db:createJargonEntry', async (_event: IpcMainInvokeEvent, data: any) => {
  return await db.createJargonEntry(data)
})

ipcMain.handle('db:updateJargonEntry', async (_event: IpcMainInvokeEvent, id: string, updates: any) => {
  return await db.updateJargonEntry(id, updates)
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

// Work pattern handlers
ipcMain.handle('db:getWorkPattern', async (_event: IpcMainInvokeEvent, date: string) => {
  return await db.getWorkPattern(date)
})

ipcMain.handle('db:createWorkPattern', async (_event: IpcMainInvokeEvent, data: any) => {
  return await db.createWorkPattern(data)
})

ipcMain.handle('db:updateWorkPattern', async (_event: IpcMainInvokeEvent, id: string, data: any) => {
  return await db.updateWorkPattern(id, data)
})

ipcMain.handle('db:getWorkTemplates', async () => {
  return await db.getWorkTemplates()
})

ipcMain.handle('db:saveAsTemplate', async (_event: IpcMainInvokeEvent, date: string, templateName: string) => {
  return await db.saveAsTemplate(date, templateName)
})

// Work session handlers
ipcMain.handle('db:createWorkSession', async (_event: IpcMainInvokeEvent, data: any) => {
  return await db.createWorkSession(data)
})

ipcMain.handle('db:updateWorkSession', async (_event: IpcMainInvokeEvent, id: string, data: any) => {
  return await db.updateWorkSession(id, data)
})

ipcMain.handle('db:getWorkSessions', async (_event: IpcMainInvokeEvent, date: string) => {
  return await db.getWorkSessions(date)
})

ipcMain.handle('db:getTaskTotalLoggedTime', async (_event: IpcMainInvokeEvent, taskId: string) => {
  return await db.getTaskTotalLoggedTime(taskId)
})

ipcMain.handle('db:getTodayAccumulated', async (_event: IpcMainInvokeEvent, date: string) => {
  return await db.getTodayAccumulated(date)
})

// Progress tracking handlers
ipcMain.handle('db:createStepWorkSession', async (_event: IpcMainInvokeEvent, data: any) => {
  return await db.createStepWorkSession(data)
})

ipcMain.handle('db:updateTaskStepProgress', async (_event: IpcMainInvokeEvent, stepId: string, data: any) => {
  return await db.updateTaskStepProgress(stepId, data)
})

ipcMain.handle('db:getStepWorkSessions', async (_event: IpcMainInvokeEvent, stepId: string) => {
  return await db.getStepWorkSessions(stepId)
})

ipcMain.handle('db:recordTimeEstimate', async (_event: IpcMainInvokeEvent, data: any) => {
  return await db.recordTimeEstimate(data)
})

ipcMain.handle('db:getTimeAccuracyStats', async (_event: IpcMainInvokeEvent, filters?: any) => {
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

ipcMain.handle('ai:generateWorkflowSteps', async (_event: IpcMainInvokeEvent, taskDescription: string, context?: any) => {
  const aiService = getAIService()
  return await aiService.generateWorkflowSteps(taskDescription, context)
})

ipcMain.handle('ai:enhanceTaskDetails', async (_event: IpcMainInvokeEvent, taskName: string, currentDetails?: any) => {
  const aiService = getAIService()
  return await aiService.enhanceTaskDetails(taskName, currentDetails)
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

// Speech operation handlers
ipcMain.handle('speech:transcribeAudio', async (_event: IpcMainInvokeEvent, audioFilePath: string, options?: any) => {
  const speechService = getSpeechService()
  return await speechService.transcribeAudio(audioFilePath, options)
})

ipcMain.handle('speech:transcribeAudioBuffer', async (_event: IpcMainInvokeEvent, audioBuffer: Buffer, filename: string, options?: any) => {
  const speechService = getSpeechService()
  return await speechService.transcribeAudioBuffer(audioBuffer, filename, options)
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
