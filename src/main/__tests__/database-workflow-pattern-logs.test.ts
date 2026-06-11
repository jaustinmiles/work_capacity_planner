import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseService, TypeConfigParseError } from '../database'

// Mock PrismaClient with the models exercised by this file's method groups
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    session: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    taskStep: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    workPattern: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    workBlock: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    workMeeting: {
      deleteMany: vi.fn(),
    },
    jobContext: {
      deleteMany: vi.fn(),
    },
    jargonEntry: {
      deleteMany: vi.fn(),
    },
    timeEstimateAccuracy: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    timeSinkSession: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    appLog: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  }

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  }
})

// Mock logger to avoid log output during tests
vi.mock('../../logger/scope-helper', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('Database workflow, pattern, split and log methods', () => {
  let db: DatabaseService
  let mockPrisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    db = DatabaseService.getInstance()
    mockPrisma = (db as any).client
    // Force a fresh session resolution against the mock for every test
    ;(db as any).activeSessionId = null
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      isActive: true,
      name: 'Test Session',
      createdAt: new Date('2026-06-01T00:00:00Z'),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  // ==========================================================================
  // Active session initialization branches
  // ==========================================================================
  describe('getActiveSession initialization', () => {
    it('reactivates the most recent session instead of creating a duplicate', async () => {
      mockPrisma.session.findFirst
        .mockReset()
        .mockResolvedValueOnce(null) // no active session
        .mockResolvedValueOnce({
          id: 'old-session',
          name: 'Yesterday',
          createdAt: new Date('2026-06-09T00:00:00Z'),
        })
      mockPrisma.session.update.mockResolvedValue({ id: 'old-session', isActive: true })

      const sessionId = await db.getActiveSession()

      expect(sessionId).toBe('old-session')
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: 'old-session' },
        data: { isActive: true },
      })
      expect(mockPrisma.session.create).not.toHaveBeenCalled()
    })

    it('creates a new active session only when the database has none', async () => {
      mockPrisma.session.findFirst.mockReset().mockResolvedValue(null)
      mockPrisma.session.create.mockResolvedValue({ id: 'brand-new', name: 'Wed Jun 10' })

      const sessionId = await db.getActiveSession()

      expect(sessionId).toBe('brand-new')
      const createArg = mockPrisma.session.create.mock.calls[0][0]
      expect(createArg.data.isActive).toBe(true)
      expect(createArg.data.description).toBe('Initial work session')
      expect(typeof createArg.data.name).toBe('string')
    })

    it('shares a single initialization across concurrent callers', async () => {
      const [a, b] = await Promise.all([db.getActiveSession(), db.getActiveSession()])

      expect(a).toBe('session-1')
      expect(b).toBe('session-1')
      expect(mockPrisma.session.findFirst).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // Workflow promotion / completion / step updates
  // ==========================================================================
  describe('promoteTaskToWorkflow', () => {
    it('throws when the task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null)

      await expect(db.promoteTaskToWorkflow('missing')).rejects.toThrow('Task missing not found')
    })

    it('throws when the task is already a workflow', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', hasSteps: true, completed: false })

      await expect(db.promoteTaskToWorkflow('t1')).rejects.toThrow('already a workflow')
    })

    it('throws when the task is completed', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({ id: 't1', hasSteps: false, completed: true })

      await expect(db.promoteTaskToWorkflow('t1')).rejects.toThrow('Cannot promote completed task')
    })

    it('derives workflow durations from the task duration', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 't1',
        hasSteps: false,
        completed: false,
        duration: 60,
        TaskStep: [],
      })
      mockPrisma.task.update.mockResolvedValue({
        id: 't1',
        hasSteps: true,
        duration: 60,
        criticalPathDuration: 60,
        worstCaseDuration: 90,
        dependencies: null,
        TaskStep: [],
      })

      const result = await db.promoteTaskToWorkflow('t1')

      const updateArg = mockPrisma.task.update.mock.calls[0][0]
      expect(updateArg.data.hasSteps).toBe(true)
      expect(updateArg.data.criticalPathDuration).toBe(60)
      expect(updateArg.data.worstCaseDuration).toBe(90) // 1.5x rounded
      expect(updateArg.data.overallStatus).toBe('not_started')
      expect(result.hasSteps).toBe(true)
      expect(result.dependencies).toEqual([])
    })
  })

  describe('completeTask', () => {
    it('records estimate accuracy with computed variance when actualDuration provided', async () => {
      mockPrisma.task.update.mockResolvedValue({
        id: 't1',
        type: 'type-1',
        duration: 60,
        completed: true,
        dependencies: null,
      })
      mockPrisma.timeEstimateAccuracy.create.mockResolvedValue({})

      const result = await db.completeTask('t1', 90)

      expect(result.completed).toBe(true)
      const updateArg = mockPrisma.task.update.mock.calls[0][0]
      expect(updateArg.data.completed).toBe(true)
      expect(updateArg.data.completedAt).toBeInstanceOf(Date)
      expect(updateArg.data.actualDuration).toBe(90)

      const accuracyArg = mockPrisma.timeEstimateAccuracy.create.mock.calls[0][0]
      expect(accuracyArg.data.variance).toBe(50) // (90-60)/60 * 100
      expect(accuracyArg.data.taskType).toBe('type-1')
      expect(accuracyArg.data.sessionId).toBe('session-1')
    })

    it('skips accuracy recording when no actualDuration is given', async () => {
      mockPrisma.task.update.mockResolvedValue({
        id: 't1',
        type: 'type-1',
        duration: 60,
        completed: true,
        dependencies: null,
      })

      await db.completeTask('t1')

      expect(mockPrisma.task.update.mock.calls[0][0].data.actualDuration).toBeNull()
      expect(mockPrisma.timeEstimateAccuracy.create).not.toHaveBeenCalled()
    })
  })

  describe('updateTaskStep', () => {
    it('advances currentStepId to the next pending step on completion', async () => {
      mockPrisma.taskStep.update.mockResolvedValue({})
      mockPrisma.taskStep.findMany.mockResolvedValue([
        { id: 's1', status: 'completed', stepIndex: 0 },
        { id: 's2', status: 'pending', stepIndex: 1 },
      ])
      mockPrisma.task.update.mockResolvedValue({})

      await db.updateTaskStep('t1', 's1', { status: 'completed' })

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { currentStepId: 's2' },
      })
    })

    it('marks the task completed when all steps are done', async () => {
      mockPrisma.taskStep.update.mockResolvedValue({})
      mockPrisma.taskStep.findMany.mockResolvedValue([
        { id: 's1', status: 'completed', stepIndex: 0 },
        { id: 's2', status: 'completed', stepIndex: 1 },
      ])
      mockPrisma.task.update.mockResolvedValue({})

      await db.updateTaskStep('t1', 's2', { status: 'completed' })

      const updateArg = mockPrisma.task.update.mock.calls[0][0]
      expect(updateArg.data.completed).toBe(true)
      expect(updateArg.data.overallStatus).toBe('completed')
      expect(updateArg.data.currentStepId).toBeNull()
      expect(updateArg.data.completedAt).toBeInstanceOf(Date)
    })

    it('does not touch the task when the update is not a completion', async () => {
      mockPrisma.taskStep.update.mockResolvedValue({})

      await db.updateTaskStep('t1', 's1', { status: 'in_progress', percentComplete: 40 })

      expect(mockPrisma.taskStep.findMany).not.toHaveBeenCalled()
      expect(mockPrisma.task.update).not.toHaveBeenCalled()
    })
  })

  describe('updateTaskStepProgress', () => {
    it('throws when the step does not exist', async () => {
      mockPrisma.taskStep.findUnique.mockResolvedValue(null)

      await expect(db.updateTaskStepProgress('s-missing', { status: 'in_progress' })).rejects.toThrow(
        'Step not found',
      )
    })

    it('throws when the step has no task', async () => {
      mockPrisma.taskStep.findUnique.mockResolvedValue({ id: 's1', taskId: null })

      await expect(db.updateTaskStepProgress('s1', { status: 'in_progress' })).rejects.toThrow(
        'has no associated taskId',
      )
    })

    it('delegates to updateTaskStep with the resolved taskId', async () => {
      mockPrisma.taskStep.findUnique.mockResolvedValue({ id: 's1', taskId: 't1' })
      mockPrisma.taskStep.update.mockResolvedValue({})

      await db.updateTaskStepProgress('s1', { percentComplete: 75 })

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { percentComplete: 75 },
      })
    })
  })

  // ==========================================================================
  // Sequenced task adapters
  // ==========================================================================
  describe('getSequencedTaskById', () => {
    it('returns null when the task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null)

      expect(await db.getSequencedTaskById('missing')).toBeNull()
    })

    it('returns null for a standalone (non-workflow) task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 't1',
        hasSteps: false,
        dependencies: null,
        TaskStep: [],
      })

      expect(await db.getSequencedTaskById('t1')).toBeNull()
    })

    it('formats a workflow with parsed step dependencies and derived fields', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'wf-1',
        hasSteps: true,
        duration: 90,
        overallStatus: null,
        criticalPathDuration: null,
        worstCaseDuration: null,
        dependencies: '["other-task"]',
        TaskStep: [
          { id: 's2', stepIndex: 1, dependsOn: '["s1"]' },
          { id: 's1', stepIndex: 0, dependsOn: null },
        ],
      })

      const result = await db.getSequencedTaskById('wf-1')

      expect(result.totalDuration).toBe(90)
      expect(result.overallStatus).toBe('not_started')
      expect(result.criticalPathDuration).toBe(90)
      expect(result.worstCaseDuration).toBe(90)
      expect(result.dependencies).toEqual(['other-task'])
      // Steps sorted by stepIndex with parsed dependsOn
      expect(result.steps.map((s: any) => s.id)).toEqual(['s1', 's2'])
      expect(result.steps[1].dependsOn).toEqual(['s1'])
    })
  })

  it('deleteSequencedTask delegates to task deletion', async () => {
    mockPrisma.task.delete.mockResolvedValue({})

    await db.deleteSequencedTask('wf-1')

    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 'wf-1' } })
  })

  // ==========================================================================
  // addStepToWorkflow
  // ==========================================================================
  describe('addStepToWorkflow', () => {
    const existingSteps = [
      { id: 'step-a', name: 'Research', stepIndex: 0, duration: 30 },
      { id: 'step-b', name: 'Write', stepIndex: 1, duration: 60 },
    ]

    const workflowAfterInsert = {
      id: 'wf-1',
      hasSteps: true,
      duration: 90,
      dependencies: null,
      TaskStep: [
        { id: 'step-a', name: 'Research', stepIndex: 0, duration: 30, dependsOn: null },
        { id: 'new-step', name: 'Review', stepIndex: 1, duration: 45, dependsOn: '[]' },
        { id: 'step-b', name: 'Write', stepIndex: 2, duration: 60, dependsOn: null },
      ],
    }

    it('inserts after a named step, shifting later steps and resolving dependencies', async () => {
      mockPrisma.taskStep.findMany.mockResolvedValue(existingSteps)
      mockPrisma.taskStep.update.mockResolvedValue({})
      mockPrisma.taskStep.create.mockResolvedValue({})
      mockPrisma.task.findUnique.mockResolvedValue(workflowAfterInsert)
      mockPrisma.task.update.mockResolvedValue({})

      const result = await db.addStepToWorkflow('wf-1', {
        name: 'Review',
        duration: 45,
        type: 'type-1',
        afterStep: 'Research',
        dependencies: ['Research', 'step-b', 'unknown-dep'],
      })

      // 'Write' (index 1) shifted to index 2
      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-b' },
        data: { stepIndex: 2 },
      })

      const createArg = mockPrisma.taskStep.create.mock.calls[0][0]
      expect(createArg.data.stepIndex).toBe(1)
      expect(createArg.data.taskId).toBe('wf-1')
      expect(createArg.data.status).toBe('pending')
      // name resolved to id, id kept, unknown stored as-is
      expect(JSON.parse(createArg.data.dependsOn)).toEqual(['step-a', 'step-b', 'unknown-dep'])

      // Workflow duration recalculated from all steps: 30 + 45 + 60
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'wf-1' },
        data: { duration: 135 },
      })

      expect(result.steps).toHaveLength(3)
    })

    it('appends to the end when no position is specified', async () => {
      mockPrisma.taskStep.findMany.mockResolvedValue(existingSteps)
      mockPrisma.taskStep.create.mockResolvedValue({})
      mockPrisma.task.findUnique.mockResolvedValue(workflowAfterInsert)
      mockPrisma.task.update.mockResolvedValue({})

      await db.addStepToWorkflow('wf-1', { name: 'Ship', duration: 15, type: 'type-1' })

      // No shifting needed
      expect(mockPrisma.taskStep.update).not.toHaveBeenCalled()
      expect(mockPrisma.taskStep.create.mock.calls[0][0].data.stepIndex).toBe(2)
    })

    it('inserts before a named step and shifts everything from that index', async () => {
      mockPrisma.taskStep.findMany.mockResolvedValue(existingSteps)
      mockPrisma.taskStep.update.mockResolvedValue({})
      mockPrisma.taskStep.create.mockResolvedValue({})
      mockPrisma.task.findUnique.mockResolvedValue(workflowAfterInsert)
      mockPrisma.task.update.mockResolvedValue({})

      await db.addStepToWorkflow('wf-1', {
        name: 'Plan',
        duration: 20,
        type: 'type-1',
        beforeStep: 'Research',
        asyncWaitTime: 10,
      })

      // Both existing steps shifted up by one
      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-a' },
        data: { stepIndex: 1 },
      })
      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: 'step-b' },
        data: { stepIndex: 2 },
      })
      const createArg = mockPrisma.taskStep.create.mock.calls[0][0]
      expect(createArg.data.stepIndex).toBe(0)
      expect(createArg.data.asyncWaitTime).toBe(10)
    })
  })

  // ==========================================================================
  // Work patterns: listing, templates, typeConfig parsing
  // ==========================================================================
  describe('Work pattern listing and templates', () => {
    const validBlock = {
      id: 'b1',
      startTime: '09:00',
      endTime: '11:00',
      typeConfig: JSON.stringify({ kind: 'single', typeId: 'type-1' }),
      totalCapacity: 120,
      patternId: 'p1',
    }

    const meetingRow = {
      id: 'm1',
      name: 'Standup',
      startTime: '09:00',
      endTime: '09:15',
      daysOfWeek: JSON.stringify(['mon', 'wed']),
    }

    const patternRow = (block: any) => ({
      id: 'p1',
      date: '2026-06-10',
      sessionId: 'session-1',
      isTemplate: false,
      WorkBlock: [block],
      WorkMeeting: [meetingRow, { ...meetingRow, id: 'm2', daysOfWeek: null }],
    })

    it('getWorkPatterns maps blocks with parsed typeConfig, capacity and meetings', async () => {
      mockPrisma.workPattern.findMany.mockResolvedValue([patternRow(validBlock)])

      const result = await db.getWorkPatterns()

      expect(result).toHaveLength(1)
      const block = result[0].blocks[0]
      expect(block.typeConfig).toEqual({ kind: 'single', typeId: 'type-1' })
      expect(block.capacity.totalMinutes).toBe(120) // 09:00 -> 11:00
      expect(block.totalCapacity).toBe(120)
      expect(result[0].meetings[0].daysOfWeek).toEqual(['mon', 'wed'])
      expect(result[0].meetings[1].daysOfWeek).toBeNull()
      // Templates excluded
      expect(mockPrisma.workPattern.findMany.mock.calls[0][0].where.isTemplate).toBe(false)
    })

    it.each([
      ['null typeConfig', null],
      ['invalid JSON', '{broken'],
      ['unknown kind', JSON.stringify({ kind: 'bogus' })],
      ['single without typeId', JSON.stringify({ kind: 'single' })],
      ['combo without allocations', JSON.stringify({ kind: 'combo' })],
      ['system without systemType', JSON.stringify({ kind: 'system' })],
    ])('getWorkPatterns surfaces TypeConfigParseError for %s', async (_label, typeConfig) => {
      mockPrisma.workPattern.findMany.mockResolvedValue([
        patternRow({ ...validBlock, typeConfig }),
      ])

      await expect(db.getWorkPatterns()).rejects.toThrow(TypeConfigParseError)
    })

    it('getWorkPatternTemplates returns only templates with mapped blocks', async () => {
      mockPrisma.workPattern.findMany.mockResolvedValue([
        { ...patternRow(validBlock), isTemplate: true, templateName: 'Default Day' },
      ])

      const result = await db.getWorkPatternTemplates()

      expect(result[0].templateName).toBe('Default Day')
      expect(result[0].blocks[0].capacity.totalMinutes).toBe(120)
      expect(mockPrisma.workPattern.findMany.mock.calls[0][0].where.isTemplate).toBe(true)
    })

    it('getWorkTemplates delegates to getWorkPatternTemplates', async () => {
      mockPrisma.workPattern.findMany.mockResolvedValue([])

      const result = await db.getWorkTemplates()

      expect(result).toEqual([])
      expect(mockPrisma.workPattern.findMany.mock.calls[0][0].where.isTemplate).toBe(true)
    })

    it('createWorkPatternFromTemplate throws when the template is missing', async () => {
      mockPrisma.workPattern.findFirst.mockResolvedValue(null)

      await expect(db.createWorkPatternFromTemplate('2026-06-11', 'Nope')).rejects.toThrow(
        'Template "Nope" not found',
      )
    })

    it('createWorkPatternFromTemplate copies blocks and meetings into a non-template pattern', async () => {
      mockPrisma.workPattern.findFirst.mockResolvedValue({
        id: 'tpl-1',
        isTemplate: true,
        templateName: 'Default Day',
        WorkBlock: [validBlock],
        WorkMeeting: [meetingRow],
      })
      mockPrisma.workPattern.create.mockResolvedValue({
        id: 'p2',
        date: '2026-06-11',
        isTemplate: false,
        templateName: 'Default Day',
        WorkBlock: [{ ...validBlock, id: 'b2', patternId: 'p2' }],
        WorkMeeting: [meetingRow],
      })

      const result = await db.createWorkPatternFromTemplate('2026-06-11', 'Default Day')

      const createArg = mockPrisma.workPattern.create.mock.calls[0][0]
      expect(createArg.data.date).toBe('2026-06-11')
      expect(createArg.data.isTemplate).toBe(false)
      // typeConfig copied verbatim from the template block
      expect(createArg.data.WorkBlock.create[0].typeConfig).toBe(validBlock.typeConfig)
      expect(createArg.data.WorkMeeting.create[0].name).toBe('Standup')
      expect(result.blocks[0].typeConfig).toEqual({ kind: 'single', typeId: 'type-1' })
    })

    it('deleteWorkPattern deletes the pattern by id', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        id: 'p1',
        date: '2026-06-10',
        sessionId: 'session-1',
        isTemplate: false,
        WorkBlock: [],
        WorkMeeting: [],
      })
      mockPrisma.workPattern.delete.mockResolvedValue({})

      await db.deleteWorkPattern('p1')

      expect(mockPrisma.workPattern.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    })

    it('saveAsTemplate throws when no pattern exists for the date', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue(null)

      await expect(db.saveAsTemplate('2026-06-10', 'My Template')).rejects.toThrow(
        'No pattern found for date',
      )
    })

    it('saveAsTemplate snapshots the day into a template pattern', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        id: 'p1',
        date: '2026-06-10',
        sessionId: 'session-1',
        WorkBlock: [validBlock],
        WorkMeeting: [],
        WorkSession: [],
      })
      mockPrisma.workPattern.create.mockResolvedValue({
        id: 'tpl-1',
        isTemplate: true,
        templateName: 'My Template',
        WorkBlock: [validBlock],
        WorkMeeting: [],
      })

      const result = await db.saveAsTemplate('2026-06-10', 'My Template')

      // Templates are not deduplicated by date, so no deleteMany
      expect(mockPrisma.workPattern.deleteMany).not.toHaveBeenCalled()
      const createArg = mockPrisma.workPattern.create.mock.calls[0][0]
      expect(createArg.data.isTemplate).toBe(true)
      expect(createArg.data.templateName).toBe('My Template')
      expect(createArg.data.date).toContain('template-')
      expect(result.templateName).toBe('My Template')
    })
  })

  // ==========================================================================
  // Work sessions: pattern lookup, ending, splitting, recalculation
  // ==========================================================================
  describe('getWorkSessionsForPattern', () => {
    it('returns the sessions belonging to a pattern', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue({
        id: 'p1',
        WorkSession: [{ id: 'ws-1' }, { id: 'ws-2' }],
      })

      const result = await db.getWorkSessionsForPattern('p1')

      expect(result.map((s: any) => s.id)).toEqual(['ws-1', 'ws-2'])
    })

    it('returns an empty array when the pattern is missing', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue(null)

      expect(await db.getWorkSessionsForPattern('missing')).toEqual([])
    })
  })

  it('endWorkSession stamps an end time and the actual minutes', async () => {
    mockPrisma.workSession.update.mockResolvedValue({ id: 'ws-1', actualMinutes: 25 })

    const result = await db.endWorkSession('ws-1', 25)

    const arg = mockPrisma.workSession.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'ws-1' })
    expect(arg.data.actualMinutes).toBe(25)
    expect(arg.data.endTime).toBeInstanceOf(Date)
    expect(result.actualMinutes).toBe(25)
  })

  it('getTaskTotalLoggedTime sums actual minutes, falling back to planned', async () => {
    mockPrisma.workSession.findMany.mockResolvedValue([
      { id: 'ws-1', actualMinutes: 30, plannedMinutes: 60 },
      { id: 'ws-2', actualMinutes: null, plannedMinutes: 45 },
      { id: 'ws-3', actualMinutes: null, plannedMinutes: null },
    ])

    expect(await db.getTaskTotalLoggedTime('t1')).toBe(75)
  })

  it('getWorkSessions filters by local-day range and session ownership', async () => {
    mockPrisma.workSession.findMany.mockResolvedValue([{ id: 'ws-1' }])

    const result = await db.getWorkSessions('2026-06-10')

    expect(result).toHaveLength(1)
    const where = mockPrisma.workSession.findMany.mock.calls[0][0].where
    expect(where.Task).toEqual({ sessionId: 'session-1' })
    expect(where.startTime.gte).toEqual(new Date(2026, 5, 10, 0, 0, 0, 0))
    expect(where.startTime.lte).toEqual(new Date(2026, 5, 10, 23, 59, 59, 999))
  })

  it('getStepWorkSessions queries sessions by stepId', async () => {
    mockPrisma.workSession.findMany.mockResolvedValue([{ id: 'ws-1', stepId: 's1' }])

    const result = await db.getStepWorkSessions('s1')

    expect(result).toHaveLength(1)
    expect(mockPrisma.workSession.findMany).toHaveBeenCalledWith({ where: { stepId: 's1' } })
  })

  describe('recalculateTaskActualDuration', () => {
    it('sums task-level sessions and writes the total', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([
        { actualMinutes: 25, plannedMinutes: 50 },
        { actualMinutes: null, plannedMinutes: 20 },
      ])
      mockPrisma.task.update.mockResolvedValue({})

      await db.recalculateTaskActualDuration('t1')

      expect(mockPrisma.workSession.findMany.mock.calls[0][0].where).toEqual({
        taskId: 't1',
        stepId: null,
      })
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { actualDuration: 45 },
      })
    })

    it('writes null when there is no logged time', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([])
      mockPrisma.task.update.mockResolvedValue({})

      await db.recalculateTaskActualDuration('t1')

      expect(mockPrisma.task.update.mock.calls[0][0].data.actualDuration).toBeNull()
    })
  })

  describe('splitWorkSession', () => {
    const start = new Date('2026-06-10T10:00:00Z')
    const end = new Date('2026-06-10T11:00:00Z')
    const splitTime = new Date('2026-06-10T10:30:00Z')

    const original = {
      id: 'ws-1',
      taskId: 'task-1',
      stepId: null,
      patternId: 'p1',
      blockId: 'b1',
      type: 'type-1',
      startTime: start,
      endTime: end,
      notes: 'split me',
      Task: { id: 'task-1' },
    }

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
    })

    it('throws when the session does not exist', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue(null)

      await expect(db.splitWorkSession('missing', splitTime)).rejects.toThrow(
        'Work session not found',
      )
    })

    it('rejects a split at or before the start', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue(original)

      await expect(db.splitWorkSession('ws-1', start)).rejects.toThrow(
        'Split time must be after session start',
      )
    })

    it('rejects a split at or after the end', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue(original)

      await expect(db.splitWorkSession('ws-1', end)).rejects.toThrow(
        'Split time must be before session end',
      )
    })

    it('splits a closed session into two halves with computed durations', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue(original)
      mockPrisma.workSession.update.mockResolvedValue({ id: 'ws-1', endTime: splitTime })
      mockPrisma.workSession.create.mockResolvedValue({ id: 'ws-2', startTime: splitTime })
      mockPrisma.workSession.findMany.mockResolvedValue([]) // recalculation reads
      mockPrisma.task.update.mockResolvedValue({})

      const result = await db.splitWorkSession('ws-1', splitTime)

      // First half: original truncated to 30 minutes
      const updateArg = mockPrisma.workSession.update.mock.calls[0][0]
      expect(updateArg.data.endTime).toEqual(splitTime)
      expect(updateArg.data.actualMinutes).toBe(30)

      // Second half: inherits placement and runs split -> original end (30 min)
      const createArg = mockPrisma.workSession.create.mock.calls[0][0]
      expect(createArg.data.taskId).toBe('task-1')
      expect(createArg.data.blockId).toBe('b1')
      expect(createArg.data.startTime).toEqual(splitTime)
      expect(createArg.data.endTime).toEqual(end)
      expect(createArg.data.plannedMinutes).toBe(30)
      expect(createArg.data.actualMinutes).toBe(30)
      expect(createArg.data.notes).toBe('split me')

      expect(result.firstHalf.id).toBe('ws-1')
      expect(result.secondHalf.id).toBe('ws-2')

      // Original task duration recalculated
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { actualDuration: null },
      })
    })

    it('handles an open-ended session by leaving the second half open', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({ ...original, endTime: null })
      mockPrisma.workSession.update.mockResolvedValue({ id: 'ws-1' })
      mockPrisma.workSession.create.mockResolvedValue({ id: 'ws-2' })
      mockPrisma.workSession.findMany.mockResolvedValue([])
      mockPrisma.task.update.mockResolvedValue({})

      await db.splitWorkSession('ws-1', splitTime)

      const createArg = mockPrisma.workSession.create.mock.calls[0][0]
      expect(createArg.data.endTime).toBeNull()
      expect(createArg.data.plannedMinutes).toBe(0)
      expect(createArg.data.actualMinutes).toBeNull()
    })

    it('recalculates both tasks when the second half is reassigned', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue(original)
      mockPrisma.workSession.update.mockResolvedValue({ id: 'ws-1' })
      mockPrisma.workSession.create.mockResolvedValue({ id: 'ws-2' })
      mockPrisma.workSession.findMany.mockResolvedValue([])
      mockPrisma.task.update.mockResolvedValue({})

      await db.splitWorkSession('ws-1', splitTime, 'task-2')

      expect(mockPrisma.workSession.create.mock.calls[0][0].data.taskId).toBe('task-2')
      const recalculatedIds = mockPrisma.task.update.mock.calls.map((c: any) => c[0].where.id)
      expect(recalculatedIds).toEqual(['task-1', 'task-2'])
    })
  })

  describe('splitTimeSinkSession', () => {
    const start = new Date('2026-06-10T20:00:00Z')
    const end = new Date('2026-06-10T21:00:00Z')
    const splitTime = new Date('2026-06-10T20:15:00Z')

    const original = {
      id: 'tss-1',
      timeSinkId: 'sink-1',
      startTime: start,
      endTime: end,
      notes: null,
      createdAt: start,
    }

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
    })

    it('throws when the session does not exist', async () => {
      mockPrisma.timeSinkSession.findUnique.mockResolvedValue(null)

      await expect(db.splitTimeSinkSession('missing', splitTime)).rejects.toThrow(
        'Time sink session not found',
      )
    })

    it('validates the split time against the session bounds', async () => {
      mockPrisma.timeSinkSession.findUnique.mockResolvedValue(original)

      await expect(db.splitTimeSinkSession('tss-1', start)).rejects.toThrow(
        'Split time must be after session start',
      )
      await expect(db.splitTimeSinkSession('tss-1', end)).rejects.toThrow(
        'Split time must be before session end',
      )
    })

    it('splits into two converted sessions on the same time sink', async () => {
      mockPrisma.timeSinkSession.findUnique.mockResolvedValue(original)
      mockPrisma.timeSinkSession.update.mockResolvedValue({
        id: 'tss-1',
        timeSinkId: 'sink-1',
        startTime: start,
        endTime: splitTime,
        actualMinutes: 15,
        notes: null,
        createdAt: start,
      })
      mockPrisma.timeSinkSession.create.mockResolvedValue({
        id: 'tss-2',
        timeSinkId: 'sink-1',
        startTime: splitTime,
        endTime: end,
        actualMinutes: 45,
        notes: null,
        createdAt: start,
      })

      const result = await db.splitTimeSinkSession('tss-1', splitTime)

      expect(mockPrisma.timeSinkSession.create.mock.calls[0][0].data.timeSinkId).toBe('sink-1')

      // Records converted to domain objects: Dates restored, nulls become undefined
      expect(result.firstHalf.endTime).toBeInstanceOf(Date)
      expect(result.firstHalf.endTime?.getTime()).toBe(splitTime.getTime())
      expect(result.firstHalf.actualMinutes).toBe(15)
      expect(result.firstHalf.notes).toBeUndefined()
      expect(result.secondHalf.actualMinutes).toBe(45)
      expect(result.secondHalf.startTime.getTime()).toBe(splitTime.getTime())
    })
  })

  // ==========================================================================
  // Time estimate accuracy
  // ==========================================================================
  describe('Time estimate accuracy', () => {
    it('recordTimeEstimateAccuracy computes the variance percentage', async () => {
      mockPrisma.timeEstimateAccuracy.create.mockResolvedValue({})

      await db.recordTimeEstimateAccuracy('session-1', {
        taskType: 'type-1',
        estimatedMinutes: 100,
        actualMinutes: 80,
      })

      const arg = mockPrisma.timeEstimateAccuracy.create.mock.calls[0][0]
      expect(arg.data.variance).toBe(-20) // finished 20% under estimate
      expect(arg.data.workflowCategory).toBeNull()
    })

    it('getTimeEstimateStats returns zeroed stats when no data exists', async () => {
      mockPrisma.timeEstimateAccuracy.findMany.mockResolvedValue([])

      expect(await db.getTimeEstimateStats()).toEqual({
        avgVariance: 0,
        totalEstimates: 0,
        overestimateCount: 0,
        underestimateCount: 0,
      })
    })

    it('getTimeEstimateStats aggregates variance and over/under counts', async () => {
      mockPrisma.timeEstimateAccuracy.findMany.mockResolvedValue([
        { variance: -10 },
        { variance: 20 },
        { variance: 5 },
      ])

      const stats = await db.getTimeEstimateStats('type-1')

      expect(stats.avgVariance).toBe(5)
      expect(stats.totalEstimates).toBe(3)
      expect(stats.overestimateCount).toBe(1) // negative variance = overestimated
      expect(stats.underestimateCount).toBe(2)
      expect(mockPrisma.timeEstimateAccuracy.findMany.mock.calls[0][0].where).toEqual({
        sessionId: 'session-1',
        taskType: 'type-1',
      })
    })

    it('recordTimeEstimate resolves the active session before delegating', async () => {
      mockPrisma.timeEstimateAccuracy.create.mockResolvedValue({})

      await db.recordTimeEstimate({ taskType: 'type-1', estimatedMinutes: 50, actualMinutes: 50 })

      expect(mockPrisma.timeEstimateAccuracy.create.mock.calls[0][0].data.sessionId).toBe('session-1')
      expect(mockPrisma.timeEstimateAccuracy.create.mock.calls[0][0].data.variance).toBe(0)
    })

    it('getTimeAccuracyStats forwards the taskType filter', async () => {
      mockPrisma.timeEstimateAccuracy.findMany.mockResolvedValue([])

      await db.getTimeAccuracyStats({ taskType: 'type-2' })

      expect(mockPrisma.timeEstimateAccuracy.findMany.mock.calls[0][0].where.taskType).toBe('type-2')
    })
  })

  // ==========================================================================
  // Log persistence and retrieval
  // ==========================================================================
  describe('Log persistence', () => {
    const entry = { level: 'info', message: 'hello', source: 'main', context: { a: 1 } }

    it('persistLog is a no-op in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      await db.persistLog(entry)

      expect(mockPrisma.appLog.create).not.toHaveBeenCalled()
    })

    it('persistLog stores the entry with the active session id as fallback', async () => {
      mockPrisma.appLog.create.mockResolvedValue({})

      await db.persistLog(entry)

      const arg = mockPrisma.appLog.create.mock.calls[0][0]
      expect(arg.data.message).toBe('hello')
      expect(arg.data.context).toBe(JSON.stringify({ a: 1 }))
      expect(arg.data.sessionId).toBe('session-1')
    })

    it('persistLog swallows database errors', async () => {
      mockPrisma.appLog.create.mockRejectedValue(new Error('disk full'))

      await expect(db.persistLog(entry)).resolves.toBeUndefined()
    })

    it('persistLogs batches entries with per-entry session fallback', async () => {
      mockPrisma.appLog.createMany.mockResolvedValue({ count: 2 })

      await db.persistLogs([entry, { ...entry, message: 'second', sessionId: 'explicit' }])

      const arg = mockPrisma.appLog.createMany.mock.calls[0][0]
      expect(arg.data).toHaveLength(2)
      expect(arg.data[0].sessionId).toBe('session-1')
      expect(arg.data[1].sessionId).toBe('explicit')
    })

    it('persistLogs is a no-op in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      await db.persistLogs([entry])

      expect(mockPrisma.appLog.createMany).not.toHaveBeenCalled()
    })

    it('getSessionLogs builds the filter from all provided options', async () => {
      mockPrisma.appLog.findMany.mockResolvedValue([{ id: 1 }])
      const since = new Date('2026-06-10T00:00:00Z')

      const result = await db.getSessionLogs({
        sessionId: 's-9',
        level: 'error',
        source: 'renderer',
        since,
        limit: 25,
      })

      expect(result).toHaveLength(1)
      expect(mockPrisma.appLog.findMany).toHaveBeenCalledWith({
        where: {
          sessionId: 's-9',
          level: 'error',
          source: 'renderer',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      })
    })

    it('getSessionLogs defaults to an unfiltered query with limit 100', async () => {
      mockPrisma.appLog.findMany.mockResolvedValue([])

      await db.getSessionLogs()

      expect(mockPrisma.appLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    })

    it('getLoggedSessions maps grouped counts and drops null session ids', async () => {
      mockPrisma.appLog.groupBy.mockResolvedValue([
        { sessionId: 's-1', _count: { id: 12 } },
        { sessionId: null, _count: { id: 3 } },
        { sessionId: 's-2', _count: { id: 5 } },
      ])

      const result = await db.getLoggedSessions()

      expect(result).toEqual([
        { sessionId: 's-1', logCount: 12 },
        { sessionId: 's-2', logCount: 5 },
      ])
    })
  })

  // ==========================================================================
  // Bulk deletion and lifecycle
  // ==========================================================================
  describe('Bulk deletion', () => {
    it('deleteAllTasks removes only the current session tasks', async () => {
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 3 })

      await db.deleteAllTasks()

      expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
      })
    })

    it('deleteAllSequencedTasks removes only workflows', async () => {
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 1 })

      await db.deleteAllSequencedTasks()

      expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1', hasSteps: true },
      })
    })

    it('deleteAllUserData clears tasks, patterns, contexts and jargon for the session', async () => {
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.workPattern.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.jobContext.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.jargonEntry.deleteMany.mockResolvedValue({ count: 0 })

      await db.deleteAllUserData()

      const sessionWhere = { where: { sessionId: 'session-1' } }
      expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith(sessionWhere)
      expect(mockPrisma.workPattern.deleteMany).toHaveBeenCalledWith(sessionWhere)
      expect(mockPrisma.jobContext.deleteMany).toHaveBeenCalledWith(sessionWhere)
      expect(mockPrisma.jargonEntry.deleteMany).toHaveBeenCalledWith(sessionWhere)
    })
  })

  it('disconnect closes the prisma client', async () => {
    mockPrisma.$disconnect.mockResolvedValue(undefined)

    await db.disconnect()

    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1)
  })
})
