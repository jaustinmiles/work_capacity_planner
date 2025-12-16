/**
 * HTTP API Client for Task Planner
 *
 * This client replaces the Electron IPC calls with HTTP requests to the server.
 * All clients (desktop, mobile, web) use this same interface.
 */

/* global fetch, URLSearchParams, RequestInit, BlobPart */

import { BlockConfigKind, WorkBlockType } from '@/shared/enums'
import { calculateBlockCapacity } from '@/shared/capacity-calculator'
import type { BlockTypeConfig } from '@/shared/user-task-types'

// Default to localhost:3001, but can be configured
let API_BASE_URL = 'http://localhost:3001'

// ============================================================================
// DATA TRANSFORMATION HELPERS
// ============================================================================

// Default typeConfig fallback for blocks that have null typeConfig
const DEFAULT_TYPE_CONFIG: BlockTypeConfig = { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked }

/**
 * Parse typeConfig from JSON string to object.
 */
function parseTypeConfig(typeConfigStr: string | null): BlockTypeConfig {
  if (!typeConfigStr) return DEFAULT_TYPE_CONFIG
  try {
    return JSON.parse(typeConfigStr) as BlockTypeConfig
  } catch {
    return DEFAULT_TYPE_CONFIG
  }
}

/**
 * Transform a raw database WorkBlock to the expected format.
 */
function transformBlock(dbBlock: {
  id: string
  startTime: string
  endTime: string
  typeConfig: string | null
  totalCapacity?: number
}): any {
  const typeConfig = parseTypeConfig(dbBlock.typeConfig)
  const capacity = calculateBlockCapacity(typeConfig, dbBlock.startTime, dbBlock.endTime)

  return {
    id: dbBlock.id,
    startTime: dbBlock.startTime,
    endTime: dbBlock.endTime,
    typeConfig,
    capacity,
  }
}

/**
 * Transform a raw database WorkMeeting to the expected format.
 */
function transformMeeting(dbMeeting: {
  id: string
  name: string
  startTime: string
  endTime: string
  type: string
  recurring?: string | null
  daysOfWeek?: string | null
}): any {
  return {
    id: dbMeeting.id,
    name: dbMeeting.name,
    startTime: dbMeeting.startTime,
    endTime: dbMeeting.endTime,
    type: dbMeeting.type,
    recurring: dbMeeting.recurring || 'none',
    daysOfWeek: dbMeeting.daysOfWeek ? JSON.parse(dbMeeting.daysOfWeek) : null,
  }
}

/**
 * Transform a raw database WorkPattern to the expected DailyWorkPattern format.
 */
function transformWorkPattern(dbPattern: any): any {
  if (!dbPattern) return null
  return {
    id: dbPattern.id,
    date: dbPattern.date,
    isTemplate: dbPattern.isTemplate,
    templateName: dbPattern.templateName,
    blocks: (dbPattern.WorkBlock || []).map(transformBlock),
    meetings: (dbPattern.WorkMeeting || []).map(transformMeeting),
    accumulated: {}, // Computed separately - empty for now
  }
}

export function setApiBaseUrl(url: string): void {
  API_BASE_URL = url
}

export function getApiBaseUrl(): string {
  return API_BASE_URL
}

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || `API error: ${response.status}`)
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

// ============================================================================
// SESSION OPERATIONS
// ============================================================================

export async function getSessions(): Promise<any[]> {
  return apiFetch('/api/sessions')
}

export async function getActiveSession(): Promise<any | null> {
  try {
    return await apiFetch('/api/sessions/active')
  } catch {
    return null
  }
}

