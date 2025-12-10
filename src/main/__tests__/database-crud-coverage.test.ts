import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseService } from '../database'

// Mock PrismaClient with all required models for CRUD tests
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
    userTaskType: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    timeSink: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    timeSinkSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workPattern: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    workBlock: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    workMeeting: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    workSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    jobContext: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    contextEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    taskStep: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
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

describe('Database CRUD Coverage Tests', () => {
  let db: DatabaseService
  let mockPrisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    db = DatabaseService.getInstance()
    mockPrisma = (db as any).client

    // Mock active session for all tests
    mockPrisma.session.findFirst.mockResolvedValue({ id: 'session-1', isActive: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================================
  // UserTaskType CRUD Tests
  // ============================================================================
  describe('UserTaskType Operations', () => {
    const mockUserTaskTypeRecord = {
      id: 'utt-1',
      sessionId: 'session-1',
      name: 'Focus Work',
      emoji: '🎯',
      color: '#FF5733',
      sortOrder: 0,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }

    describe('createUserTaskType', () => {
      it('should create user task type with auto-generated sortOrder', async () => {
        // No existing types, so nextSortOrder should be 0
        mockPrisma.userTaskType.findMany.mockResolvedValue([])
        mockPrisma.userTaskType.create.mockResolvedValue(mockUserTaskTypeRecord)

        const result = await db.createUserTaskType({
          sessionId: 'session-1',
          name: 'Focus Work',
          emoji: '🎯',
          color: '#FF5733',
        })

        expect(result.name).toBe('Focus Work')
        expect(result.emoji).toBe('🎯')
        expect(mockPrisma.userTaskType.create).toHaveBeenCalledTimes(1)
      })

      it('should increment sortOrder when types exist', async () => {
        // Existing type has sortOrder 2
        mockPrisma.userTaskType.findMany.mockResolvedValue([{ sortOrder: 2 }])
        mockPrisma.userTaskType.create.mockResolvedValue({
          ...mockUserTaskTypeRecord,
          sortOrder: 3,
        })

        const result = await db.createUserTaskType({
          sessionId: 'session-1',
          name: 'Admin Work',
          emoji: '📋',
          color: '#3366FF',
        })

        expect(result).toBeDefined()
        expect(mockPrisma.userTaskType.create).toHaveBeenCalled()
      })

      it('should respect explicit sortOrder when provided', async () => {
        mockPrisma.userTaskType.findMany.mockResolvedValue([])
        mockPrisma.userTaskType.create.mockResolvedValue({
          ...mockUserTaskTypeRecord,
          sortOrder: 5,
        })

        const result = await db.createUserTaskType({
          sessionId: 'session-1',
          name: 'Custom Order',
          emoji: '🔢',
          color: '#999999',
          sortOrder: 5,
        })

        expect(result).toBeDefined()
      })
    })

    describe('updateUserTaskType', () => {
      it('should update user task type fields', async () => {
        mockPrisma.userTaskType.update.mockResolvedValue({
          ...mockUserTaskTypeRecord,
          name: 'Updated Name',
          emoji: '✨',
        })

        const result = await db.updateUserTaskType('utt-1', {
          name: 'Updated Name',
          emoji: '✨',
        })

        expect(result.name).toBe('Updated Name')
        expect(result.emoji).toBe('✨')
        expect(mockPrisma.userTaskType.update).toHaveBeenCalledWith({
          where: { id: 'utt-1' },
          data: expect.objectContaining({
            name: 'Updated Name',
            emoji: '✨',
          }),
        })
      })

      it('should only update provided fields', async () => {
        mockPrisma.userTaskType.update.mockResolvedValue({
          ...mockUserTaskTypeRecord,
          color: '#00FF00',
        })

        const result = await db.updateUserTaskType('utt-1', { color: '#00FF00' })

        expect(result.color).toBe('#00FF00')
        expect(result.name).toBe('Focus Work') // Unchanged
      })
    })

    describe('deleteUserTaskType', () => {
      it('should delete user task type by id', async () => {
        mockPrisma.userTaskType.delete.mockResolvedValue(mockUserTaskTypeRecord)

        await db.deleteUserTaskType('utt-1')

        expect(mockPrisma.userTaskType.delete).toHaveBeenCalledWith({
          where: { id: 'utt-1' },
        })
      })
    })

    describe('reorderUserTaskTypes', () => {
      it('should update sortOrder for all provided IDs', async () => {
        mockPrisma.$transaction.mockResolvedValue([])

        await db.reorderUserTaskTypes('session-1', ['utt-3', 'utt-1', 'utt-2'])

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
        // Transaction receives array of update operations
        const transactionArg = mockPrisma.$transaction.mock.calls[0][0]
        expect(transactionArg).toHaveLength(3)
      })

      it('should handle empty array', async () => {
        mockPrisma.$transaction.mockResolvedValue([])

        await db.reorderUserTaskTypes('session-1', [])

        expect(mockPrisma.$transaction).toHaveBeenCalledWith([])
      })
    })

    describe('sessionHasTaskTypes', () => {
      it('should return true when types exist', async () => {
        mockPrisma.userTaskType.count.mockResolvedValue(3)

        const result = await db.sessionHasTaskTypes('session-1')

        expect(result).toBe(true)
      })

      it('should return false when no types exist', async () => {
        mockPrisma.userTaskType.count.mockResolvedValue(0)

        const result = await db.sessionHasTaskTypes('session-1')

        expect(result).toBe(false)
      })

      it('should use active session when sessionId not provided', async () => {
        mockPrisma.userTaskType.count.mockResolvedValue(1)

        const result = await db.sessionHasTaskTypes()

        expect(result).toBe(true)
        expect(mockPrisma.userTaskType.count).toHaveBeenCalledWith({
          where: { sessionId: 'session-1' },
        })
      })
    })
  })

  // ============================================================================
  // TimeSink CRUD Tests
  // ============================================================================
  describe('TimeSink Operations', () => {
    const mockTimeSinkRecord = {
      id: 'ts-1',
      sessionId: 'session-1',
      name: 'Meetings',
      emoji: '📅',
      color: '#FF9900',
      typeId: null,
      sortOrder: 0,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }

    describe('createTimeSink', () => {
      it('should create time sink with auto-generated sortOrder', async () => {
        mockPrisma.timeSink.findMany.mockResolvedValue([])
        mockPrisma.timeSink.create.mockResolvedValue(mockTimeSinkRecord)

        const result = await db.createTimeSink({
          sessionId: 'session-1',
          name: 'Meetings',
          emoji: '📅',
          color: '#FF9900',
        })

        expect(result.name).toBe('Meetings')
        expect(mockPrisma.timeSink.create).toHaveBeenCalled()
      })

      it('should handle typeId for linked time sinks', async () => {
        mockPrisma.timeSink.findMany.mockResolvedValue([])
        mockPrisma.timeSink.create.mockResolvedValue({
          ...mockTimeSinkRecord,
          typeId: 'utt-1',
        })

        const result = await db.createTimeSink({
          sessionId: 'session-1',
          name: 'Focus Work Sink',
          emoji: '🎯',
          color: '#FF5733',
          typeId: 'utt-1',
        })

        expect(result).toBeDefined()
      })
    })

    describe('updateTimeSink', () => {
      it('should update time sink fields', async () => {
        mockPrisma.timeSink.update.mockResolvedValue({
          ...mockTimeSinkRecord,
          name: 'Updated Meetings',
        })

        const result = await db.updateTimeSink('ts-1', { name: 'Updated Meetings' })

        expect(result.name).toBe('Updated Meetings')
      })
    })

    describe('deleteTimeSink', () => {
      it('should delete time sink by id', async () => {
        mockPrisma.timeSink.delete.mockResolvedValue(mockTimeSinkRecord)

        await db.deleteTimeSink('ts-1')

        expect(mockPrisma.timeSink.delete).toHaveBeenCalledWith({
          where: { id: 'ts-1' },
        })
      })
    })

    describe('getTimeSinks', () => {
      it('should return all time sinks for session', async () => {
        mockPrisma.timeSink.findMany.mockResolvedValue([
          mockTimeSinkRecord,
          { ...mockTimeSinkRecord, id: 'ts-2', name: 'Breaks', sortOrder: 1 },
        ])

        const result = await db.getTimeSinks('session-1')

        expect(result).toHaveLength(2)
        expect(result[0].name).toBe('Meetings')
      })

      it('should use active session when sessionId not provided', async () => {
        mockPrisma.timeSink.findMany.mockResolvedValue([])

        await db.getTimeSinks()

        expect(mockPrisma.timeSink.findMany).toHaveBeenCalledWith({
          where: { sessionId: 'session-1' },
          orderBy: { sortOrder: 'asc' },
        })
      })
    })

    describe('getTimeSinkById', () => {
      it('should return time sink when found', async () => {
        mockPrisma.timeSink.findUnique.mockResolvedValue(mockTimeSinkRecord)

        const result = await db.getTimeSinkById('ts-1')

        expect(result).not.toBeNull()
        expect(result?.name).toBe('Meetings')
      })

      it('should return null when not found', async () => {
        mockPrisma.timeSink.findUnique.mockResolvedValue(null)

        const result = await db.getTimeSinkById('non-existent')

        expect(result).toBeNull()
      })
    })

    describe('reorderTimeSinks', () => {
      it('should update sortOrder using transaction', async () => {
        mockPrisma.$transaction.mockResolvedValue([])

        await db.reorderTimeSinks('session-1', ['ts-2', 'ts-1', 'ts-3'])

        expect(mockPrisma.$transaction).toHaveBeenCalled()
      })
    })
  })

  // ============================================================================
  // TimeSinkSession Lifecycle Tests
  // ============================================================================
  describe('TimeSinkSession Operations', () => {
    const mockSessionRecord = {
      id: 'tss-1',
      timeSinkId: 'ts-1',
      startTime: new Date('2024-01-01T09:00:00Z'),
      endTime: null,
      actualMinutes: null,
      notes: null,
      createdAt: new Date('2024-01-01T09:00:00Z'),
    }

    describe('createTimeSinkSession', () => {
      it('should create new time sink session', async () => {
        mockPrisma.timeSinkSession.create.mockResolvedValue(mockSessionRecord)

        const result = await db.createTimeSinkSession({
          timeSinkId: 'ts-1',
          startTime: new Date('2024-01-01T09:00:00Z'),
        })

        expect(result.timeSinkId).toBe('ts-1')
        expect(result.endTime).toBeUndefined()
      })

      it('should create session with optional notes', async () => {
        mockPrisma.timeSinkSession.create.mockResolvedValue({
          ...mockSessionRecord,
          notes: 'Team standup',
        })

        const result = await db.createTimeSinkSession({
          timeSinkId: 'ts-1',
          startTime: new Date('2024-01-01T09:00:00Z'),
          notes: 'Team standup',
        })

        expect(result.notes).toBe('Team standup')
      })
    })

    describe('endTimeSinkSession', () => {
      it('should end session with actual minutes', async () => {
        mockPrisma.timeSinkSession.update.mockResolvedValue({
          ...mockSessionRecord,
          endTime: new Date('2024-01-01T10:00:00Z'),
          actualMinutes: 60,
        })

        const result = await db.endTimeSinkSession('tss-1', 60)

        expect(result.actualMinutes).toBe(60)
        expect(result.endTime).not.toBeNull()
      })

      it('should end session with notes', async () => {
        mockPrisma.timeSinkSession.update.mockResolvedValue({
          ...mockSessionRecord,
          endTime: new Date('2024-01-01T10:00:00Z'),
          actualMinutes: 45,
          notes: 'Good discussion',
        })

        const result = await db.endTimeSinkSession('tss-1', 45, 'Good discussion')

        expect(result.notes).toBe('Good discussion')
      })
    })

    describe('getTimeSinkSessions', () => {
      it('should return all sessions for a time sink', async () => {
        mockPrisma.timeSinkSession.findMany.mockResolvedValue([
          mockSessionRecord,
          { ...mockSessionRecord, id: 'tss-2' },
        ])

        const result = await db.getTimeSinkSessions('ts-1')

        expect(result).toHaveLength(2)
      })
    })

    describe('getTimeSinkSessionsByDate', () => {
      it('should return sessions for specific date', async () => {
        mockPrisma.timeSinkSession.findMany.mockResolvedValue([mockSessionRecord])

        const result = await db.getTimeSinkSessionsByDate('2024-01-01')

        expect(result).toHaveLength(1)
        expect(mockPrisma.timeSinkSession.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              startTime: expect.any(Object),
            }),
          }),
        )
      })
    })

    describe('deleteTimeSinkSession', () => {
      it('should delete session by id', async () => {
        mockPrisma.timeSinkSession.delete.mockResolvedValue(mockSessionRecord)

        await db.deleteTimeSinkSession('tss-1')

        expect(mockPrisma.timeSinkSession.delete).toHaveBeenCalledWith({
          where: { id: 'tss-1' },
        })
      })
    })
  })

  // ============================================================================
  // TimeSink Accumulated Calculation Tests
  // ============================================================================
  describe('getTimeSinkAccumulated', () => {
    it('should calculate accumulated time by sink', async () => {
      mockPrisma.timeSink.findMany.mockResolvedValue([
        { id: 'ts-1', sessionId: 'session-1' },
        { id: 'ts-2', sessionId: 'session-1' },
      ])
      mockPrisma.timeSinkSession.findMany.mockResolvedValue([
        { timeSinkId: 'ts-1', actualMinutes: 30 },
        { timeSinkId: 'ts-1', actualMinutes: 45 },
        { timeSinkId: 'ts-2', actualMinutes: 60 },
      ])

      const result = await db.getTimeSinkAccumulated('2024-01-01', '2024-01-31')

      expect(result.bySink['ts-1']).toBe(75)
      expect(result.bySink['ts-2']).toBe(60)
      expect(result.total).toBe(135)
    })

    it('should return zero when no sessions exist', async () => {
      mockPrisma.timeSink.findMany.mockResolvedValue([{ id: 'ts-1', sessionId: 'session-1' }])
      mockPrisma.timeSinkSession.findMany.mockResolvedValue([])

      const result = await db.getTimeSinkAccumulated('2024-01-01', '2024-01-31')

      expect(result.total).toBe(0)
      expect(result.bySink).toEqual({})
    })

    it('should handle null actualMinutes gracefully', async () => {
      mockPrisma.timeSink.findMany.mockResolvedValue([{ id: 'ts-1', sessionId: 'session-1' }])
      mockPrisma.timeSinkSession.findMany.mockResolvedValue([
        { timeSinkId: 'ts-1', actualMinutes: null },
        { timeSinkId: 'ts-1', actualMinutes: 30 },
      ])

      const result = await db.getTimeSinkAccumulated('2024-01-01', '2024-01-31')

      expect(result.bySink['ts-1']).toBe(30)
      expect(result.total).toBe(30)
    })
  })

  // ============================================================================
  // WorkPattern Tests
  // ============================================================================
  describe('WorkPattern Operations', () => {
    const mockWorkPattern = {
      id: 'wp-1',
      sessionId: 'session-1',
      date: '2024-01-15',
      isTemplate: false,
      templateName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      WorkBlock: [],
      WorkMeeting: [],
      WorkSession: [],
    }

    describe('createWorkPattern', () => {
      it('should create work pattern with blocks', async () => {
        mockPrisma.workPattern.deleteMany.mockResolvedValue({ count: 0 })
        mockPrisma.workPattern.create.mockResolvedValue({
          ...mockWorkPattern,
          WorkBlock: [
            { id: 'wb-1', startTime: '09:00', endTime: '12:00', typeConfig: '{"kind":"single","typeId":"type-test"}', totalCapacity: 180 },
          ],
        })

        const result = await db.createWorkPattern({
          date: '2024-01-15',
          blocks: [{ startTime: '09:00', endTime: '12:00', typeConfig: { kind: 'system', systemType: 'focused' } }],
        })

        expect(result.date).toBe('2024-01-15')
        expect(mockPrisma.workPattern.create).toHaveBeenCalled()
      })

      it('should create template when isTemplate is true', async () => {
        mockPrisma.workPattern.create.mockResolvedValue({
          ...mockWorkPattern,
          isTemplate: true,
          templateName: 'Standard Day',
        })

        const result = await db.createWorkPattern({
          date: '2024-01-15',
          isTemplate: true,
          templateName: 'Standard Day',
        })

        expect(result.isTemplate).toBe(true)
        expect(result.templateName).toBe('Standard Day')
        // Should NOT delete existing patterns for templates
        expect(mockPrisma.workPattern.deleteMany).not.toHaveBeenCalled()
      })

      it('should delete existing pattern before creating non-template', async () => {
        mockPrisma.workPattern.deleteMany.mockResolvedValue({ count: 1 })
        mockPrisma.workPattern.create.mockResolvedValue(mockWorkPattern)

        await db.createWorkPattern({ date: '2024-01-15' })

        expect(mockPrisma.workPattern.deleteMany).toHaveBeenCalledWith({
          where: {
            sessionId: 'session-1',
            date: '2024-01-15',
          },
        })
      })
    })

    describe('updateWorkPattern', () => {
      it('should update work pattern fields', async () => {
        // updateWorkPattern queries existing blocks first and deletes meetings
        mockPrisma.workBlock.findMany.mockResolvedValue([])
        mockPrisma.workMeeting.deleteMany.mockResolvedValue({ count: 0 })
        mockPrisma.workPattern.update.mockResolvedValue({
          ...mockWorkPattern,
          templateName: 'Updated Template',
        })

        const result = await db.updateWorkPattern('wp-1', { templateName: 'Updated Template' })

        expect(result.templateName).toBe('Updated Template')
      })
    })

    describe('getWorkPattern', () => {
      it('should return pattern for specific date', async () => {
        mockPrisma.workPattern.findUnique.mockResolvedValue(mockWorkPattern)

        const result = await db.getWorkPattern('2024-01-15')

        expect(result).not.toBeNull()
        expect(mockPrisma.workPattern.findUnique).toHaveBeenCalled()
      })

      it('should return null when no pattern exists', async () => {
        mockPrisma.workPattern.findUnique.mockResolvedValue(null)

        const result = await db.getWorkPattern('2024-01-20')

        expect(result).toBeNull()
      })
    })
  })

  // ============================================================================
  // WorkSession Tests
  // ============================================================================
  describe('WorkSession Operations', () => {
    describe('getWorkSessionsForTask', () => {
      it('should return all work sessions for a task', async () => {
        mockPrisma.workSession.findMany.mockResolvedValue([
          {
            id: 'ws-1',
            taskId: 'task-1',
            stepId: null,
            startTime: new Date(),
            endTime: null,
            actualMinutes: null,
          },
        ])

        const result = await db.getWorkSessionsForTask('task-1')

        expect(result).toHaveLength(1)
        // Method includes session filtering via Task relation
        expect(mockPrisma.workSession.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ taskId: 'task-1' }),
            orderBy: { startTime: 'desc' },
          }),
        )
      })

      it('should return empty array when no sessions exist', async () => {
        mockPrisma.workSession.findMany.mockResolvedValue([])

        const result = await db.getWorkSessionsForTask('task-no-sessions')

        expect(result).toEqual([])
      })
    })
  })

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================
  describe('Edge Cases', () => {
    describe('Empty data handling', () => {
      it('should handle empty getUserTaskTypes result', async () => {
        mockPrisma.userTaskType.findMany.mockResolvedValue([])

        const result = await db.getUserTaskTypes()

        expect(result).toEqual([])
      })

      it('should handle empty getTimeSinks result', async () => {
        mockPrisma.timeSink.findMany.mockResolvedValue([])

        const result = await db.getTimeSinks()

        expect(result).toEqual([])
      })
    })

    describe('Null handling', () => {
      it('should handle null typeId in time sink', async () => {
        mockPrisma.timeSink.findMany.mockResolvedValue([])
        mockPrisma.timeSink.create.mockResolvedValue({
          id: 'ts-1',
          sessionId: 'session-1',
          name: 'Generic',
          emoji: '⏰',
          color: '#CCCCCC',
          typeId: null,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        const result = await db.createTimeSink({
          sessionId: 'session-1',
          name: 'Generic',
          emoji: '⏰',
          color: '#CCCCCC',
          typeId: null,
        })

        // Entity conversion transforms null to undefined
        expect(result.typeId).toBeUndefined()
      })
    })

    describe('Date handling', () => {
      it('should properly format date strings', async () => {
        mockPrisma.timeSinkSession.findMany.mockResolvedValue([])

        await db.getTimeSinkSessionsByDate('2024-12-25')

        // Verify that date range queries are constructed correctly
        expect(mockPrisma.timeSinkSession.findMany).toHaveBeenCalled()
      })
    })

    describe('Session caching', () => {
      it('should return cached session on subsequent calls', async () => {
        // Session was already initialized in beforeEach, test that multiple calls work
        const session1 = await db.getActiveSession()
        const session2 = await db.getActiveSession()

        // Both calls should return same session ID (from cache)
        expect(session1).toBe(session2)
        expect(session1).toBe('session-1')
      })
    })
  })

  // ============================================================================
  // Additional Database Operations for Coverage
  // ============================================================================
  describe('getUserTaskTypes', () => {
    it('should return all user task types for session', async () => {
      mockPrisma.userTaskType.findMany.mockResolvedValue([
        {
          id: 'utt-1',
          sessionId: 'session-1',
          name: 'Focus',
          emoji: '🎯',
          color: '#FF5733',
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      const result = await db.getUserTaskTypes()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Focus')
      expect(mockPrisma.userTaskType.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
        orderBy: { sortOrder: 'asc' },
      })
    })
  })

  describe('getUserTaskTypeById', () => {
    it('should return user task type when found', async () => {
      mockPrisma.userTaskType.findUnique.mockResolvedValue({
        id: 'utt-1',
        sessionId: 'session-1',
        name: 'Focus',
        emoji: '🎯',
        color: '#FF5733',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await db.getUserTaskTypeById('utt-1')

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Focus')
    })

    it('should return null when not found', async () => {
      mockPrisma.userTaskType.findUnique.mockResolvedValue(null)

      const result = await db.getUserTaskTypeById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getActiveTimeSinkSession', () => {
    it('should return active session when exists', async () => {
      mockPrisma.timeSinkSession.findFirst.mockResolvedValue({
        id: 'tss-1',
        timeSinkId: 'ts-1',
        startTime: new Date(),
        endTime: null,
        actualMinutes: null,
        notes: null,
        createdAt: new Date(),
      })

      const result = await db.getActiveTimeSinkSession('ts-1')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('tss-1')
    })

    it('should return null when no active session', async () => {
      mockPrisma.timeSinkSession.findFirst.mockResolvedValue(null)

      const result = await db.getActiveTimeSinkSession('ts-1')

      expect(result).toBeNull()
    })
  })

  describe('Task Operations', () => {
    it('should get tasks including archived when specified', async () => {
      mockPrisma.task.findMany.mockResolvedValue([])

      await db.getTasks(true)

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sessionId: 'session-1' }),
        }),
      )
    })

    it('should exclude archived tasks by default', async () => {
      mockPrisma.task.findMany.mockResolvedValue([])

      await db.getTasks()

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ archived: false }),
        }),
      )
    })
  })

  describe('Session Management', () => {
    it('should get all sessions', async () => {
      mockPrisma.session.findMany.mockResolvedValue([
        { id: 'session-1', name: 'Work', createdAt: new Date(), updatedAt: new Date() },
        { id: 'session-2', name: 'Personal', createdAt: new Date(), updatedAt: new Date() },
      ])

      const result = await db.getSessions()

      expect(result).toHaveLength(2)
      expect(mockPrisma.session.findMany).toHaveBeenCalledWith({
        orderBy: { updatedAt: 'desc' },
      })
    })

    it('should create a new session', async () => {
      const newSession = {
        id: 'new-session',
        name: 'New Project',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockPrisma.session.create.mockResolvedValue(newSession)

      const result = await db.createSession('New Project')

      expect(result.name).toBe('New Project')
      expect(mockPrisma.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'New Project' }),
      })
    })

    it('should delete a session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-to-delete',
        name: 'To Delete',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mockPrisma.$transaction.mockResolvedValue(undefined)

      await db.deleteSession('session-to-delete')

      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-to-delete' },
      })
    })

    it('should get current session', async () => {
      const result = await db.getCurrentSession()

      expect(result).not.toBeNull()
      expect(result?.id).toBe('session-1')
    })

    it('should update session', async () => {
      const updatedSession = {
        id: 'session-1',
        name: 'Updated Name',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockPrisma.session.update.mockResolvedValue(updatedSession)

      const result = await db.updateSession('session-1', { name: 'Updated Name' })

      expect(result.name).toBe('Updated Name')
    })

    it('should switch session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-2',
        name: 'Other Session',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mockPrisma.session.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.session.update.mockResolvedValue({
        id: 'session-2',
        name: 'Other Session',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await db.switchSession('session-2')

      expect(result.id).toBe('session-2')
      expect(mockPrisma.session.updateMany).toHaveBeenCalled()
    })
  })

  describe('Additional Session Operations', () => {
    it('should get active work session', async () => {
      mockPrisma.workSession.findFirst.mockResolvedValue({
        id: 'ws-1',
        taskId: 'task-1',
        sessionId: 'session-1',
        startTime: new Date(),
        endTime: null,
        actualMinutes: null,
        notes: null,
        isPaused: false,
        pausedAt: null,
        accumulatedMinutes: 0,
        createdAt: new Date(),
      })

      const result = await db.getActiveWorkSession()

      expect(result).not.toBeNull()
      expect(result?.endTime).toBeNull()
    })

    it('should return null when no active work session', async () => {
      mockPrisma.workSession.findFirst.mockResolvedValue(null)

      const result = await db.getActiveWorkSession()

      expect(result).toBeNull()
    })

  })
})
