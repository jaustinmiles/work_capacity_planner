const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

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
