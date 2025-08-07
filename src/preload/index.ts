const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  db: {
    // Session management
    getSessions: () => ipcRenderer.invoke('db:getSessions'),
    createSession: (name: string, description?: string) => ipcRenderer.invoke('db:createSession', name, description),
    switchSession: (sessionId: string) => ipcRenderer.invoke('db:switchSession', sessionId),
    updateSession: (id: string, updates: any) => ipcRenderer.invoke('db:updateSession', id, updates),
    deleteSession: (id: string) => ipcRenderer.invoke('db:deleteSession', id),
    // Task operations
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
    // Job context operations
    getJobContexts: () => ipcRenderer.invoke('db:getJobContexts'),
    getActiveJobContext: () => ipcRenderer.invoke('db:getActiveJobContext'),
    createJobContext: (data: any) => ipcRenderer.invoke('db:createJobContext', data),
    updateJobContext: (id: string, updates: any) => ipcRenderer.invoke('db:updateJobContext', id, updates),
    deleteJobContext: (id: string) => ipcRenderer.invoke('db:deleteJobContext', id),
    addContextEntry: (jobContextId: string, entry: any) => ipcRenderer.invoke('db:addContextEntry', jobContextId, entry),
    // Jargon dictionary
    getJargonEntries: () => ipcRenderer.invoke('db:getJargonEntries'),
    createJargonEntry: (data: any) => ipcRenderer.invoke('db:createJargonEntry', data),
    updateJargonEntry: (id: string, updates: any) => ipcRenderer.invoke('db:updateJargonEntry', id, updates),
    deleteJargonEntry: (id: string) => ipcRenderer.invoke('db:deleteJargonEntry', id),
    getJargonDictionary: () => ipcRenderer.invoke('db:getJargonDictionary'),
    // Development helpers
    deleteAllTasks: () => ipcRenderer.invoke('db:deleteAllTasks'),
    deleteAllSequencedTasks: () => ipcRenderer.invoke('db:deleteAllSequencedTasks'),
    // Work pattern operations
    getWorkPattern: (date: string) => ipcRenderer.invoke('db:getWorkPattern', date),
    createWorkPattern: (data: any) => ipcRenderer.invoke('db:createWorkPattern', data),
    updateWorkPattern: (id: string, data: any) => ipcRenderer.invoke('db:updateWorkPattern', id, data),
    getWorkTemplates: () => ipcRenderer.invoke('db:getWorkTemplates'),
    // Work session operations
    createWorkSession: (data: any) => ipcRenderer.invoke('db:createWorkSession', data),
    updateWorkSession: (id: string, data: any) => ipcRenderer.invoke('db:updateWorkSession', id, data),
    getWorkSessions: (date: string) => ipcRenderer.invoke('db:getWorkSessions', date),
    getTodayAccumulated: (date: string) => ipcRenderer.invoke('db:getTodayAccumulated', date),
  },

  // AI operations
  ai: {
    extractTasksFromBrainstorm: (brainstormText: string) => ipcRenderer.invoke('ai:extractTasksFromBrainstorm', brainstormText),
    extractWorkflowsFromBrainstorm: (brainstormText: string, jobContext?: string) => ipcRenderer.invoke('ai:extractWorkflowsFromBrainstorm', brainstormText, jobContext),
    generateWorkflowSteps: (taskDescription: string, context?: any) => ipcRenderer.invoke('ai:generateWorkflowSteps', taskDescription, context),
    enhanceTaskDetails: (taskName: string, currentDetails?: any) => ipcRenderer.invoke('ai:enhanceTaskDetails', taskName, currentDetails),
    getContextualQuestions: (taskName: string, taskDescription?: string) => ipcRenderer.invoke('ai:getContextualQuestions', taskName, taskDescription),
    getJobContextualQuestions: (brainstormText: string, jobContext?: string) => ipcRenderer.invoke('ai:getJobContextualQuestions', brainstormText, jobContext),
    extractScheduleFromVoice: (voiceText: string, targetDate: string) => ipcRenderer.invoke('ai:extractScheduleFromVoice', voiceText, targetDate),
  },

  // Speech operations
  speech: {
    transcribeAudio: (audioFilePath: string, options?: any) => ipcRenderer.invoke('speech:transcribeAudio', audioFilePath, options),
    transcribeAudioBuffer: (audioBuffer: Buffer, filename: string, options?: any) => ipcRenderer.invoke('speech:transcribeAudioBuffer', audioBuffer, filename, options),
    getSupportedFormats: () => ipcRenderer.invoke('speech:getSupportedFormats'),
    getBrainstormingSettings: () => ipcRenderer.invoke('speech:getBrainstormingSettings'),
    getWorkflowSettings: () => ipcRenderer.invoke('speech:getWorkflowSettings'),
    getSchedulingSettings: () => ipcRenderer.invoke('speech:getSchedulingSettings'),
  },
})
