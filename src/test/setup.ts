import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Import dayjs properly to avoid mock issues
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)

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
