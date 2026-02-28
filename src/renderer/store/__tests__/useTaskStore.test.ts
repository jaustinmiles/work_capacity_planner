import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from '@shared/types'
import type { SequencedTask } from '@shared/sequencing-types'

// =============================================================================
// Mocks — must be set up before importing the store
// =============================================================================

const mockDb = {
  getTasks: vi.fn(),
  getSequencedTasks: vi.fn(),
  createTask: vi.fn(),
  createSequencedTask: vi.fn(),
  updateTask: vi.fn(),
  updateSequencedTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteSequencedTask: vi.fn(),
  promoteTaskToWorkflow: vi.fn(),
  loadLastUsedSession: vi.fn(),
  updateTaskStepProgress: vi.fn(),
  createStepWorkSession: vi.fn(),
  getSequencedTaskById: vi.fn(),
}

vi.mock('../../services/database', () => ({
  getDatabase: vi.fn(() => mockDb),
}))

vi.mock('@/logger', () => ({
  logger: {
    ui: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    system: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  },
}))

const mockWorkTrackingService = {
  initialize: vi.fn(),
  getCurrentActiveSession: vi.fn(),
  stopWorkSession: vi.fn(),
  startWorkSession: vi.fn(),
  isAnyWorkActive: vi.fn(() => false),
  pauseWorkSession: vi.fn(),
}

vi.mock('../useTaskStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('../useTaskStore')>()
  return {
    ...original,
    getWorkTrackingServiceInstance: vi.fn(() => mockWorkTrackingService),
  }
})

// Mock the injected work tracking service
vi.mock('../../services/workTrackingService', () => ({
  WorkTrackingService: vi.fn().mockImplementation(() => mockWorkTrackingService),
}))

vi.mock('../useSchedulerStore', () => ({
  useSchedulerStore: {
    getState: vi.fn(() => ({
      recomputeSchedule: vi.fn(),
    })),
  },
}))

vi.mock('@shared/time-provider', () => ({
  getCurrentTime: vi.fn(() => new Date('2025-01-15T12:00:00Z')),
  getLocalDateString: vi.fn((d: Date) => d.toISOString().split('T')[0]),
  timeProvider: { subscribe: vi.fn(), now: vi.fn(() => new Date()) },
}))

vi.mock('../../utils/dateUtils', () => ({
  addMinutes: vi.fn((date: Date, minutes: number) => new Date(date.getTime() + minutes * 60000)),
}))

// Import AFTER mocks
import { useTaskStore, injectWorkTrackingServiceForTesting, clearInjectedWorkTrackingService } from '../useTaskStore'

// =============================================================================
// Test Helpers
// =============================================================================

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    duration: 30,
    importance: 5,
    urgency: 5,
    type: 'focused',
    category: 'default',
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    hasSteps: false,
    overallStatus: 'not_started' as any,
    criticalPathDuration: 0,
    worstCaseDuration: 0,
    archived: false,
    inActiveSprint: false,
    sessionId: 'session-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    isLocked: false,
    ...overrides,
  }
}

function makeWorkflow(id: string, overrides: Partial<SequencedTask> = {}): SequencedTask {
  return {
    ...makeTask(id, { hasSteps: true }),
    steps: [],
    hasSteps: true,
    ...overrides,
  } as SequencedTask
}

// =============================================================================
// Tests
// =============================================================================