export async function createSession(name: string, description?: string): Promise<any> {
  return apiFetch('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
}

export async function updateSession(
  id: string,
  updates: { name?: string; description?: string },
): Promise<any> {
  return apiFetch(`/api/sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function activateSession(id: string): Promise<any> {
  return apiFetch(`/api/sessions/${id}/activate`, {
    method: 'PUT',
  })
}

export async function deleteSession(id: string): Promise<void> {
  return apiFetch(`/api/sessions/${id}`, {
    method: 'DELETE',
  })
}

// Alias for switchSession - activates a session
export const switchSession = activateSession

// ============================================================================
// TASK OPERATIONS
// ============================================================================

export async function getTasks(filters?: {
  archived?: boolean
  type?: string
  status?: string
  completed?: boolean
}): Promise<any[]> {
  const params = new URLSearchParams()
  if (filters?.archived !== undefined) params.set('archived', String(filters.archived))
  if (filters?.type) params.set('type', filters.type)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.completed !== undefined) params.set('completed', String(filters.completed))

  const query = params.toString()
  return apiFetch(`/api/tasks${query ? `?${query}` : ''}`)
}

export async function getTaskById(id: string): Promise<any | null> {
  try {
    return await apiFetch(`/api/tasks/${id}`)
  } catch {
    return null
  }
}

export async function createTask(taskData: any): Promise<any> {
  return apiFetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  })
}

export async function updateTask(id: string, updates: any): Promise<any> {
  return apiFetch(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteTask(id: string): Promise<void> {
  return apiFetch(`/api/tasks/${id}`, {
    method: 'DELETE',
  })
}

export async function completeTask(id: string, actualDuration?: number): Promise<any> {
  return apiFetch(`/api/tasks/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ actualDuration }),
  })
}

export async function archiveTask(id: string): Promise<any> {
  return apiFetch(`/api/tasks/${id}/archive`, {
    method: 'POST',
  })
}

export async function unarchiveTask(id: string): Promise<any> {
  return apiFetch(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ archived: false }),
  })
}

export async function promoteTaskToWorkflow(taskId: string): Promise<any> {
  return apiFetch(`/api/tasks/${taskId}/promote`, {
    method: 'POST',
  })
}

// ============================================================================
// TASK STEP OPERATIONS
// ============================================================================

export async function getTaskSteps(taskId: string): Promise<any[]> {
  return apiFetch(`/api/tasks/${taskId}/steps`)
}

export async function addTaskStep(taskId: string, stepData: any): Promise<any> {
  return apiFetch(`/api/tasks/${taskId}/steps`, {
    method: 'POST',
    body: JSON.stringify(stepData),
  })
}

