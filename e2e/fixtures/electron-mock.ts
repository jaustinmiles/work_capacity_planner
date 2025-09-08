import { Page } from '@playwright/test'

/**
 * Mock Electron API for Playwright tests
 * This allows tests to run in browser mode without Electron
 */
export async function mockElectronAPI(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Create mock electron API on window - must match window.electronAPI structure
    (window as any).electronAPI = {
      db: {
        // Mock database methods
        getTasks: () => Promise.resolve([
        {
          id: 'test-task-1',
          name: 'Test Task 1',
          importance: 8,
          urgency: 7,
          completed: false,
          duration: 60,
          type: 'focused',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'test-task-2',
          name: 'Test Task 2',
          importance: 5,
          urgency: 9,
          completed: false,
          duration: 30,
          type: 'admin',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),

        getSequencedTasks: () => Promise.resolve([]),

        getSessions: () => Promise.resolve([
          {
            id: 'default',
            name: 'Default Session',
            description: 'Default test session',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),

        getCurrentSession: () => Promise.resolve({
          id: 'default',
          name: 'Default Session',
          isActive: true,
        }),

        switchSession: () => Promise.resolve(),
        createSession: () => Promise.resolve(),
        updateSession: () => Promise.resolve(),
        deleteSession: () => Promise.resolve(),

        // Mock other necessary methods
        createTask: () => Promise.resolve({ id: 'new-task', name: 'New Task' }),
        updateTask: () => Promise.resolve(),
        deleteTask: () => Promise.resolve(),

        createSequencedTask: () => Promise.resolve(),
        updateSequencedTask: () => Promise.resolve(),
        deleteSequencedTask: () => Promise.resolve(),

        addStepToWorkflow: () => Promise.resolve(),
        updateSchedulingPreferences: () => Promise.resolve(),

        // Initialize default data
        initializeDefaultData: () => Promise.resolve(),

        // Other database methods that might be called
        getProjects: () => Promise.resolve([]),
        getWorkLogs: () => Promise.resolve([]),
        createWorkLog: () => Promise.resolve(),
        updateWorkLog: () => Promise.resolve(),
        deleteWorkLog: () => Promise.resolve(),
      },

      // Mock work patterns (outside db namespace)
      getWorkPattern: () => Promise.resolve({
        id: 'default',
        name: 'Default',
        isActive: true,
        workDays: [
          { dayOfWeek: 1, blocksOfWork: [] },
          { dayOfWeek: 2, blocksOfWork: [] },
          { dayOfWeek: 3, blocksOfWork: [] },
          { dayOfWeek: 4, blocksOfWork: [] },
          { dayOfWeek: 5, blocksOfWork: [] },
        ],
      }),

      // Mock logger
      log: () => Promise.resolve(),
      error: () => Promise.resolve(),

      // Mock AI services
      transcribeAudio: () => Promise.resolve({ text: 'Test transcription' }),
      extractTasksFromText: () => Promise.resolve({
        tasks: [],
        workflows: [],
        clarificationNeeded: false,
      }),
    }

    // Also mock console methods to avoid errors
    // Suppress noisy logs during tests
    const originalWarn = console.warn
    console.warn = (...args: unknown[]): void => {
      const firstArg = args[0] as { includes?: (str: string) => boolean } | undefined
      if (!firstArg?.includes?.('[IPC Transport]')) {
        originalWarn.apply(console, args)
      }
    }
  })
}

