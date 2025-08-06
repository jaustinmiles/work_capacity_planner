const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

// Load environment variables
require('dotenv').config()

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId(app.getName())
}

let mainWindow = null

async function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'dist/index.js'),
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
    mainWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html'))
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
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

// Import and initialize database service
let db
try {
  const { DatabaseService } = require('./dist/main/database')
  db = DatabaseService.getInstance()
  console.log('Database service initialized successfully')
} catch (error) {
  console.error('Failed to initialize database service:', error)
}

// Import AI service
let aiService
try {
  const { getAIService } = require('./dist/ai-service')
  aiService = getAIService()
  console.log('AI service initialized successfully')
} catch (error) {
  console.error('Failed to initialize AI service:', error)
}

// Import Speech service
let speechService
try {
  const { getSpeechService } = require('./dist/speech-service')
  speechService = getSpeechService()
  console.log('Speech service initialized successfully')
} catch (error) {
  console.error('Failed to initialize speech service:', error)
}

// IPC handlers for database operations
ipcMain.handle('db:getTasks', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.getTasks()
})

ipcMain.handle('db:getSequencedTasks', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.getSequencedTasks()
})

ipcMain.handle('db:createTask', async (_, taskData) => {
  if (!db) throw new Error('Database not initialized')
  return await db.createTask(taskData)
})

ipcMain.handle('db:createSequencedTask', async (_, taskData) => {
  if (!db) throw new Error('Database not initialized')
  return await db.createSequencedTask(taskData)
})

ipcMain.handle('db:updateTask', async (_, id, updates) => {
  if (!db) throw new Error('Database not initialized')
  return await db.updateTask(id, updates)
})

ipcMain.handle('db:updateSequencedTask', async (_, id, updates) => {
  if (!db) throw new Error('Database not initialized')
  return await db.updateSequencedTask(id, updates)
})

ipcMain.handle('db:deleteTask', async (_, id) => {
  if (!db) throw new Error('Database not initialized')
  return await db.deleteTask(id)
})

ipcMain.handle('db:deleteSequencedTask', async (_, id) => {
  if (!db) throw new Error('Database not initialized')
  return await db.deleteSequencedTask(id)
})

ipcMain.handle('db:initializeDefaultData', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.initializeDefaultData()
})

ipcMain.handle('db:getTaskById', async (_, id) => {
  if (!db) throw new Error('Database not initialized')
  return await db.getTaskById(id)
})

ipcMain.handle('db:getSequencedTaskById', async (_, id) => {
  if (!db) throw new Error('Database not initialized')
  return await db.getSequencedTaskById(id)
})

// IPC handlers for AI operations
ipcMain.handle('ai:extractTasksFromBrainstorm', async (_, brainstormText) => {
  if (!aiService) throw new Error('AI service not initialized')
  return await aiService.extractTasksFromBrainstorm(brainstormText)
})

ipcMain.handle('ai:generateWorkflowSteps', async (_, taskDescription, context) => {
  if (!aiService) throw new Error('AI service not initialized')
  return await aiService.generateWorkflowSteps(taskDescription, context)
})

ipcMain.handle('ai:enhanceTaskDetails', async (_, taskName, currentDetails) => {
  if (!aiService) throw new Error('AI service not initialized')
  return await aiService.enhanceTaskDetails(taskName, currentDetails)
})

ipcMain.handle('ai:getContextualQuestions', async (_, taskName, taskDescription) => {
  if (!aiService) throw new Error('AI service not initialized')
  return await aiService.getContextualQuestions(taskName, taskDescription)
})

ipcMain.handle('ai:extractWorkflowsFromBrainstorm', async (_, brainstormText, jobContext) => {
  if (!aiService) throw new Error('AI service not initialized')
  return await aiService.extractWorkflowsFromBrainstorm(brainstormText, jobContext)
})

ipcMain.handle('ai:getJobContextualQuestions', async (_, brainstormText, jobContext) => {
  if (!aiService) throw new Error('AI service not initialized')
  return await aiService.getJobContextualQuestions(brainstormText, jobContext)
})

// IPC handlers for speech operations
ipcMain.handle('speech:transcribeAudio', async (_, audioFilePath, options) => {
  if (!speechService) throw new Error('Speech service not initialized')
  return await speechService.transcribeAudio(audioFilePath, options)
})

ipcMain.handle('speech:transcribeAudioBuffer', async (_, audioBuffer, filename, options) => {
  if (!speechService) throw new Error('Speech service not initialized')
  return await speechService.transcribeAudioBuffer(audioBuffer, filename, options)
})

ipcMain.handle('speech:getSupportedFormats', async () => {
  if (!speechService) throw new Error('Speech service not initialized')
  return speechService.getSupportedFormats()
})

ipcMain.handle('speech:getBrainstormingSettings', async () => {
  if (!speechService) throw new Error('Speech service not initialized')
  return speechService.getBrainstormingSettings()
})

ipcMain.handle('speech:getWorkflowSettings', async () => {
  if (!speechService) throw new Error('Speech service not initialized')
  return speechService.getWorkflowSettings()
})

// IPC handlers for job context operations
ipcMain.handle('db:getJobContexts', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.getJobContexts()
})

ipcMain.handle('db:getActiveJobContext', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.getActiveJobContext()
})

ipcMain.handle('db:createJobContext', async (_, data) => {
  if (!db) throw new Error('Database not initialized')
  return await db.createJobContext(data)
})

ipcMain.handle('db:updateJobContext', async (_, id, updates) => {
  if (!db) throw new Error('Database not initialized')
  return await db.updateJobContext(id, updates)
})

ipcMain.handle('db:deleteJobContext', async (_, id) => {
  if (!db) throw new Error('Database not initialized')
  return await db.deleteJobContext(id)
})

ipcMain.handle('db:addContextEntry', async (_, jobContextId, entry) => {
  if (!db) throw new Error('Database not initialized')
  return await db.addContextEntry(jobContextId, entry)
})

// Jargon dictionary operations
ipcMain.handle('db:getJargonEntries', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.getJargonEntries()
})

ipcMain.handle('db:createJargonEntry', async (_, data) => {
  if (!db) throw new Error('Database not initialized')
  return await db.createJargonEntry(data)
})

ipcMain.handle('db:updateJargonEntry', async (_, id, updates) => {
  if (!db) throw new Error('Database not initialized')
  return await db.updateJargonEntry(id, updates)
})

ipcMain.handle('db:deleteJargonEntry', async (_, id) => {
  if (!db) throw new Error('Database not initialized')
  return await db.deleteJargonEntry(id)
})

ipcMain.handle('db:getJargonDictionary', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.getJargonDictionary()
})

// Development helpers
ipcMain.handle('db:deleteAllTasks', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.deleteAllTasks()
})

ipcMain.handle('db:deleteAllSequencedTasks', async () => {
  if (!db) throw new Error('Database not initialized')
  return await db.deleteAllSequencedTasks()
})
