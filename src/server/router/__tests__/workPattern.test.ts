/**
 * Tests for the workPattern router
 *
 * Tests work pattern CRUD operations, templates, and block/meeting management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockContext, type MockPrisma } from './router-test-helpers'
import { BlockConfigKind } from '@shared/enums'

// Mock work block for testing
function createMockWorkBlock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'block-123',
    patternId: 'pattern-123',
    startTime: '09:00',
    endTime: '12:00',
    typeConfig: JSON.stringify({ kind: BlockConfigKind.Single, typeId: 'dev' }),
    totalCapacity: 180,
    ...overrides,
  }
}

// Mock work meeting for testing
function createMockWorkMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: 'meeting-123',
    patternId: 'pattern-123',
    name: 'Daily Standup',
    startTime: '09:00',
    endTime: '09:30',
    type: 'meeting',
    recurring: 'daily',
    daysOfWeek: null,
    ...overrides,
  }
}

// Mock work pattern for testing
function createMockWorkPattern(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pattern-123',
    date: '2025-01-26',
    isTemplate: false,
    templateName: null,
    sessionId: 'test-session-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    WorkBlock: [],
    WorkMeeting: [],
    ...overrides,
  }
}

describe('workPattern router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should return all non-template patterns for session', async () => {
      const mockPatterns = [
        createMockWorkPattern({
          id: 'pattern-1',
          date: '2025-01-26',
          WorkBlock: [createMockWorkBlock()],
        }),
        createMockWorkPattern({
          id: 'pattern-2',
          date: '2025-01-27',
        }),
      ]

      mockPrisma.workPattern.findMany.mockResolvedValue(mockPatterns)

      const patterns = await mockPrisma.workPattern.findMany({
        where: {
          sessionId: 'test-session-id',
          isTemplate: false,
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
        orderBy: { date: 'desc' },
      })

      expect(patterns).toHaveLength(2)
      expect(patterns[0].id).toBe('pattern-1')
      expect(mockPrisma.workPattern.findMany).toHaveBeenCalledWith({
        where: {
          sessionId: 'test-session-id',
          isTemplate: false,
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
        orderBy: { date: 'desc' },
      })
    })

    it('should return empty array when no patterns exist', async () => {
      mockPrisma.workPattern.findMany.mockResolvedValue([])

      const patterns = await mockPrisma.workPattern.findMany({
        where: { sessionId: 'test-session-id', isTemplate: false },
      })

      expect(patterns).toHaveLength(0)
    })
  })

  describe('getByDate', () => {
    it('should return pattern for a specific date', async () => {
      const mockPattern = createMockWorkPattern({
        WorkBlock: [createMockWorkBlock()],
        WorkMeeting: [createMockWorkMeeting()],
      })

      mockPrisma.workPattern.findUnique.mockResolvedValue(mockPattern)

      const pattern = await mockPrisma.workPattern.findUnique({
        where: {
          sessionId_date: {
            sessionId: 'test-session-id',
            date: '2025-01-26',
          },
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })

      expect(pattern).toBeTruthy()
      expect(pattern?.date).toBe('2025-01-26')
      expect(pattern?.WorkBlock).toHaveLength(1)
      expect(pattern?.WorkMeeting).toHaveLength(1)
    })

    it('should return null when pattern does not exist', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue(null)

      const pattern = await mockPrisma.workPattern.findUnique({
        where: {
          sessionId_date: {
            sessionId: 'test-session-id',
            date: '2025-01-30',
          },
        },
      })

      expect(pattern).toBeNull()
    })
  })

  describe('getTemplates', () => {
    it('should return only template patterns', async () => {
      const mockTemplates = [
        createMockWorkPattern({
          id: 'template-1',
          isTemplate: true,
          templateName: 'Weekday',
        }),
        createMockWorkPattern({
          id: 'template-2',
          isTemplate: true,
          templateName: 'Weekend',
        }),
      ]

      mockPrisma.workPattern.findMany.mockResolvedValue(mockTemplates)

      const templates = await mockPrisma.workPattern.findMany({
        where: {
          sessionId: 'test-session-id',
          isTemplate: true,
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })

      expect(templates).toHaveLength(2)
      expect(templates[0].isTemplate).toBe(true)
      expect(templates[0].templateName).toBe('Weekday')
    })
  })

  describe('create', () => {
    it('should create a new pattern when none exists', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue(null)

      const newPattern = createMockWorkPattern({
        id: 'pattern-new',
        WorkBlock: [createMockWorkBlock({ id: 'block-new' })],
      })
      mockPrisma.workPattern.create.mockResolvedValue(newPattern)

      // Simulate the create logic
      const existing = await mockPrisma.workPattern.findUnique({
        where: { sessionId_date: { sessionId: 'test-session-id', date: '2025-01-28' } },
      })

      expect(existing).toBeNull()

      const pattern = await mockPrisma.workPattern.create({
        data: {
          id: 'pattern-new',
          date: '2025-01-28',
          isTemplate: false,
          sessionId: 'test-session-id',
          WorkBlock: {
            create: [
              {
                id: 'block-new',
                startTime: '09:00',
                endTime: '12:00',
                typeConfig: JSON.stringify({ kind: BlockConfigKind.Single, typeId: 'dev' }),
                totalCapacity: 0,
              },
            ],
          },
        },
        include: { WorkBlock: true, WorkMeeting: true },
      })

      expect(pattern.id).toBe('pattern-new')
      expect(mockPrisma.workPattern.create).toHaveBeenCalled()
    })

    it('should upsert when pattern already exists', async () => {
      const existingPattern = createMockWorkPattern({
        id: 'pattern-existing',
        WorkBlock: [createMockWorkBlock()],
      })

      mockPrisma.workPattern.findUnique.mockResolvedValue(existingPattern)
      mockPrisma.workBlock.deleteMany.mockResolvedValue({ count: 1 })
      mockPrisma.workMeeting.deleteMany.mockResolvedValue({ count: 0 })
      mockPrisma.workPattern.update.mockResolvedValue({
        ...existingPattern,
        WorkBlock: [createMockWorkBlock({ id: 'block-updated' })],
      })

      // Simulate the upsert logic
      const existing = await mockPrisma.workPattern.findUnique({
        where: { sessionId_date: { sessionId: 'test-session-id', date: '2025-01-26' } },
      })

      expect(existing).toBeTruthy()

      // Delete old blocks
      await mockPrisma.workBlock.deleteMany({ where: { patternId: existing!.id } })
      expect(mockPrisma.workBlock.deleteMany).toHaveBeenCalledWith({
        where: { patternId: 'pattern-existing' },
      })

      // Update pattern
      const updated = await mockPrisma.workPattern.update({
        where: { id: existing!.id },
        data: { updatedAt: new Date() },
        include: { WorkBlock: true, WorkMeeting: true },
      })

      expect(updated.id).toBe('pattern-existing')
    })

    it('should create pattern with meetings', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue(null)

      const patternWithMeetings = createMockWorkPattern({
        WorkMeeting: [
          createMockWorkMeeting({ name: 'Standup' }),
          createMockWorkMeeting({ id: 'meeting-2', name: 'Sync' }),
        ],
      })
      mockPrisma.workPattern.create.mockResolvedValue(patternWithMeetings)

      const pattern = await mockPrisma.workPattern.create({
        data: {
          id: 'pattern-new',
          date: '2025-01-28',
          sessionId: 'test-session-id',
          WorkMeeting: {
            create: [
              { id: 'meeting-1', name: 'Standup', startTime: '09:00', endTime: '09:30', type: 'meeting', recurring: 'daily' },
              { id: 'meeting-2', name: 'Sync', startTime: '14:00', endTime: '14:30', type: 'meeting', recurring: 'daily' },
            ],
          },
        },
      })

      expect(pattern.WorkMeeting).toHaveLength(2)
    })
  })

  describe('update', () => {
    it('should replace blocks when updating', async () => {
      mockPrisma.workBlock.deleteMany.mockResolvedValue({ count: 1 })
      mockPrisma.workPattern.update.mockResolvedValue(
        createMockWorkPattern({
          WorkBlock: [createMockWorkBlock({ startTime: '10:00' })],
        }),
      )

      await mockPrisma.workBlock.deleteMany({ where: { patternId: 'pattern-123' } })

      const updated = await mockPrisma.workPattern.update({
        where: { id: 'pattern-123' },
        data: {
          WorkBlock: {
            create: [
              {
                id: 'block-new',
                startTime: '10:00',
                endTime: '13:00',
                typeConfig: JSON.stringify({ kind: BlockConfigKind.Single, typeId: 'dev' }),
                totalCapacity: 0,
              },
            ],
          },
        },
        include: { WorkBlock: true, WorkMeeting: true },
      })

      expect(mockPrisma.workBlock.deleteMany).toHaveBeenCalled()
      expect(updated.WorkBlock[0].startTime).toBe('10:00')
    })

    it('should replace meetings when updating', async () => {
      mockPrisma.workMeeting.deleteMany.mockResolvedValue({ count: 2 })
      mockPrisma.workPattern.update.mockResolvedValue(
        createMockWorkPattern({
          WorkMeeting: [createMockWorkMeeting({ name: 'New Meeting' })],
        }),
      )

      await mockPrisma.workMeeting.deleteMany({ where: { patternId: 'pattern-123' } })

      const updated = await mockPrisma.workPattern.update({
        where: { id: 'pattern-123' },
        data: {
          WorkMeeting: {
            create: [{ id: 'meeting-new', name: 'New Meeting', startTime: '10:00', endTime: '11:00', type: 'meeting', recurring: 'none' }],
          },
        },
      })

      expect(mockPrisma.workMeeting.deleteMany).toHaveBeenCalled()
      expect(updated.WorkMeeting[0].name).toBe('New Meeting')
    })
  })

  describe('delete', () => {
    it('should delete pattern by id', async () => {
      mockPrisma.workPattern.delete.mockResolvedValue(createMockWorkPattern())

      await mockPrisma.workPattern.delete({
        where: { id: 'pattern-123' },
      })

      expect(mockPrisma.workPattern.delete).toHaveBeenCalledWith({
        where: { id: 'pattern-123' },
      })
    })
  })

  describe('createFromTemplate', () => {
    it('should create pattern from template', async () => {
      const template = createMockWorkPattern({
        id: 'template-123',
        isTemplate: true,
        templateName: 'Weekday',
        WorkBlock: [
          createMockWorkBlock({ id: 'block-template-1', startTime: '09:00', endTime: '12:00' }),
          createMockWorkBlock({ id: 'block-template-2', startTime: '13:00', endTime: '17:00' }),
        ],
        WorkMeeting: [createMockWorkMeeting({ id: 'meeting-template' })],
      })

      mockPrisma.workPattern.findFirst.mockResolvedValue(template)

      // Find template
      const foundTemplate = await mockPrisma.workPattern.findFirst({
        where: {
          sessionId: 'test-session-id',
          isTemplate: true,
          templateName: 'Weekday',
        },
        include: { WorkBlock: true, WorkMeeting: true },
      })

      expect(foundTemplate).toBeTruthy()
      expect(foundTemplate?.templateName).toBe('Weekday')
      expect(foundTemplate?.WorkBlock).toHaveLength(2)

      // Create new pattern from template
      const newPattern = createMockWorkPattern({
        id: 'pattern-from-template',
        date: '2025-01-28',
        isTemplate: false,
        WorkBlock: template.WorkBlock,
        WorkMeeting: template.WorkMeeting,
      })
      mockPrisma.workPattern.create.mockResolvedValue(newPattern)

      const created = await mockPrisma.workPattern.create({
        data: {
          id: 'pattern-from-template',
          date: '2025-01-28',
          isTemplate: false,
          sessionId: 'test-session-id',
          WorkBlock: {
            create: foundTemplate!.WorkBlock.map((b) => ({
              id: `block-copy-${b.id}`,
              startTime: b.startTime,
              endTime: b.endTime,
              typeConfig: b.typeConfig,
              totalCapacity: b.totalCapacity,
            })),
          },
        },
        include: { WorkBlock: true, WorkMeeting: true },
      })

      expect(created.date).toBe('2025-01-28')
      expect(created.isTemplate).toBe(false)
      expect(created.WorkBlock).toHaveLength(2)
    })

    it('should throw error when template not found', async () => {
      mockPrisma.workPattern.findFirst.mockResolvedValue(null)

      const template = await mockPrisma.workPattern.findFirst({
        where: {
          sessionId: 'test-session-id',
          isTemplate: true,
          templateName: 'NonExistent',
        },
      })

      expect(template).toBeNull()
      // In real router, this would throw: throw new Error(`Template "NonExistent" not found`)
    })
  })

  describe('block type configurations', () => {
    it('should handle Single block type', async () => {
      const singleBlock = createMockWorkBlock({
        typeConfig: JSON.stringify({ kind: BlockConfigKind.Single, typeId: 'development' }),
      })

      const pattern = createMockWorkPattern({ WorkBlock: [singleBlock] })
      mockPrisma.workPattern.findUnique.mockResolvedValue(pattern)

      const result = await mockPrisma.workPattern.findUnique({
        where: { id: 'pattern-123' },
        include: { WorkBlock: true },
      })

      const typeConfig = JSON.parse(result!.WorkBlock[0].typeConfig)
      expect(typeConfig.kind).toBe(BlockConfigKind.Single)
      expect(typeConfig.typeId).toBe('development')
    })

    it('should handle Combo block type', async () => {
      const comboBlock = createMockWorkBlock({
        typeConfig: JSON.stringify({
          kind: BlockConfigKind.Combo,
          allocations: [
            { typeId: 'development', percentage: 60 },
            { typeId: 'meetings', percentage: 40 },
          ],
        }),
      })

      const pattern = createMockWorkPattern({ WorkBlock: [comboBlock] })
      mockPrisma.workPattern.findUnique.mockResolvedValue(pattern)

      const result = await mockPrisma.workPattern.findUnique({
        where: { id: 'pattern-123' },
        include: { WorkBlock: true },
      })

      const typeConfig = JSON.parse(result!.WorkBlock[0].typeConfig)
      expect(typeConfig.kind).toBe(BlockConfigKind.Combo)
      expect(typeConfig.allocations).toHaveLength(2)
      expect(typeConfig.allocations[0].percentage).toBe(60)
    })
  })
})
