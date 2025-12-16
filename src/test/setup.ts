import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Import dayjs properly to avoid mock issues
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)

// Mock the HTTP api-client module (used by database.ts since HTTP migration)
vi.mock('@/renderer/services/api-client', () => ({
  // Config
  setApiBaseUrl: vi.fn(),
  getApiBaseUrl: vi.fn().mockReturnValue('http://localhost:3001'),
  // Sessions
  getSessions: vi.fn().mockResolvedValue([]),
  getActiveSession: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue({ id: 'test-session', name: 'Test Session', isActive: true }),
  updateSession: vi.fn().mockResolvedValue({ id: 'test-session', name: 'Updated Session' }),
  activateSession: vi.fn().mockResolvedValue({ id: 'test-session', name: 'Test Session', isActive: true }),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  // Tasks
  getTasks: vi.fn().mockResolvedValue([]),
  getTaskById: vi.fn().mockResolvedValue(null),
  createTask: vi.fn().mockResolvedValue({ id: 'test-task', name: 'Test Task' }),
  updateTask: vi.fn().mockResolvedValue({ id: 'test-task', name: 'Updated Task' }),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  completeTask: vi.fn().mockResolvedValue({ id: 'test-task', completed: true }),
  archiveTask: vi.fn().mockResolvedValue({ id: 'test-task', archived: true }),
  unarchiveTask: vi.fn().mockResolvedValue({ id: 'test-task', archived: false }),
  promoteTaskToWorkflow: vi.fn().mockResolvedValue({ id: 'test-task', hasSteps: true }),
  // Task Steps
  getTaskSteps: vi.fn().mockResolvedValue([]),
  addTaskStep: vi.fn().mockResolvedValue({ id: 'test-step', name: 'Test Step' }),
  updateTaskStep: vi.fn().mockResolvedValue({ id: 'test-step', name: 'Updated Step' }),
  deleteTaskStep: vi.fn().mockResolvedValue(undefined),
  // Workflows
  getWorkflows: vi.fn().mockResolvedValue([]),
  createWorkflow: vi.fn().mockResolvedValue({ id: 'test-workflow', name: 'Test Workflow' }),
  deleteWorkflow: vi.fn().mockResolvedValue(undefined),
  getSequencedTaskById: vi.fn().mockResolvedValue(null),
  updateSequencedTask: vi.fn().mockResolvedValue({ id: 'test-workflow' }),
  addStepToWorkflow: vi.fn().mockResolvedValue({ id: 'test-step' }),
  // Work Sessions
  getWorkSessions: vi.fn().mockResolvedValue([]),
  getActiveWorkSession: vi.fn().mockResolvedValue(null),
  startWorkSession: vi.fn().mockResolvedValue({ id: 'test-work-session' }),
  stopWorkSession: vi.fn().mockResolvedValue({ id: 'test-work-session', endTime: new Date() }),
  deleteWorkSession: vi.fn().mockResolvedValue(undefined),
  splitWorkSession: vi.fn().mockResolvedValue({ firstHalf: {}, secondHalf: {} }),
  getWorkSessionsForTask: vi.fn().mockResolvedValue([]),
  getTaskTotalLoggedTime: vi.fn().mockResolvedValue(0),
  getTodayAccumulated: vi.fn().mockResolvedValue({}),
  getWorkSessionStats: vi.fn().mockResolvedValue({}),
  createWorkSession: vi.fn().mockResolvedValue({ id: 'test-work-session' }),
  updateWorkSession: vi.fn().mockResolvedValue({ id: 'test-work-session' }),
  // Work Patterns
  getWorkPatterns: vi.fn().mockResolvedValue([]),
  getWorkPattern: vi.fn().mockResolvedValue(null),
  createWorkPattern: vi.fn().mockResolvedValue({ id: 'test-pattern' }),
  updateWorkPattern: vi.fn().mockResolvedValue({ id: 'test-pattern' }),
  deleteWorkPattern: vi.fn().mockResolvedValue(undefined),
  getWorkTemplates: vi.fn().mockResolvedValue([]),
  saveAsTemplate: vi.fn().mockResolvedValue({ id: 'test-template' }),
  // User Task Types
  getUserTaskTypes: vi.fn().mockResolvedValue([]),
  getUserTaskTypeById: vi.fn().mockResolvedValue(null),
  createUserTaskType: vi.fn().mockResolvedValue({ id: 'test-type' }),
  updateUserTaskType: vi.fn().mockResolvedValue({ id: 'test-type' }),
  deleteUserTaskType: vi.fn().mockResolvedValue(undefined),
  reorderUserTaskTypes: vi.fn().mockResolvedValue(undefined),
  sessionHasTaskTypes: vi.fn().mockResolvedValue(false),
  // Time Sinks
  getTimeSinks: vi.fn().mockResolvedValue([]),
  getTimeSinkById: vi.fn().mockResolvedValue(null),
  createTimeSink: vi.fn().mockResolvedValue({ id: 'test-sink' }),
  updateTimeSink: vi.fn().mockResolvedValue({ id: 'test-sink' }),
  deleteTimeSink: vi.fn().mockResolvedValue(undefined),
  reorderTimeSinks: vi.fn().mockResolvedValue(undefined),
  getTimeSinkSessions: vi.fn().mockResolvedValue([]),
  getActiveTimeSinkSession: vi.fn().mockResolvedValue(null),
  createTimeSinkSession: vi.fn().mockResolvedValue({ id: 'test-sink-session' }),
  endTimeSinkSession: vi.fn().mockResolvedValue({ id: 'test-sink-session' }),
  deleteTimeSinkSession: vi.fn().mockResolvedValue(undefined),
  splitTimeSinkSession: vi.fn().mockResolvedValue({ firstHalf: {}, secondHalf: {} }),
  getTimeSinkAccumulated: vi.fn().mockResolvedValue({ bySink: {}, total: 0 }),
  // AI
  extractTasksFromBrainstorm: vi.fn().mockResolvedValue({ tasks: [] }),
  extractWorkflowsFromBrainstorm: vi.fn().mockResolvedValue({ workflows: [] }),
  generateWorkflowSteps: vi.fn().mockResolvedValue({ steps: [] }),
  parseAmendment: vi.fn().mockResolvedValue({ amendments: [] }),
  enhanceTaskDetails: vi.fn().mockResolvedValue({}),
  getContextualQuestions: vi.fn().mockResolvedValue({ questions: [] }),
  getJobContextualQuestions: vi.fn().mockResolvedValue({ questions: [] }),
  callAI: vi.fn().mockResolvedValue({ content: '' }),
  // Speech
  getSupportedFormats: vi.fn().mockResolvedValue(['webm', 'mp3', 'wav']),
  transcribeAudio: vi.fn().mockResolvedValue({ text: '' }),
  transcribeAudioBuffer: vi.fn().mockResolvedValue({ text: '' }),
  getBrainstormingSettings: vi.fn().mockResolvedValue({ language: 'en', prompt: '' }),
  getWorkflowSettings: vi.fn().mockResolvedValue({ language: 'en', prompt: '' }),
  getSchedulingSettings: vi.fn().mockResolvedValue({ language: 'en', prompt: '' }),
  // Job Context
  getJobContexts: vi.fn().mockResolvedValue([]),
  getActiveJobContext: vi.fn().mockResolvedValue(null),
  createJobContext: vi.fn().mockResolvedValue({ id: 'test-context' }),
  updateJobContext: vi.fn().mockResolvedValue({ id: 'test-context' }),
  deleteJobContext: vi.fn().mockResolvedValue(undefined),
  addContextEntry: vi.fn().mockResolvedValue({ id: 'test-entry' }),
  // Jargon
  getJargonEntries: vi.fn().mockResolvedValue([]),
  createJargonEntry: vi.fn().mockResolvedValue({ id: 'test-jargon' }),
  updateJargonEntry: vi.fn().mockResolvedValue({ id: 'test-jargon' }),
  updateJargonDefinition: vi.fn().mockResolvedValue(undefined),
  deleteJargonEntry: vi.fn().mockResolvedValue(undefined),
  getJargonDictionary: vi.fn().mockResolvedValue({}),
  // Dev helpers
  deleteAllTasks: vi.fn().mockResolvedValue(undefined),
  deleteAllSequencedTasks: vi.fn().mockResolvedValue(undefined),
  deleteAllUserData: vi.fn().mockResolvedValue(undefined),
  initializeDefaultData: vi.fn().mockResolvedValue(undefined),
  // Schedule snapshots
  createScheduleSnapshot: vi.fn().mockResolvedValue({ id: 'test-snapshot' }),
  getScheduleSnapshots: vi.fn().mockResolvedValue([]),
  getScheduleSnapshotById: vi.fn().mockResolvedValue(null),
  getTodayScheduleSnapshot: vi.fn().mockResolvedValue(null),
  deleteScheduleSnapshot: vi.fn().mockResolvedValue(undefined),
  // Logs
  getSessionLogs: vi.fn().mockResolvedValue([]),
  getLoggedSessions: vi.fn().mockResolvedValue([]),
  // Step work sessions
  createStepWorkSession: vi.fn().mockResolvedValue({ id: 'test-step-session' }),
  updateTaskStepProgress: vi.fn().mockResolvedValue(undefined),
  getStepWorkSessions: vi.fn().mockResolvedValue([]),
  // Time estimates
  recordTimeEstimate: vi.fn().mockResolvedValue({ id: 'test-estimate' }),
  getTimeAccuracyStats: vi.fn().mockResolvedValue({}),
  // Session helpers
  getCurrentSession: vi.fn().mockResolvedValue(null),
  updateSchedulingPreferences: vi.fn().mockRejectedValue(new Error('Not implemented')),
}))

