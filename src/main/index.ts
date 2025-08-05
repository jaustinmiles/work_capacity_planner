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