export async function updateTaskStep(taskId: string, stepId: string, updates: any): Promise<any> {
  return apiFetch(`/api/tasks/${taskId}/steps/${stepId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteTaskStep(taskId: string, stepId: string): Promise<void> {
  return apiFetch(`/api/tasks/${taskId}/steps/${stepId}`, {
    method: 'DELETE',
  })
}

// ============================================================================
// WORKFLOW OPERATIONS (tasks with steps)
// ============================================================================

export async function getWorkflows(): Promise<any[]> {
  return apiFetch('/api/workflows')
}

export async function createWorkflow(workflowData: any): Promise<any> {
  return apiFetch('/api/workflows', {
    method: 'POST',
    body: JSON.stringify(workflowData),
  })
}

export async function deleteWorkflow(id: string): Promise<void> {
  return apiFetch(`/api/workflows/${id}`, {
    method: 'DELETE',
  })
}

// Aliases for sequenced task compatibility
export const getSequencedTasks = getWorkflows
export const createSequencedTask = createWorkflow
export const deleteSequencedTask = deleteWorkflow

export async function getSequencedTaskById(id: string): Promise<any | null> {
  return getTaskById(id)
}

export async function updateSequencedTask(id: string, updates: any): Promise<any> {
  return updateTask(id, updates)
}

export async function addStepToWorkflow(workflowId: string, stepData: any): Promise<any> {
  await addTaskStep(workflowId, stepData)
  return getTaskById(workflowId)
}

// ============================================================================
// WORK SESSION OPERATIONS
// ============================================================================

export async function getWorkSessions(date?: string): Promise<any[]> {
  const params = date ? `?date=${date}` : ''
  return apiFetch(`/api/work-sessions${params}`)
}

export async function getActiveWorkSession(): Promise<any | null> {
  return apiFetch('/api/work-sessions/active')
}

export async function startWorkSession(data: {
  taskId: string
  stepId?: string
  plannedMinutes?: number
  notes?: string
}): Promise<any> {
  return apiFetch('/api/work-sessions/start', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function stopWorkSession(id: string, notes?: string): Promise<any> {
  return apiFetch(`/api/work-sessions/${id}/stop`, {
    method: 'PUT',
    body: JSON.stringify({ notes }),
  })
}

export async function deleteWorkSession(id: string): Promise<void> {
  return apiFetch(`/api/work-sessions/${id}`, {
    method: 'DELETE',
  })
}

export async function splitWorkSession(
  sessionId: string,
  splitTime: Date,
  secondHalfTaskId?: string,
  secondHalfStepId?: string,
): Promise<{ firstHalf: any; secondHalf: any }> {
  const result = await apiFetch<{ original: any; new: any }>(`/api/work-sessions/${sessionId}/split`, {
    method: 'POST',
    body: JSON.stringify({
      splitTime: splitTime.toISOString(),
      secondHalfTaskId,
      secondHalfStepId,
    }),
  })
  return { firstHalf: result.original, secondHalf: result.new }
}

export async function getWorkSessionsForTask(taskId: string): Promise<any[]> {
  return apiFetch(`/api/work-sessions/task/${taskId}`)
}

export async function getTaskTotalLoggedTime(taskId: string): Promise<number> {
  const result = await apiFetch<{ totalActualMinutes: number }>(`/api/work-sessions/task/${taskId}/total`)
  return result.totalActualMinutes
}

export async function getTodayAccumulated(date: string): Promise<any> {
  return apiFetch(`/api/work-sessions/accumulated?date=${date}`)
}

export async function getWorkSessionStats(filters?: {
  date?: string
  startDate?: string
  endDate?: string
}): Promise<any> {
  const params = new URLSearchParams()
  if (filters?.date) params.set('date', filters.date)
  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)

  const query = params.toString()
  return apiFetch(`/api/work-sessions/stats${query ? `?${query}` : ''}`)
}

// Compatibility alias
export async function createWorkSession(data: any): Promise<any> {
  return startWorkSession(data)
}

export async function updateWorkSession(id: string, data: any): Promise<any> {
  // If updating to stop the session
  if (data.endTime) {
    return stopWorkSession(id, data.notes)
  }
  // Otherwise would need a general update endpoint - not currently implemented
  throw new Error('General work session update not implemented - use stop instead')
}

// ============================================================================
// WORK PATTERN OPERATIONS
// ============================================================================

export async function getWorkPatterns(): Promise<any[]> {
  const patterns = await apiFetch<any[]>('/api/work-patterns')
  return patterns.map(transformWorkPattern)
}

export async function getWorkPattern(date: string): Promise<any | null> {
  try {
    const pattern = await apiFetch(`/api/work-patterns/date/${date}`)
    return transformWorkPattern(pattern)
  } catch {
    return null
  }
}

export async function createWorkPattern(data: any): Promise<any> {
  // Transform blocks to server format (typeConfig as JSON string)
  const serverData = {
    ...data,
    blocks: data.blocks?.map((b: any) => ({
      ...b,
      typeConfig: typeof b.typeConfig === 'string' ? b.typeConfig : JSON.stringify(b.typeConfig),
    })),
    meetings: data.meetings?.map((m: any) => ({
      ...m,
      daysOfWeek: Array.isArray(m.daysOfWeek) ? JSON.stringify(m.daysOfWeek) : m.daysOfWeek,
    })),
  }
  const result = await apiFetch('/api/work-patterns', {
    method: 'POST',
    body: JSON.stringify(serverData),
  })
  return transformWorkPattern(result)
}

export async function updateWorkPattern(id: string, data: any): Promise<any> {
  // Transform blocks to server format (typeConfig as JSON string)
  const serverData = {
    ...data,
    blocks: data.blocks?.map((b: any) => ({
      ...b,
      typeConfig: typeof b.typeConfig === 'string' ? b.typeConfig : JSON.stringify(b.typeConfig),
    })),
    meetings: data.meetings?.map((m: any) => ({
      ...m,
      daysOfWeek: Array.isArray(m.daysOfWeek) ? JSON.stringify(m.daysOfWeek) : m.daysOfWeek,
    })),
  }
  const result = await apiFetch(`/api/work-patterns/${id}`, {
    method: 'PUT',
    body: JSON.stringify(serverData),
  })
  return transformWorkPattern(result)
}

export async function deleteWorkPattern(id: string): Promise<void> {
  return apiFetch(`/api/work-patterns/${id}`, {
    method: 'DELETE',
  })
}

export async function getWorkTemplates(): Promise<any[]> {
  const templates = await apiFetch<any[]>('/api/work-patterns/templates')
  return templates.map(transformWorkPattern)
}

export async function saveAsTemplate(date: string, templateName: string): Promise<any> {
  return apiFetch(`/api/work-patterns/${date}/save-as-template`, {
    method: 'POST',
    body: JSON.stringify({ templateName }),
  })
}

// ============================================================================
// USER TASK TYPE OPERATIONS
// ============================================================================

export async function getUserTaskTypes(): Promise<any[]> {
  return apiFetch('/api/user-task-types')
}

export async function getUserTaskTypeById(id: string): Promise<any | null> {
  try {
    return await apiFetch(`/api/user-task-types/${id}`)
  } catch {
    return null
  }
}

export async function createUserTaskType(input: any): Promise<any> {
  return apiFetch('/api/user-task-types', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateUserTaskType(id: string, updates: any): Promise<any> {
  return apiFetch(`/api/user-task-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteUserTaskType(id: string): Promise<void> {
  return apiFetch(`/api/user-task-types/${id}`, {
    method: 'DELETE',
  })
}

export async function reorderUserTaskTypes(orderedIds: string[]): Promise<void> {
  return apiFetch('/api/user-task-types/reorder', {
    method: 'PUT',
    body: JSON.stringify({ orderedIds }),
  })
}

export async function sessionHasTaskTypes(): Promise<boolean> {
  const result = await apiFetch<{ hasAny: boolean }>('/api/user-task-types/has-any')
  return result.hasAny
}

// ============================================================================
// TIME SINK OPERATIONS
// ============================================================================

export async function getTimeSinks(): Promise<any[]> {
  return apiFetch('/api/time-sinks')
}

export async function getTimeSinkById(id: string): Promise<any | null> {
  try {
    return await apiFetch(`/api/time-sinks/${id}`)
  } catch {
    return null
  }
}

export async function createTimeSink(input: any): Promise<any> {
  return apiFetch('/api/time-sinks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateTimeSink(id: string, updates: any): Promise<any> {
  return apiFetch(`/api/time-sinks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteTimeSink(id: string): Promise<void> {
  return apiFetch(`/api/time-sinks/${id}`, {
    method: 'DELETE',
  })
}

export async function reorderTimeSinks(orderedIds: string[]): Promise<void> {
  return apiFetch('/api/time-sinks/reorder', {
    method: 'PUT',
    body: JSON.stringify({ orderedIds }),
  })
}

// ============================================================================
// TIME SINK SESSION OPERATIONS
// ============================================================================

export async function getTimeSinkSessions(timeSinkId?: string): Promise<any[]> {
  const params = timeSinkId ? `?timeSinkId=${timeSinkId}` : ''
  return apiFetch(`/api/time-sink-sessions${params}`)
}

export async function getTimeSinkSessionsByDate(date: string): Promise<any[]> {
  return apiFetch(`/api/time-sink-sessions/date/${date}`)
}

export async function getActiveTimeSinkSession(): Promise<any | null> {
  return apiFetch('/api/time-sink-sessions/active')
}

export async function createTimeSinkSession(data: any): Promise<any> {
  return apiFetch('/api/time-sink-sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function endTimeSinkSession(id: string, actualMinutes: number, notes?: string): Promise<any> {
  return apiFetch(`/api/time-sink-sessions/${id}/end`, {
    method: 'PUT',
    body: JSON.stringify({ actualMinutes, notes }),
  })
}

export async function deleteTimeSinkSession(id: string): Promise<void> {
  return apiFetch(`/api/time-sink-sessions/${id}`, {
    method: 'DELETE',
  })
}

export async function splitTimeSinkSession(
  sessionId: string,
  splitTime: Date,
): Promise<{ firstHalf: any; secondHalf: any }> {
  const result = await apiFetch<{ original: any; new: any }>(`/api/time-sink-sessions/${sessionId}/split`, {
    method: 'POST',
    body: JSON.stringify({ splitTime: splitTime.toISOString() }),
  })
  return { firstHalf: result.original, secondHalf: result.new }
}

export async function getTimeSinkAccumulated(startDate: string, endDate: string): Promise<any> {
  return apiFetch(`/api/time-sink-sessions/accumulated?startDate=${startDate}&endDate=${endDate}`)
}

// ============================================================================
// AI OPERATIONS
// ============================================================================

export async function extractTasksFromBrainstorm(brainstormText: string): Promise<any> {
  return apiFetch('/api/ai/brainstorm', {
    method: 'POST',
    body: JSON.stringify({ text: brainstormText }),
  })
}

export async function extractWorkflowsFromBrainstorm(brainstormText: string, jobContext?: string): Promise<any> {
  return apiFetch('/api/ai/workflows', {
    method: 'POST',
    body: JSON.stringify({ text: brainstormText, jobContext }),
  })
}

export async function extractScheduleFromVoice(voiceText: string, targetDate: string): Promise<any> {
  return apiFetch('/api/ai/schedule', {
    method: 'POST',
    body: JSON.stringify({ text: voiceText, targetDate, multiDay: false }),
  })
}

export async function extractMultiDayScheduleFromVoice(voiceText: string, startDate: string): Promise<any> {
  return apiFetch('/api/ai/schedule', {
    method: 'POST',
    body: JSON.stringify({ text: voiceText, startDate, multiDay: true }),
  })
}

export async function extractJargonTerms(contextText: string): Promise<string> {
  const result = await apiFetch<{ terms: string }>('/api/ai/jargon', {
    method: 'POST',
    body: JSON.stringify({ text: contextText }),
  })
  return result.terms || ''
}

// These AI methods are not yet implemented on the server
export async function generateWorkflowSteps(_taskDescription: string, _context?: any): Promise<any> {
  throw new Error('generateWorkflowSteps not yet implemented on server')
}

export async function enhanceTaskDetails(_taskName: string, _currentDetails?: any): Promise<any> {
  throw new Error('enhanceTaskDetails not yet implemented on server')
}

export async function getContextualQuestions(_taskName: string, _taskDescription?: string): Promise<any> {
  throw new Error('getContextualQuestions not yet implemented on server')
}

export async function getJobContextualQuestions(_brainstormText: string, _jobContext?: string): Promise<any> {
  throw new Error('getJobContextualQuestions not yet implemented on server')
}

export async function callAI(_options: any): Promise<{ content: string }> {
  throw new Error('callAI not yet implemented on server')
}

// ============================================================================
// SPEECH OPERATIONS
// ============================================================================

export async function getSupportedFormats(): Promise<string[]> {
  const result = await apiFetch<{ formats: string[] }>('/api/speech/formats')
  return result.formats
}

export async function transcribeAudio(_audioFilePath: string, _options?: any): Promise<{ text: string }> {
  // File path transcription needs to upload the file
  throw new Error('transcribeAudio with file path not supported in HTTP client - use transcribeAudioBuffer')
}

export async function transcribeAudioBuffer(
  audioBuffer: ArrayBuffer | Uint8Array,
  filename: string,
  options?: { context?: string },
): Promise<{ text: string }> {
  const formData = new FormData()
  // Convert to ArrayBuffer for Blob compatibility - explicit cast for TypeScript
  const buffer = audioBuffer instanceof Uint8Array ? audioBuffer.buffer : audioBuffer
  const blob = new Blob([buffer as BlobPart])
  formData.append('file', blob, filename)

  const params = options?.context ? `?context=${options.context}` : ''

  const response = await fetch(`${API_BASE_URL}/api/speech/transcribe${params}`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || `API error: ${response.status}`)
  }

  return response.json()
}

export async function getBrainstormingSettings(): Promise<{ language: string; prompt: string }> {
  return { language: 'en', prompt: 'brainstorming' }
}

export async function getWorkflowSettings(): Promise<{ language: string; prompt: string }> {
  return { language: 'en', prompt: 'workflow' }
}

export async function getSchedulingSettings(): Promise<{ language: string; prompt: string }> {
  return { language: 'en', prompt: 'scheduling' }
}

// ============================================================================
// NOT YET IMPLEMENTED ON SERVER (stubs that throw)
// ============================================================================

export async function getJobContexts(): Promise<any[]> {
  // TODO: Add job context routes to server
  return []
}

export async function getActiveJobContext(): Promise<any | null> {
  return null
}

export async function createJobContext(_data: any): Promise<any> {
  throw new Error('Job context routes not yet implemented on server')
}

export async function updateJobContext(_id: string, _updates: any): Promise<any> {
  throw new Error('Job context routes not yet implemented on server')
}

export async function deleteJobContext(_id: string): Promise<void> {
  throw new Error('Job context routes not yet implemented on server')
}

export async function addContextEntry(_jobContextId: string, _entry: any): Promise<any> {
  throw new Error('Job context routes not yet implemented on server')
}

export async function getJargonEntries(): Promise<any[]> {
  return []
}

export async function createJargonEntry(_data: any): Promise<any> {
  throw new Error('Jargon routes not yet implemented on server')
}

export async function updateJargonEntry(_id: string, _updates: any): Promise<any> {
  throw new Error('Jargon routes not yet implemented on server')
}

export async function updateJargonDefinition(_term: string, _definition: string): Promise<void> {
  throw new Error('Jargon routes not yet implemented on server')
}

export async function deleteJargonEntry(_id: string): Promise<void> {
  throw new Error('Jargon routes not yet implemented on server')
}

export async function getJargonDictionary(): Promise<Record<string, string>> {
  return {}
}

// Development helpers - intentionally not exposed via HTTP for safety
export async function deleteAllTasks(): Promise<void> {
  throw new Error('deleteAllTasks not available via HTTP API')
}

export async function deleteAllSequencedTasks(): Promise<void> {
  throw new Error('deleteAllSequencedTasks not available via HTTP API')
}

export async function deleteAllUserData(): Promise<void> {
  throw new Error('deleteAllUserData not available via HTTP API')
}

export async function initializeDefaultData(): Promise<void> {
  // No-op for HTTP client - server handles its own initialization
}

// Schedule snapshot operations - not yet implemented
export async function createScheduleSnapshot(_data: any, _label?: string): Promise<any> {
  throw new Error('Schedule snapshot routes not yet implemented on server')
}

export async function getScheduleSnapshots(_sessionId?: string): Promise<any[]> {
  return []
}

export async function getScheduleSnapshotById(_id: string): Promise<any | null> {
  return null
}

export async function getTodayScheduleSnapshot(): Promise<any | null> {
  return null
}

export async function deleteScheduleSnapshot(_id: string): Promise<void> {
  throw new Error('Schedule snapshot routes not yet implemented on server')
}

// Log operations - not exposed via HTTP
export async function getSessionLogs(_options?: any): Promise<any[]> {
  return []
}

export async function getLoggedSessions(): Promise<any[]> {
  return []
}

// Progress tracking - partial support
export async function createStepWorkSession(data: any): Promise<any> {
  return startWorkSession(data)
}

export async function updateTaskStepProgress(stepId: string, data: any): Promise<any> {
  // Find the task ID from the step and update
  // This is a simplified version - may need enhancement
  return apiFetch(`/api/tasks/unknown/steps/${stepId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function getStepWorkSessions(_stepId: string): Promise<any[]> {
  // Would need a server route for step-specific sessions
  return []
}

export async function recordTimeEstimate(_data: any): Promise<any> {
  throw new Error('Time estimate recording not yet implemented on server')
}

export async function getTimeAccuracyStats(_filters?: any): Promise<any> {
  return getWorkSessionStats(_filters)
}

// Session-related helpers
export async function getCurrentSession(): Promise<any> {
  return getActiveSession()
}

export async function updateSchedulingPreferences(_sessionId: string, _updates: any): Promise<any> {
  throw new Error('Scheduling preferences not yet implemented on server')
}