describe('useTaskStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    injectWorkTrackingServiceForTesting(mockWorkTrackingService as any)
    // Reset store state
    useTaskStore.setState({
      tasks: [],
      sequencedTasks: [],
      selectedTaskId: null,
      isLoading: false,
      error: null,
      includeArchived: false,
      sprintModeEnabled: false,
      activeWorkSessions: new Map(),
      workSessionHistory: [],
      workSessionsVersion: 0,
      nextTaskSkipIndex: 0,
    })
  })

  // ---------- Data Loading ----------

  describe('loadTasks', () => {
    it('loads tasks from database', async () => {
      const tasks = [makeTask('t1'), makeTask('t2')]
      mockDb.getTasks.mockResolvedValue(tasks)

      await useTaskStore.getState().loadTasks()

      const state = useTaskStore.getState()
      expect(state.tasks).toHaveLength(2)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('passes includeArchived flag to database', async () => {
      mockDb.getTasks.mockResolvedValue([])

      await useTaskStore.getState().loadTasks(true)

      expect(mockDb.getTasks).toHaveBeenCalledWith(true)
      expect(useTaskStore.getState().includeArchived).toBe(true)
    })

    it('sets error on failure', async () => {
      mockDb.getTasks.mockRejectedValue(new Error('DB error'))

      await useTaskStore.getState().loadTasks()

      const state = useTaskStore.getState()
      expect(state.error).toBe('DB error')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('loadSequencedTasks', () => {
    it('loads sequenced tasks from database', async () => {
      const workflows = [makeWorkflow('wf1')]
      mockDb.getSequencedTasks.mockResolvedValue(workflows)

      await useTaskStore.getState().loadSequencedTasks()

      expect(useTaskStore.getState().sequencedTasks).toHaveLength(1)
      expect(useTaskStore.getState().isLoading).toBe(false)
    })

    it('sets error on failure', async () => {
      mockDb.getSequencedTasks.mockRejectedValue(new Error('DB fail'))

      await useTaskStore.getState().loadSequencedTasks()

      expect(useTaskStore.getState().error).toBe('DB fail')
    })
  })

  describe('refreshAllData', () => {
    it('reloads tasks and workflows in parallel', async () => {
      const tasks = [makeTask('t1')]
      const workflows = [makeWorkflow('wf1')]
      mockDb.getTasks.mockResolvedValue(tasks)
      mockDb.getSequencedTasks.mockResolvedValue(workflows)

      await useTaskStore.getState().refreshAllData()

      const state = useTaskStore.getState()
      expect(state.tasks).toHaveLength(1)
      expect(state.sequencedTasks).toHaveLength(1)
      expect(state.error).toBeNull()
    })

    it('uses stored includeArchived preference', async () => {
      useTaskStore.setState({ includeArchived: true })
      mockDb.getTasks.mockResolvedValue([])
      mockDb.getSequencedTasks.mockResolvedValue([])

      await useTaskStore.getState().refreshAllData()

      expect(mockDb.getTasks).toHaveBeenCalledWith(true)
    })

    it('sets error on failure', async () => {
      mockDb.getTasks.mockRejectedValue(new Error('Refresh failed'))

      await useTaskStore.getState().refreshAllData()

      expect(useTaskStore.getState().error).toBe('Refresh failed')
    })
  })

  // ---------- CRUD Operations ----------

  describe('addTask', () => {
    it('creates task and adds to store', async () => {
      const newTask = makeTask('new-1')
      mockDb.createTask.mockResolvedValue(newTask)

      await useTaskStore.getState().addTask({
        name: 'New Task', duration: 30, importance: 5, urgency: 5,
        type: 'focused', category: 'default', asyncWaitTime: 0,
        dependencies: [], completed: false, hasSteps: false,
        overallStatus: 'not_started' as any, criticalPathDuration: 0,
        worstCaseDuration: 0, archived: false, inActiveSprint: false,
        sessionId: 'session-1', isLocked: false,
      })

      expect(useTaskStore.getState().tasks).toHaveLength(1)
      expect(useTaskStore.getState().tasks[0]!.id).toBe('new-1')
    })

    it('re-throws error on failure', async () => {
      mockDb.createTask.mockRejectedValue(new Error('Create failed'))

      await expect(
        useTaskStore.getState().addTask({
          name: 'Task', duration: 30, importance: 5, urgency: 5,
          type: 'focused', category: 'default', asyncWaitTime: 0,
          dependencies: [], completed: false, hasSteps: false,
          overallStatus: 'not_started' as any, criticalPathDuration: 0,
          worstCaseDuration: 0, archived: false, inActiveSprint: false,
          sessionId: 'session-1', isLocked: false,
        }),
      ).rejects.toThrow('Create failed')

      expect(useTaskStore.getState().error).toBe('Create failed')
    })
  })

  describe('addSequencedTask', () => {
    it('creates workflow and adds to store', async () => {
      const wf = makeWorkflow('wf-new')
      mockDb.createSequencedTask.mockResolvedValue(wf)

      await useTaskStore.getState().addSequencedTask({
        ...makeWorkflow('ignored'),
      } as any)

      expect(useTaskStore.getState().sequencedTasks).toHaveLength(1)
    })

    it('sets error on failure', async () => {
      mockDb.createSequencedTask.mockRejectedValue(new Error('fail'))

      await useTaskStore.getState().addSequencedTask({} as any)

      expect(useTaskStore.getState().error).toBe('fail')
    })
  })

  describe('addOrUpdateSequencedTask', () => {
    it('updates existing workflow when name matches', async () => {
      const existing = makeWorkflow('wf-1', { name: 'My Workflow' })
      useTaskStore.setState({ sequencedTasks: [existing] })
      const updated = makeWorkflow('wf-1', { name: 'My Workflow', duration: 60 })
      mockDb.updateSequencedTask.mockResolvedValue(updated)

      await useTaskStore.getState().addOrUpdateSequencedTask({ name: 'My Workflow' } as any)

      expect(mockDb.updateSequencedTask).toHaveBeenCalledWith('wf-1', expect.anything())
      expect(useTaskStore.getState().sequencedTasks[0]!.duration).toBe(60)
    })

    it('creates new workflow when no name match', async () => {
      const created = makeWorkflow('wf-new')
      mockDb.createSequencedTask.mockResolvedValue(created)

      await useTaskStore.getState().addOrUpdateSequencedTask({ name: 'Brand New' } as any)

      expect(mockDb.createSequencedTask).toHaveBeenCalled()
      expect(useTaskStore.getState().sequencedTasks).toHaveLength(1)
    })

    it('sets error on failure', async () => {
      mockDb.createSequencedTask.mockRejectedValue(new Error('fail'))

      await useTaskStore.getState().addOrUpdateSequencedTask({ name: 'New' } as any)

      expect(useTaskStore.getState().error).toBe('fail')
    })
  })

  describe('updateTask', () => {
    it('updates task in store', async () => {
      const task = makeTask('t1', { name: 'Old Name' })
      useTaskStore.setState({ tasks: [task] })
      const updated = makeTask('t1', { name: 'New Name' })
      mockDb.updateTask.mockResolvedValue(updated)

      await useTaskStore.getState().updateTask('t1', { name: 'New Name' })

      expect(useTaskStore.getState().tasks[0]!.name).toBe('New Name')
    })

    it('clears active work session when completing task', async () => {
      const task = makeTask('t1')
      const sessions = new Map([['t1', { id: 'session-1' } as any]])
      useTaskStore.setState({ tasks: [task], activeWorkSessions: sessions })
      const updated = makeTask('t1', { completed: true })
      mockDb.updateTask.mockResolvedValue(updated)

      await useTaskStore.getState().updateTask('t1', { completed: true })

      expect(useTaskStore.getState().activeWorkSessions.has('t1')).toBe(false)
    })

    it('sets error on failure', async () => {
      useTaskStore.setState({ tasks: [makeTask('t1')] })
      mockDb.updateTask.mockRejectedValue(new Error('update fail'))

      await useTaskStore.getState().updateTask('t1', { name: 'x' })

      expect(useTaskStore.getState().error).toBe('update fail')
    })
  })

  describe('updateSequencedTask', () => {
    it('updates workflow in store', async () => {
      const wf = makeWorkflow('wf-1', { name: 'Old' })
      useTaskStore.setState({ sequencedTasks: [wf] })
      const updated = makeWorkflow('wf-1', { name: 'New' })
      mockDb.updateSequencedTask.mockResolvedValue(updated)

      await useTaskStore.getState().updateSequencedTask('wf-1', { name: 'New' } as any)

      expect(useTaskStore.getState().sequencedTasks[0]!.name).toBe('New')
    })
  })

  describe('deleteTask', () => {
    it('removes task from store', async () => {
      useTaskStore.setState({ tasks: [makeTask('t1'), makeTask('t2')] })
      mockDb.deleteTask.mockResolvedValue(undefined)

      await useTaskStore.getState().deleteTask('t1')

      expect(useTaskStore.getState().tasks).toHaveLength(1)
      expect(useTaskStore.getState().tasks[0]!.id).toBe('t2')
    })

    it('clears selectedTaskId if deleted task was selected', async () => {
      useTaskStore.setState({ tasks: [makeTask('t1')], selectedTaskId: 't1' })
      mockDb.deleteTask.mockResolvedValue(undefined)

      await useTaskStore.getState().deleteTask('t1')

      expect(useTaskStore.getState().selectedTaskId).toBeNull()
    })

    it('sets error on failure', async () => {
      useTaskStore.setState({ tasks: [makeTask('t1')] })
      mockDb.deleteTask.mockRejectedValue(new Error('delete fail'))

      await useTaskStore.getState().deleteTask('t1')

      expect(useTaskStore.getState().error).toBe('delete fail')
    })
  })

  describe('deleteSequencedTask', () => {
    it('removes workflow from store', async () => {
      useTaskStore.setState({ sequencedTasks: [makeWorkflow('wf-1')] })
      mockDb.deleteSequencedTask.mockResolvedValue(undefined)

      await useTaskStore.getState().deleteSequencedTask('wf-1')

      expect(useTaskStore.getState().sequencedTasks).toHaveLength(0)
    })

    it('clears selectedTaskId if deleted workflow was selected', async () => {
      useTaskStore.setState({ sequencedTasks: [makeWorkflow('wf-1')], selectedTaskId: 'wf-1' })
      mockDb.deleteSequencedTask.mockResolvedValue(undefined)

      await useTaskStore.getState().deleteSequencedTask('wf-1')

      expect(useTaskStore.getState().selectedTaskId).toBeNull()
    })
  })

  describe('promoteTaskToWorkflow', () => {
    it('converts task to workflow and adds to sequencedTasks', async () => {
      const task = makeTask('t1')
      useTaskStore.setState({ tasks: [task], sequencedTasks: [] })
      const promoted = makeWorkflow('t1', { name: task.name })
      mockDb.promoteTaskToWorkflow.mockResolvedValue(promoted)

      await useTaskStore.getState().promoteTaskToWorkflow('t1')

      const state = useTaskStore.getState()
      expect(state.tasks[0]!.hasSteps).toBe(true)
      expect(state.sequencedTasks).toHaveLength(1)
    })

    it('re-throws error on failure', async () => {
      useTaskStore.setState({ tasks: [makeTask('t1')] })
      mockDb.promoteTaskToWorkflow.mockRejectedValue(new Error('promote fail'))

      await expect(
        useTaskStore.getState().promoteTaskToWorkflow('t1'),
      ).rejects.toThrow('promote fail')

      expect(useTaskStore.getState().error).toBe('promote fail')
    })
  })

  describe('toggleTaskComplete', () => {
    it('toggles incomplete task to completed', async () => {
      const task = makeTask('t1', { completed: false })
      useTaskStore.setState({ tasks: [task] })
      const updated = makeTask('t1', { completed: true })
      mockDb.updateTask.mockResolvedValue(updated)

      await useTaskStore.getState().toggleTaskComplete('t1')

      expect(useTaskStore.getState().tasks[0]!.completed).toBe(true)
    })

    it('toggles completed task to incomplete', async () => {
      const task = makeTask('t1', { completed: true })
      useTaskStore.setState({ tasks: [task] })
      const updated = makeTask('t1', { completed: false })
      mockDb.updateTask.mockResolvedValue(updated)

      await useTaskStore.getState().toggleTaskComplete('t1')

      expect(useTaskStore.getState().tasks[0]!.completed).toBe(false)
    })

    it('does nothing for nonexistent task', async () => {
      await useTaskStore.getState().toggleTaskComplete('nonexistent')
      expect(mockDb.updateTask).not.toHaveBeenCalled()
    })

    it('stops active work session when completing task', async () => {
      const task = makeTask('t1', { completed: false })
      const sessions = new Map([['t1', { id: 'ws-1' } as any]])
      useTaskStore.setState({ tasks: [task], activeWorkSessions: sessions })
      mockDb.updateTask.mockResolvedValue(makeTask('t1', { completed: true }))

      await useTaskStore.getState().toggleTaskComplete('t1')

      expect(mockWorkTrackingService.stopWorkSession).toHaveBeenCalledWith('ws-1')
    })

    it('resets skip index when completing task', async () => {
      const task = makeTask('t1', { completed: false })
      useTaskStore.setState({ tasks: [task], nextTaskSkipIndex: 3 })
      mockDb.updateTask.mockResolvedValue(makeTask('t1', { completed: true }))

      await useTaskStore.getState().toggleTaskComplete('t1')

      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(0)
    })

    it('sets error on failure', async () => {
      const task = makeTask('t1')
      useTaskStore.setState({ tasks: [task] })
      mockDb.updateTask.mockRejectedValue(new Error('toggle fail'))

      await useTaskStore.getState().toggleTaskComplete('t1')

      expect(useTaskStore.getState().error).toBe('toggle fail')
    })
  })

  // ---------- Selection ----------

  describe('selectTask', () => {
    it('sets selectedTaskId', () => {
      useTaskStore.setState({ tasks: [makeTask('t1')] })

      useTaskStore.getState().selectTask('t1')

      expect(useTaskStore.getState().selectedTaskId).toBe('t1')
    })

    it('clears selection with null', () => {
      useTaskStore.setState({ selectedTaskId: 't1' })

      useTaskStore.getState().selectTask(null)

      expect(useTaskStore.getState().selectedTaskId).toBeNull()
    })
  })

  // ---------- Sprint Management ----------

  describe('addTaskToSprint', () => {
    it('adds task to sprint', async () => {
      const task = makeTask('t1', { inActiveSprint: false })
      useTaskStore.setState({ tasks: [task] })
      mockDb.updateTask.mockResolvedValue(undefined)

      await useTaskStore.getState().addTaskToSprint('t1')

      expect(mockDb.updateTask).toHaveBeenCalledWith('t1', { inActiveSprint: true })
      expect(useTaskStore.getState().tasks[0]!.inActiveSprint).toBe(true)
    })

    it('adds workflow to sprint', async () => {
      const wf = makeWorkflow('wf-1', { inActiveSprint: false })
      useTaskStore.setState({ sequencedTasks: [wf] })
      mockDb.updateTask.mockResolvedValue(undefined)

      await useTaskStore.getState().addTaskToSprint('wf-1')

      expect(useTaskStore.getState().sequencedTasks[0]!.inActiveSprint).toBe(true)
    })
  })

  describe('removeTaskFromSprint', () => {
    it('removes task from sprint', async () => {
      const task = makeTask('t1', { inActiveSprint: true })
      useTaskStore.setState({ tasks: [task] })
      mockDb.updateTask.mockResolvedValue(undefined)

      await useTaskStore.getState().removeTaskFromSprint('t1')

      expect(useTaskStore.getState().tasks[0]!.inActiveSprint).toBe(false)
    })

    it('removes workflow from sprint', async () => {
      const wf = makeWorkflow('wf-1', { inActiveSprint: true })
      useTaskStore.setState({ sequencedTasks: [wf] })
      mockDb.updateTask.mockResolvedValue(undefined)

      await useTaskStore.getState().removeTaskFromSprint('wf-1')

      expect(useTaskStore.getState().sequencedTasks[0]!.inActiveSprint).toBe(false)
    })
  })

  describe('clearSprint', () => {
    it('clears all sprint flags', async () => {
      useTaskStore.setState({
        tasks: [makeTask('t1', { inActiveSprint: true }), makeTask('t2', { inActiveSprint: true })],
        sequencedTasks: [makeWorkflow('wf-1', { inActiveSprint: true })],
      })
      mockDb.updateTask.mockResolvedValue(undefined)

      await useTaskStore.getState().clearSprint()

      const state = useTaskStore.getState()
      expect(state.tasks.every(t => !t.inActiveSprint)).toBe(true)
      expect(state.sequencedTasks.every(w => !w.inActiveSprint)).toBe(true)
    })
  })

  // ---------- Computed Getters ----------

  describe('computed getters', () => {
    beforeEach(() => {
      useTaskStore.setState({
        tasks: [
          makeTask('t1', { completed: false }),
          makeTask('t2', { completed: true }),
          makeTask('t3', { completed: false }),
        ],
        sequencedTasks: [
          makeWorkflow('wf-1', { completed: false }),
          makeWorkflow('wf-2', { completed: true }),
        ],
      })
    })

    it('getTaskById returns matching task', () => {
      expect(useTaskStore.getState().getTaskById('t1')?.id).toBe('t1')
    })

    it('getTaskById returns undefined for missing ID', () => {
      expect(useTaskStore.getState().getTaskById('missing')).toBeUndefined()
    })

    it('getSequencedTaskById returns matching workflow', () => {
      expect(useTaskStore.getState().getSequencedTaskById('wf-1')?.id).toBe('wf-1')
    })

    it('getIncompleteTasks filters correctly', () => {
      const incomplete = useTaskStore.getState().getIncompleteTasks()
      expect(incomplete).toHaveLength(2)
      expect(incomplete.every(t => !t.completed)).toBe(true)
    })

    it('getCompletedTasks filters correctly', () => {
      const completed = useTaskStore.getState().getCompletedTasks()
      expect(completed).toHaveLength(1)
      expect(completed[0]!.id).toBe('t2')
    })

    it('getActiveSequencedTasks filters correctly', () => {
      const active = useTaskStore.getState().getActiveSequencedTasks()
      expect(active).toHaveLength(1)
      expect(active[0]!.id).toBe('wf-1')
    })

    it('getCompletedSequencedTasks filters correctly', () => {
      const completed = useTaskStore.getState().getCompletedSequencedTasks()
      expect(completed).toHaveLength(1)
      expect(completed[0]!.id).toBe('wf-2')
    })
  })

  // ---------- Skip Index ----------

  describe('nextTaskSkipIndex', () => {
    it('increments skip index', () => {
      useTaskStore.getState().incrementNextTaskSkipIndex()
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(1)

      useTaskStore.getState().incrementNextTaskSkipIndex()
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(2)
    })

    it('resets skip index', () => {
      useTaskStore.setState({ nextTaskSkipIndex: 5 })
      useTaskStore.getState().resetNextTaskSkipIndex()
      expect(useTaskStore.getState().nextTaskSkipIndex).toBe(0)
    })
  })

  // ---------- Settings ----------

  describe('updateWorkSettings', () => {
    it('updates workSettings in state and localStorage', async () => {
      const settings = { focusBlockMinutes: 50, breakMinutes: 10 }
      await useTaskStore.getState().updateWorkSettings(settings as any)

      expect(useTaskStore.getState().workSettings).toEqual(settings)
    })
  })

  describe('setSprintModeEnabled', () => {
    it('enables sprint mode and triggers recompute', () => {
      useTaskStore.getState().setSprintModeEnabled(true)

      expect(useTaskStore.getState().sprintModeEnabled).toBe(true)
    })

    it('disables sprint mode', () => {
      useTaskStore.setState({ sprintModeEnabled: true })
      useTaskStore.getState().setSprintModeEnabled(false)

      expect(useTaskStore.getState().sprintModeEnabled).toBe(false)
    })
  })

  // ---------- Work Session Management ----------

  describe('startWorkOnTask', () => {
    it('starts work session and updates store', async () => {
      const task = makeTask('t1')
      useTaskStore.setState({ tasks: [task] })
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)
      mockWorkTrackingService.startWorkSession.mockResolvedValue({
        id: 'ws-1',
        taskId: 't1',
        startTime: new Date('2025-01-15T12:00:00Z'),
        isPaused: false,
        actualMinutes: 0,
      })
      mockDb.updateTask.mockResolvedValue(undefined)

      await useTaskStore.getState().startWorkOnTask('t1')

      const sessions = useTaskStore.getState().activeWorkSessions
      expect(sessions.has('t1')).toBe(true)
      expect(sessions.get('t1')!.id).toBe('ws-1')
      expect(mockWorkTrackingService.startWorkSession).toHaveBeenCalledWith('t1', undefined, undefined)
    })

    it('returns early if work is already active globally', async () => {
      const task = makeTask('t1')
      useTaskStore.setState({ tasks: [task] })
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(true)

      await useTaskStore.getState().startWorkOnTask('t1')

      expect(mockWorkTrackingService.startWorkSession).not.toHaveBeenCalled()
    })

    it('rolls back on error and re-throws', async () => {
      const task = makeTask('t1')
      useTaskStore.setState({ tasks: [task] })
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)
      mockWorkTrackingService.startWorkSession.mockRejectedValue(new Error('session fail'))

      await expect(
        useTaskStore.getState().startWorkOnTask('t1'),
      ).rejects.toThrow('session fail')

      // Sessions should be rolled back (empty)
      expect(useTaskStore.getState().activeWorkSessions.size).toBe(0)
    })

    it('cleans up work session on DB update error', async () => {
      const task = makeTask('t1')
      useTaskStore.setState({ tasks: [task] })
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)
      mockWorkTrackingService.startWorkSession.mockResolvedValue({
        id: 'ws-1',
        taskId: 't1',
        startTime: new Date(),
        isPaused: false,
        actualMinutes: 0,
      })
      mockDb.updateTask.mockRejectedValue(new Error('DB update fail'))

      await expect(
        useTaskStore.getState().startWorkOnTask('t1'),
      ).rejects.toThrow('DB update fail')

      // Should have tried to clean up the session
      expect(mockWorkTrackingService.stopWorkSession).toHaveBeenCalledWith('ws-1')
    })
  })

  describe('startWorkOnStep', () => {
    it('starts work session on a step and updates store', async () => {
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)
      mockWorkTrackingService.startWorkSession.mockResolvedValue({
        id: 'ws-step-1',
        stepId: 'step-1',
        startTime: new Date('2025-01-15T12:00:00Z'),
        isPaused: false,
        actualMinutes: 0,
      })
      mockDb.updateTaskStepProgress.mockResolvedValue(undefined)

      await useTaskStore.getState().startWorkOnStep('step-1', 'wf-1')

      const sessions = useTaskStore.getState().activeWorkSessions
      // Session is keyed by workflowId
      expect(sessions.has('wf-1')).toBe(true)
      expect(sessions.get('wf-1')!.id).toBe('ws-step-1')
    })

    it('returns early if work is already active globally', async () => {
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(true)

      await useTaskStore.getState().startWorkOnStep('step-1', 'wf-1')

      expect(mockWorkTrackingService.startWorkSession).not.toHaveBeenCalled()
    })

    it('returns early if session already active and not paused', async () => {
      const sessions = new Map([
        ['wf-1', { id: 'ws-1', isPaused: false } as any],
      ])
      useTaskStore.setState({ activeWorkSessions: sessions })
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)

      await useTaskStore.getState().startWorkOnStep('step-1', 'wf-1')

      expect(mockWorkTrackingService.startWorkSession).not.toHaveBeenCalled()
    })
  })

  describe('startWork', () => {
    it('delegates to startWorkOnTask for simple tasks', async () => {
      const task = makeTask('t1')
      useTaskStore.setState({ tasks: [task] })
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)
      mockWorkTrackingService.startWorkSession.mockResolvedValue({
        id: 'ws-1', taskId: 't1', startTime: new Date(), isPaused: false, actualMinutes: 0,
      })
      mockDb.updateTask.mockResolvedValue(undefined)

      await useTaskStore.getState().startWork({ isSimpleTask: true, stepId: '', taskId: 't1' })

      expect(mockWorkTrackingService.startWorkSession).toHaveBeenCalledWith('t1', undefined, undefined)
    })

    it('delegates to startWorkOnStep for workflow steps', async () => {
      mockWorkTrackingService.isAnyWorkActive.mockReturnValue(false)
      mockWorkTrackingService.startWorkSession.mockResolvedValue({
        id: 'ws-2', stepId: 's1', startTime: new Date(), isPaused: false, actualMinutes: 0,
      })
      mockDb.updateTaskStepProgress.mockResolvedValue(undefined)

      await useTaskStore.getState().startWork({ isSimpleTask: false, stepId: 's1', taskId: 'wf-1' })

      // For steps, taskId is passed as workflowId
      expect(mockWorkTrackingService.startWorkSession).toHaveBeenCalledWith(undefined, 's1', 'wf-1')
    })
  })

  describe('pauseWorkOnTask', () => {
    it('stops work session and removes from active sessions', async () => {
      const sessions = new Map([
        ['t1', { id: 'ws-1', taskId: 't1', isPaused: false } as any],
      ])
      useTaskStore.setState({ activeWorkSessions: sessions })
      mockWorkTrackingService.stopWorkSession.mockResolvedValue(undefined)

      await useTaskStore.getState().pauseWorkOnTask('t1')

      expect(mockWorkTrackingService.stopWorkSession).toHaveBeenCalledWith('ws-1')
      expect(useTaskStore.getState().activeWorkSessions.has('t1')).toBe(false)
    })

    it('returns early if no active session', async () => {
      await useTaskStore.getState().pauseWorkOnTask('t1')
      expect(mockWorkTrackingService.stopWorkSession).not.toHaveBeenCalled()
    })

    it('removes session with no ID from UI state', async () => {
      const sessions = new Map([
        ['t1', { id: '', taskId: 't1', isPaused: false } as any],
      ])
      useTaskStore.setState({ activeWorkSessions: sessions })

      await useTaskStore.getState().pauseWorkOnTask('t1')

      // Session should still be removed (the !session.id branch)
      expect(useTaskStore.getState().activeWorkSessions.has('t1')).toBe(false)
    })

    it('syncs UI state on error when service has no active session', async () => {
      const sessions = new Map([
        ['t1', { id: 'ws-1', taskId: 't1', isPaused: false } as any],
      ])
      useTaskStore.setState({ activeWorkSessions: sessions })
      mockWorkTrackingService.stopWorkSession.mockRejectedValue(new Error('stop fail'))
      mockWorkTrackingService.getCurrentActiveSession.mockReturnValue(null)

      await expect(
        useTaskStore.getState().pauseWorkOnTask('t1'),
      ).rejects.toThrow('stop fail')

      // Even on error, session should be removed since service has no active session
      expect(useTaskStore.getState().activeWorkSessions.has('t1')).toBe(false)
    })
  })

  describe('skipAsyncWait', () => {
    it('transitions waiting step to completed', async () => {
      const wf = makeWorkflow('wf-1', {
        steps: [{
          id: 'step-1', name: 'Step 1', taskId: 'wf-1', duration: 15,
          type: 'focused', dependsOn: [], asyncWaitTime: 60,
          status: 'waiting' as any, stepIndex: 0, percentComplete: 100,
          isAsyncTrigger: false,
        }],
      } as any)
      useTaskStore.setState({ sequencedTasks: [wf] })
      mockDb.updateTaskStepProgress.mockResolvedValue(undefined)
      const updatedWf = makeWorkflow('wf-1')
      mockDb.getSequencedTaskById.mockResolvedValue(updatedWf)

      await useTaskStore.getState().skipAsyncWait('step-1')

      expect(mockDb.updateTaskStepProgress).toHaveBeenCalledWith('step-1', {
        status: 'completed',
      })
      expect(mockDb.getSequencedTaskById).toHaveBeenCalledWith('wf-1')
    })

    it('returns early if step not found', async () => {
      useTaskStore.setState({ sequencedTasks: [] })

      await useTaskStore.getState().skipAsyncWait('nonexistent')

      expect(mockDb.updateTaskStepProgress).not.toHaveBeenCalled()
    })

    it('returns early if step is not in waiting status', async () => {
      const wf = makeWorkflow('wf-1', {
        steps: [{
          id: 'step-1', name: 'Step 1', taskId: 'wf-1', duration: 15,
          type: 'focused', dependsOn: [], asyncWaitTime: 60,
          status: 'pending' as any, stepIndex: 0, percentComplete: 0,
          isAsyncTrigger: false,
        }],
      } as any)
      useTaskStore.setState({ sequencedTasks: [wf] })

      await useTaskStore.getState().skipAsyncWait('step-1')

      expect(mockDb.updateTaskStepProgress).not.toHaveBeenCalled()
    })
  })

  // ---------- Cleanup ----------

  afterAll(() => {
    clearInjectedWorkTrackingService()
  })
})
