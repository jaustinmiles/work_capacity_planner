const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
import { DatabaseService } from './database'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
  app.setAppUserModelId(app.getName())
}

let mainWindow: any = null

async function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: process.env.NODE_ENV === 'development'
        ? path.join(__dirname, '../../dist/index.js')
        : path.join(__dirname, '../preload/index.js'),
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

// Initialize database service
const db = DatabaseService.getInstance()

// IPC handlers for database operations
ipcMain.handle('db:getTasks', async () => {
  return await db.getTasks()
})

ipcMain.handle('db:getSequencedTasks', async () => {
  return await db.getSequencedTasks()
})

ipcMain.handle('db:createTask', async (_: any, taskData: any) => {
  return await db.createTask(taskData)
})

ipcMain.handle('db:createSequencedTask', async (_: any, taskData: any) => {
  return await db.createSequencedTask(taskData)
})

ipcMain.handle('db:updateTask', async (_: any, id: string, updates: any) => {
  return await db.updateTask(id, updates)
})

ipcMain.handle('db:updateSequencedTask', async (_: any, id: string, updates: any) => {
  return await db.updateSequencedTask(id, updates)
})

ipcMain.handle('db:deleteTask', async (_: any, id: string) => {
  return await db.deleteTask(id)
})

ipcMain.handle('db:deleteSequencedTask', async (_: any, id: string) => {
  return await db.deleteSequencedTask(id)
})

ipcMain.handle('db:initializeDefaultData', async () => {
  return await db.initializeDefaultData()
})

ipcMain.handle('db:getTaskById', async (_: any, id: string) => {
  return await db.getTaskById(id)
})

ipcMain.handle('db:getSequencedTaskById', async (_: any, id: string) => {
  return await db.getSequencedTaskById(id)
})

// Job context handlers
ipcMain.handle('db:getJobContexts', async () => {
  return await db.getJobContexts()
})

ipcMain.handle('db:getActiveJobContext', async () => {
  return await db.getActiveJobContext()
})

ipcMain.handle('db:createJobContext', async (_: any, data: any) => {
  return await db.createJobContext(data)
})

ipcMain.handle('db:updateJobContext', async (_: any, id: string, updates: any) => {
  return await db.updateJobContext(id, updates)
})

ipcMain.handle('db:deleteJobContext', async (_: any, id: string) => {
  return await db.deleteJobContext(id)
})

ipcMain.handle('db:addContextEntry', async (_: any, jobContextId: string, entry: any) => {
  return await db.addContextEntry(jobContextId, entry)
})

// Jargon dictionary handlers
ipcMain.handle('db:getJargonEntries', async () => {
  return await db.getJargonEntries()
})

ipcMain.handle('db:createJargonEntry', async (_: any, data: any) => {
  return await db.createJargonEntry(data)
})

ipcMain.handle('db:updateJargonEntry', async (_: any, id: string, updates: any) => {
  return await db.updateJargonEntry(id, updates)
})

ipcMain.handle('db:deleteJargonEntry', async (_: any, id: string) => {
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

// Work pattern handlers
ipcMain.handle('db:getWorkPattern', async (_: any, date: string) => {
  return await db.getWorkPattern(date)
})

ipcMain.handle('db:createWorkPattern', async (_: any, data: any) => {
  return await db.createWorkPattern(data)
})

ipcMain.handle('db:updateWorkPattern', async (_: any, id: string, data: any) => {
  return await db.updateWorkPattern(id, data)
})

ipcMain.handle('db:getWorkTemplates', async () => {
  return await db.getWorkTemplates()
})

// Work session handlers
ipcMain.handle('db:createWorkSession', async (_: any, data: any) => {
  return await db.createWorkSession(data)
})

ipcMain.handle('db:updateWorkSession', async (_: any, id: string, data: any) => {
  return await db.updateWorkSession(id, data)
})

ipcMain.handle('db:getWorkSessions', async (_: any, date: string) => {
  return await db.getWorkSessions(date)
})

ipcMain.handle('db:getTodayAccumulated', async (_: any, date: string) => {
  return await db.getTodayAccumulated(date)
})
