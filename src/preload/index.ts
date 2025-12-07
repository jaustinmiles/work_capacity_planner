const { contextBridge, ipcRenderer } = require('electron')
import type { AICallOptions } from '../shared/types'
import type { LogQueryOptions, LogEntry, SessionLogSummary } from '../shared/log-types'

// Don't use logger in preload - it runs in a special context

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
    getCurrentSession: () => ipcRenderer.invoke('db:getCurrentSession'),
    updateSchedulingPreferences: (sessionId: string, updates: any) => ipcRenderer.invoke('db:updateSchedulingPreferences', sessionId, updates),
    // User task type operations
    getUserTaskTypes: (sessionId?: string) => ipcRenderer.invoke('db:getUserTaskTypes', sessionId),
    getUserTaskTypeById: (id: string) => ipcRenderer.invoke('db:getUserTaskTypeById', id),
    createUserTaskType: (input: any) => ipcRenderer.invoke('db:createUserTaskType', input),
    updateUserTaskType: (id: string, updates: any) => ipcRenderer.invoke('db:updateUserTaskType', id, updates),
    deleteUserTaskType: (id: string) => ipcRenderer.invoke('db:deleteUserTaskType', id),
    reorderUserTaskTypes: (orderedIds: string[]) => ipcRenderer.invoke('db:reorderUserTaskTypes', orderedIds),
    sessionHasTaskTypes: (sessionId?: string) => ipcRenderer.invoke('db:sessionHasTaskTypes', sessionId),
    // Time sink operations
    getTimeSinks: (sessionId?: string) => ipcRenderer.invoke('db:getTimeSinks', sessionId),
    getTimeSinkById: (id: string) => ipcRenderer.invoke('db:getTimeSinkById', id),
    createTimeSink: (input: { name: string; emoji: string; color: string; typeId?: string; sortOrder?: number }) =>
      ipcRenderer.invoke('db:createTimeSink', input),
    updateTimeSink: (id: string, updates: { name?: string; emoji?: string; color?: string; typeId?: string | null; sortOrder?: number }) =>
      ipcRenderer.invoke('db:updateTimeSink', id, updates),
    deleteTimeSink: (id: string) => ipcRenderer.invoke('db:deleteTimeSink', id),
    reorderTimeSinks: (orderedIds: string[]) => ipcRenderer.invoke('db:reorderTimeSinks', orderedIds),
    // Time sink session operations
    createTimeSinkSession: (data: { timeSinkId: string; startTime: string; endTime?: string; actualMinutes?: number; notes?: string }) =>
      ipcRenderer.invoke('db:createTimeSinkSession', data),
    endTimeSinkSession: (id: string, actualMinutes: number, notes?: string) =>
      ipcRenderer.invoke('db:endTimeSinkSession', id, actualMinutes, notes),
    getTimeSinkSessions: (timeSinkId: string) => ipcRenderer.invoke('db:getTimeSinkSessions', timeSinkId),
    getTimeSinkSessionsByDate: (date: string) => ipcRenderer.invoke('db:getTimeSinkSessionsByDate', date),
    getActiveTimeSinkSession: () => ipcRenderer.invoke('db:getActiveTimeSinkSession'),
    getTimeSinkAccumulated: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('db:getTimeSinkAccumulated', startDate, endDate),
    deleteTimeSinkSession: (id: string) => ipcRenderer.invoke('db:deleteTimeSinkSession', id),
    // Task operations
    getTasks: (includeArchived?: boolean) => ipcRenderer.invoke('db:getTasks', includeArchived),
    getSequencedTasks: () => ipcRenderer.invoke('db:getSequencedTasks'),
    createTask: (taskData: any) => ipcRenderer.invoke('db:createTask', taskData),
    createSequencedTask: (taskData: any) => ipcRenderer.invoke('db:createSequencedTask', taskData),
    updateTask: (id: string, updates: any) => ipcRenderer.invoke('db:updateTask', id, updates),
    updateSequencedTask: (id: string, updates: any) => ipcRenderer.invoke('db:updateSequencedTask', id, updates),
    deleteTask: (id: string) => ipcRenderer.invoke('db:deleteTask', id),
    archiveTask: (id: string) => ipcRenderer.invoke('db:archiveTask', id),
    unarchiveTask: (id: string) => ipcRenderer.invoke('db:unarchiveTask', id),
    promoteTaskToWorkflow: (taskId: string) => ipcRenderer.invoke('db:promoteTaskToWorkflow', taskId),
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
    getWorkPatterns: () => ipcRenderer.invoke('db:getWorkPatterns'),
    createWorkPattern: (data: any) => ipcRenderer.invoke('db:createWorkPattern', data),
    updateWorkPattern: (id: string, data: any) => ipcRenderer.invoke('db:updateWorkPattern', id, data),
    deleteWorkPattern: (id: string) => ipcRenderer.invoke('db:deleteWorkPattern', id),
    getWorkTemplates: () => ipcRenderer.invoke('db:getWorkTemplates'),
    saveAsTemplate: (date: string, templateName: string) => ipcRenderer.invoke('db:saveAsTemplate', date, templateName),
    // Work session operations
    createWorkSession: (data: any) => ipcRenderer.invoke('db:createWorkSession', data),
    updateWorkSession: (id: string, data: any) => ipcRenderer.invoke('db:updateWorkSession', id, data),
    deleteWorkSession: (id: string) => ipcRenderer.invoke('db:deleteWorkSession', id),
    splitWorkSession: (sessionId: string, splitTime: Date, secondHalfTaskId?: string, secondHalfStepId?: string) =>
      ipcRenderer.invoke('db:splitWorkSession', sessionId, splitTime.toISOString(), secondHalfTaskId, secondHalfStepId),
    splitTimeSinkSession: (sessionId: string, splitTime: Date) =>
      ipcRenderer.invoke('db:splitTimeSinkSession', sessionId, splitTime.toISOString()),
    getWorkSessions: (date: string) => ipcRenderer.invoke('db:getWorkSessions', date),
    getActiveWorkSession: () => ipcRenderer.invoke('db:getActiveWorkSession'),
    getWorkSessionsForTask: (taskId: string) => ipcRenderer.invoke('db:getWorkSessionsForTask', taskId),
    getTaskTotalLoggedTime: (taskId: string) => ipcRenderer.invoke('db:getTaskTotalLoggedTime', taskId),
    getTodayAccumulated: (date: string) => ipcRenderer.invoke('db:getTodayAccumulated', date),
    // Progress tracking operations
    createStepWorkSession: (data: any) => ipcRenderer.invoke('db:createStepWorkSession', data),
    updateTaskStepProgress: (stepId: string, data: any) => ipcRenderer.invoke('db:updateTaskStepProgress', stepId, data),
    getStepWorkSessions: (stepId: string) => ipcRenderer.invoke('db:getStepWorkSessions', stepId),
    recordTimeEstimate: (data: any) => ipcRenderer.invoke('db:recordTimeEstimate', data),
    getTimeAccuracyStats: (filters?: any) => ipcRenderer.invoke('db:getTimeAccuracyStats', filters),
    // Log viewer operations (dev mode)
    getSessionLogs: (options?: LogQueryOptions): Promise<LogEntry[]> =>
      ipcRenderer.invoke('log:getSessionLogs', options),
    getLoggedSessions: (): Promise<SessionLogSummary[]> =>
      ipcRenderer.invoke('log:getLoggedSessions'),
    // Schedule snapshot operations
    createScheduleSnapshot: (data: any, label?: string) =>
      ipcRenderer.invoke('db:createScheduleSnapshot', data, label),
    getScheduleSnapshots: (sessionId?: string) =>
      ipcRenderer.invoke('db:getScheduleSnapshots', sessionId),
    getScheduleSnapshotById: (id: string) =>
      ipcRenderer.invoke('db:getScheduleSnapshotById', id),
    getTodayScheduleSnapshot: () =>
      ipcRenderer.invoke('db:getTodayScheduleSnapshot'),
    deleteScheduleSnapshot: (id: string) =>
      ipcRenderer.invoke('db:deleteScheduleSnapshot', id),
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
    extractMultiDayScheduleFromVoice: (voiceText: string, startDate: string) => ipcRenderer.invoke('ai:extractMultiDayScheduleFromVoice', voiceText, startDate),
    parseAmendment: (transcription: string, context: any) => ipcRenderer.invoke('ai:parseAmendment', transcription, context),
    callAI: (options: AICallOptions) => ipcRenderer.invoke('ai:callAI', options),
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
  sendLog: (channel: string, payload: any) =>
    ipcRenderer.send(channel, payload),
  persistLog: (logEntry: any) =>
    ipcRenderer.invoke('log:persist', logEntry),
  persistLogs: (logs: any[]) =>
    ipcRenderer.invoke('log:persistBatch', logs),
  onMainLog: (callback: (entry: unknown) => void) =>
    ipcRenderer.on('log:from-main', (_event: unknown, entry: unknown) => callback(entry)),

  // Feedback operations
  saveFeedback: (feedback: any) => ipcRenderer.invoke('feedback:save', feedback),
  readFeedback: () => ipcRenderer.invoke('feedback:read'),
  loadFeedback: () => ipcRenderer.invoke('feedback:load'),
  updateFeedback: (updatedFeedback: any) => ipcRenderer.invoke('feedback:update', updatedFeedback),
  getSessionId: () => ipcRenderer.invoke('app:getSessionId'),
})
