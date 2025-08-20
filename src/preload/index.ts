const { contextBridge, ipcRenderer } = require('electron')

// Don't use logger in preload - it runs in a special context
// logger.debug('Preload script loading...')

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
    addStepToWorkflow: (workflowId: string, stepData: any) => ipcRenderer.invoke('db:addStepToWorkflow', workflowId, stepData),
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
    updateJargonDefinition: (term: string, definition: string) => ipcRenderer.invoke('db:updateJargonDefinition', term, definition),
    // Development helpers
    deleteAllTasks: () => ipcRenderer.invoke('db:deleteAllTasks'),
    deleteAllSequencedTasks: () => ipcRenderer.invoke('db:deleteAllSequencedTasks'),
    deleteAllUserData: () => ipcRenderer.invoke('db:deleteAllUserData'),
    // Work pattern operations
    getWorkPattern: (date: string) => ipcRenderer.invoke('db:getWorkPattern', date),
    createWorkPattern: (data: any) => ipcRenderer.invoke('db:createWorkPattern', data),
    updateWorkPattern: (id: string, data: any) => ipcRenderer.invoke('db:updateWorkPattern', id, data),
    getWorkTemplates: () => ipcRenderer.invoke('db:getWorkTemplates'),
    saveAsTemplate: (date: string, templateName: string) => ipcRenderer.invoke('db:saveAsTemplate', date, templateName),
    // Work session operations
    createWorkSession: (data: any) => ipcRenderer.invoke('db:createWorkSession', data),
    updateWorkSession: (id: string, data: any) => ipcRenderer.invoke('db:updateWorkSession', id, data),
    deleteWorkSession: (id: string) => ipcRenderer.invoke('db:deleteWorkSession', id),
    getWorkSessions: (date: string) => ipcRenderer.invoke('db:getWorkSessions', date),
    getWorkSessionsForTask: (taskId: string) => ipcRenderer.invoke('db:getWorkSessionsForTask', taskId),
    getTaskTotalLoggedTime: (taskId: string) => ipcRenderer.invoke('db:getTaskTotalLoggedTime', taskId),
    getTodayAccumulated: (date: string) => ipcRenderer.invoke('db:getTodayAccumulated', date),
    // Progress tracking operations
    createStepWorkSession: (data: any) => ipcRenderer.invoke('db:createStepWorkSession', data),
    updateTaskStepProgress: (stepId: string, data: any) => ipcRenderer.invoke('db:updateTaskStepProgress', stepId, data),
    getStepWorkSessions: (stepId: string) => ipcRenderer.invoke('db:getStepWorkSessions', stepId),
    recordTimeEstimate: (data: any) => ipcRenderer.invoke('db:recordTimeEstimate', data),
    getTimeAccuracyStats: (filters?: any) => ipcRenderer.invoke('db:getTimeAccuracyStats', filters),
  },

  // AI operations
  ai: {
    extractTasksFromBrainstorm: (brainstormText: string) => ipcRenderer.invoke('ai:extractTasksFromBrainstorm', brainstormText),
    extractWorkflowsFromBrainstorm: (brainstormText: string, jobContext?: string) => ipcRenderer.invoke('ai:extractWorkflowsFromBrainstorm', brainstormText, jobContext),
    extractJargonTerms: (contextText: string) => ipcRenderer.invoke('ai:extractJargonTerms', contextText),
    generateWorkflowSteps: (taskDescription: string, context?: any) => ipcRenderer.invoke('ai:generateWorkflowSteps', taskDescription, context),
    enhanceTaskDetails: (taskName: string, currentDetails?: any) => ipcRenderer.invoke('ai:enhanceTaskDetails', taskName, currentDetails),
    getContextualQuestions: (taskName: string, taskDescription?: string) => ipcRenderer.invoke('ai:getContextualQuestions', taskName, taskDescription),
    getJobContextualQuestions: (brainstormText: string, jobContext?: string) => ipcRenderer.invoke('ai:getJobContextualQuestions', brainstormText, jobContext),
    extractScheduleFromVoice: (voiceText: string, targetDate: string) => ipcRenderer.invoke('ai:extractScheduleFromVoice', voiceText, targetDate),
    parseAmendment: (transcription: string, context: any) => ipcRenderer.invoke('ai:parseAmendment', transcription, context),
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

  // Logging operations
  log: (level: string, scope: string, message: string, data?: any) =>
    ipcRenderer.send('log:message', { level, scope, message, data }),

  // Feedback operations
  saveFeedback: (feedback: any) => ipcRenderer.invoke('feedback:save', feedback),
  readFeedback: () => ipcRenderer.invoke('feedback:read'),
  loadFeedback: () => ipcRenderer.invoke('feedback:load'),
  updateFeedback: (updatedFeedback: any) => ipcRenderer.invoke('feedback:update', updatedFeedback),
  getSessionId: () => ipcRenderer.invoke('app:getSessionId'),
})

// logger.debug('Preload script loaded successfully!')
