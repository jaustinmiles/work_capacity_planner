const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  db: {
    getTasks: () => ipcRenderer.invoke('db:getTasks'),
    getSequencedTasks: () => ipcRenderer.invoke('db:getSequencedTasks'),
    createTask: (taskData: any) => ipcRenderer.invoke('db:createTask', taskData),
    createSequencedTask: (taskData: any) => ipcRenderer.invoke('db:createSequencedTask', taskData),
    updateTask: (id: string, updates: any) => ipcRenderer.invoke('db:updateTask', id, updates),
    updateSequencedTask: (id: string, updates: any) => ipcRenderer.invoke('db:updateSequencedTask', id, updates),
    deleteTask: (id: string) => ipcRenderer.invoke('db:deleteTask', id),
    deleteSequencedTask: (id: string) => ipcRenderer.invoke('db:deleteSequencedTask', id),
    initializeDefaultData: () => ipcRenderer.invoke('db:initializeDefaultData'),
    getTaskById: (id: string) => ipcRenderer.invoke('db:getTaskById', id),
    getSequencedTaskById: (id: string) => ipcRenderer.invoke('db:getSequencedTaskById', id),
  },

  // AI operations
  ai: {
    extractTasksFromBrainstorm: (brainstormText: string) => ipcRenderer.invoke('ai:extractTasksFromBrainstorm', brainstormText),
    generateWorkflowSteps: (taskDescription: string, context?: any) => ipcRenderer.invoke('ai:generateWorkflowSteps', taskDescription, context),
    enhanceTaskDetails: (taskName: string, currentDetails?: any) => ipcRenderer.invoke('ai:enhanceTaskDetails', taskName, currentDetails),
    getContextualQuestions: (taskName: string, taskDescription?: string) => ipcRenderer.invoke('ai:getContextualQuestions', taskName, taskDescription),
  },

  // Speech operations
  speech: {
    transcribeAudio: (audioFilePath: string, options?: any) => ipcRenderer.invoke('speech:transcribeAudio', audioFilePath, options),
    transcribeAudioBuffer: (audioBuffer: Buffer, filename: string, options?: any) => ipcRenderer.invoke('speech:transcribeAudioBuffer', audioBuffer, filename, options),
    getSupportedFormats: () => ipcRenderer.invoke('speech:getSupportedFormats'),
    getBrainstormingSettings: () => ipcRenderer.invoke('speech:getBrainstormingSettings'),
    getWorkflowSettings: () => ipcRenderer.invoke('speech:getWorkflowSettings'),
  },
})
