const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Tasks
  createTask: (task: any) => ipcRenderer.invoke('task:create', task),
  updateTask: (id: string, updates: any) => ipcRenderer.invoke('task:update', id, updates),
  deleteTask: (id: string) => ipcRenderer.invoke('task:delete', id),
  getTasks: (filters?: any) => ipcRenderer.invoke('task:list', filters),
  
  // Schedule
  getSchedules: () => ipcRenderer.invoke('schedule:get'),
  updateSchedule: (day: string, schedule: any) => ipcRenderer.invoke('schedule:update', day, schedule),
  
  // Backup
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: (path: string) => ipcRenderer.invoke('backup:restore', path),
  
  // Export
  exportCSV: (startDate: Date, endDate: Date) => ipcRenderer.invoke('export:csv', startDate, endDate),
  exportJSON: () => ipcRenderer.invoke('export:json'),
  
  // Event listeners
  on: (channel: string, callback: Function) => {
    ipcRenderer.on(channel, (_event: any, ...args: any[]) => callback(...args))
  },
  off: (channel: string, callback: Function) => {
    ipcRenderer.removeListener(channel, callback as any)
  }
})