// Mock window functions BEFORE any other setup
Object.defineProperty(window, 'addEventListener', {
  writable: true,
  value: vi.fn(),
})
Object.defineProperty(window, 'removeEventListener', {
  writable: true,
  value: vi.fn(),
})
Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: vi.fn().mockReturnValue({
    getPropertyValue: vi.fn().mockReturnValue(''),
    padding: '0',
    borderTopWidth: '0',
    borderBottomWidth: '0',
    fontSize: '14px',
    lineHeight: '1.5',
  }),
})

// Mock matchMedia for Arco components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Window event listeners are already mocked above

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock Electron API for tests
global.window = Object.assign(global.window, {
  electronAPI: {
    db: {
      // Session management
      getSessions: vi.fn().mockResolvedValue([]),
      createSession: vi.fn().mockResolvedValue({ id: 'test-session', name: 'Test Session', isActive: true }),
      switchSession: vi.fn().mockResolvedValue({ id: 'test-session', name: 'Test Session', isActive: true }),
      updateSession: vi.fn().mockResolvedValue({ id: 'test-session', name: 'Updated Session' }),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      // Task operations
      getTasks: vi.fn().mockResolvedValue([]),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      getSequencedTasks: vi.fn().mockResolvedValue([]),
      createSequencedTask: vi.fn(),
      updateSequencedTask: vi.fn(),
      deleteSequencedTask: vi.fn(),
      // Work patterns
      getWorkPattern: vi.fn().mockResolvedValue(null),
      createWorkPattern: vi.fn(),
      updateWorkPattern: vi.fn(),
      getTodayAccumulated: vi.fn().mockResolvedValue({ focusMinutes: 0, adminMinutes: 0 }),
      // Job context
      getJobContexts: vi.fn().mockResolvedValue([]),
      getActiveJobContext: vi.fn().mockResolvedValue(null),
      createJobContext: vi.fn(),
      updateJobContext: vi.fn(),
      deleteJobContext: vi.fn(),
      // Jargon
      getJargonEntries: vi.fn().mockResolvedValue([]),
      createJargonEntry: vi.fn(),
      updateJargonEntry: vi.fn(),
      deleteJargonEntry: vi.fn(),
      getJargonDictionary: vi.fn().mockResolvedValue({}),
    },
    ai: {
      extractTasksFromBrainstorm: vi.fn(),
      extractWorkflowsFromBrainstorm: vi.fn(),
      generateWorkflowSteps: vi.fn(),
      enhanceTaskDetails: vi.fn(),
      getContextualQuestions: vi.fn(),
      getJobContextualQuestions: vi.fn(),
      parseAmendment: vi.fn(),
    },
    speech: {
      transcribeAudio: vi.fn(),
      transcribeAudioBuffer: vi.fn(),
      getSupportedFormats: vi.fn().mockResolvedValue(['webm', 'mp3', 'wav']),
      getBrainstormingSettings: vi.fn().mockResolvedValue({ language: 'en', prompt: '' }),
      getWorkflowSettings: vi.fn().mockResolvedValue({ language: 'en', prompt: '' }),
    },
  },
})

// Mock Arco Design components that might cause issues in tests
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual('@arco-design/web-react')
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  }
})

// Mock the ResizeObserver component from Arco
vi.mock('@arco-design/web-react/lib/_util/resizeObserver', () => ({
  default: vi.fn(({ children }) => children),
}))

// Mock VirtualList to prevent errors
vi.mock('@arco-design/web-react/lib/_class/VirtualList', () => ({
  default: vi.fn(({ children, _data }) => {
    // Simple mock that just renders children without virtualization
    return children
  }),
}))
