/**
 * Integration tests for the workPattern router
 *
 * These tests use createCaller to actually invoke router procedures,
 * providing real code coverage on the router logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createIntegrationMockPrisma,
  createSessionTestCaller,
  type IntegrationMockPrisma,
} from './integration-test-helpers'
import { BlockConfigKind } from '@shared/enums'

describe('workPattern router integration', () => {
  let mockPrisma: IntegrationMockPrisma
  let caller: ReturnType<typeof createSessionTestCaller>['caller']

  beforeEach(() => {
    mockPrisma = createIntegrationMockPrisma()
    const setup = createSessionTestCaller(mockPrisma)
    caller = setup.caller
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should return all non-template patterns', async () => {
      const mockPatterns = [
        {
          id: 'pattern-1',
          date: '2025-01-26',
          isTemplate: false,
          templateName: null,
          sessionId: 'test-session-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          WorkBlock: [],
          WorkMeeting: [],
        },
      ]
      mockPrisma.workPattern.findMany.mockResolvedValue(mockPatterns)

      const result = await caller.workPattern.getAll()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('pattern-1')
      expect(mockPrisma.workPattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isTemplate: false,
          }),
        }),
      )
    })

    it('should return empty array when no patterns exist', async () => {
      mockPrisma.workPattern.findMany.mockResolvedValue([])

      const result = await caller.workPattern.getAll()

      expect(result).toHaveLength(0)
    })
  })

  describe('getByDate', () => {
    it('should return pattern for specific date', async () => {
      const mockPattern = {
        id: 'pattern-123',
        date: '2025-01-26',
        isTemplate: false,
        templateName: null,
        sessionId: 'test-session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        WorkBlock: [
          {
            id: 'block-1',
            patternId: 'pattern-123',
            startTime: '09:00',
            endTime: '12:00',
            typeConfig: JSON.stringify({ kind: BlockConfigKind.Single, typeId: 'dev' }),
            totalCapacity: 180,
          },
        ],
        WorkMeeting: [],
      }
      mockPrisma.workPattern.findUnique.mockResolvedValue(mockPattern)

      const result = await caller.workPattern.getByDate({ date: '2025-01-26' })

      expect(result).toBeTruthy()
      expect(result?.date).toBe('2025-01-26')
      expect(result?.blocks).toHaveLength(1)
    })

    it('should return null when pattern not found', async () => {
      mockPrisma.workPattern.findUnique.mockResolvedValue(null)

      const result = await caller.workPattern.getByDate({ date: '2025-01-30' })

      expect(result).toBeNull()
    })
  })

  describe('getTemplates', () => {
    it('should return only template patterns', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          date: '2025-01-01',
          isTemplate: true,
          templateName: 'Weekday',
          sessionId: 'test-session-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          WorkBlock: [],
          WorkMeeting: [],
        },
      ]
      mockPrisma.workPattern.findMany.mockResolvedValue(mockTemplates)

      const result = await caller.workPattern.getTemplates()

      expect(result).toHaveLength(1)
      expect(result[0].isTemplate).toBe(true)
      expect(result[0].templateName).toBe('Weekday')
    })
  })

  describe('create', () => {
    it('should create new pattern when none exists', async () => {
      // Mock transaction - findUnique returns null (no existing pattern)
      const mockTx = createIntegrationMockPrisma()
      mockTx.workPattern.findUnique.mockResolvedValue(null)
      mockTx.workPattern.create.mockResolvedValue({
        id: 'pattern-new',
        date: '2025-01-28',
        isTemplate: false,
        templateName: null,
        sessionId: 'test-session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        WorkBlock: [],
        WorkMeeting: [],
      })

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockTx)
        }
        return Promise.all(callback)
      })

      const result = await caller.workPattern.create({
        date: '2025-01-28',
        blocks: [
          {
            startTime: '09:00',
            endTime: '12:00',
            typeConfig: { kind: BlockConfigKind.Single, typeId: 'dev' },
          },
        ],
      })

      expect(result.date).toBe('2025-01-28')
      expect(mockTx.workPattern.create).toHaveBeenCalled()
    })

    it('should upsert when pattern already exists', async () => {
      // Mock transaction - findUnique returns existing pattern
      const mockTx = createIntegrationMockPrisma()
      mockTx.workPattern.findUnique.mockResolvedValue({
        id: 'pattern-existing',
        date: '2025-01-26',
        sessionId: 'test-session-id',
      })
      mockTx.workBlock.deleteMany.mockResolvedValue({ count: 1 })
      mockTx.workMeeting.deleteMany.mockResolvedValue({ count: 0 })
      mockTx.workPattern.update.mockResolvedValue({
        id: 'pattern-existing',
        date: '2025-01-26',
        isTemplate: false,
        templateName: null,
        sessionId: 'test-session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        WorkBlock: [],
        WorkMeeting: [],
      })

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockTx)
        }
        return Promise.all(callback)
      })

      const result = await caller.workPattern.create({
        date: '2025-01-26',
        blocks: [
          {
            startTime: '10:00',
            endTime: '14:00',
            typeConfig: { kind: BlockConfigKind.Single, typeId: 'meetings' },
          },
        ],
      })

      expect(result.id).toBe('pattern-existing')
      expect(mockTx.workBlock.deleteMany).toHaveBeenCalled()
      expect(mockTx.workPattern.update).toHaveBeenCalled()
    })

    it('should create template pattern', async () => {
      const mockTx = createIntegrationMockPrisma()
      mockTx.workPattern.findUnique.mockResolvedValue(null)
      mockTx.workPattern.create.mockResolvedValue({
        id: 'template-new',
        date: '2025-01-01',
        isTemplate: true,
        templateName: 'My Template',
        sessionId: 'test-session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        WorkBlock: [],
        WorkMeeting: [],
      })

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockTx)
        }
        return Promise.all(callback)
      })

      const result = await caller.workPattern.create({
        date: '2025-01-01',
        isTemplate: true,
        templateName: 'My Template',
      })

      expect(result.isTemplate).toBe(true)
      expect(result.templateName).toBe('My Template')
    })
  })

  describe('update', () => {
    it('should update pattern blocks', async () => {
      const mockTx = createIntegrationMockPrisma()
      mockTx.workBlock.deleteMany.mockResolvedValue({ count: 1 })
      mockTx.workPattern.update.mockResolvedValue({
        id: 'pattern-123',
        date: '2025-01-26',
        isTemplate: false,
        templateName: null,
        sessionId: 'test-session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        WorkBlock: [
          {
            id: 'block-new',
            patternId: 'pattern-123',
            startTime: '10:00',
            endTime: '14:00',
            typeConfig: JSON.stringify({ kind: BlockConfigKind.Single, typeId: 'dev' }),
            totalCapacity: 240,
          },
        ],
        WorkMeeting: [],
      })

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockTx)
        }
        return Promise.all(callback)
      })

      const result = await caller.workPattern.update({
        id: 'pattern-123',
        blocks: [
          {
            startTime: '10:00',
            endTime: '14:00',
            typeConfig: { kind: BlockConfigKind.Single, typeId: 'dev' },
          },
        ],
      })

      expect(result.blocks).toHaveLength(1)
      expect(result.blocks[0].startTime).toBe('10:00')
    })

    it('should update pattern meetings', async () => {
      const mockTx = createIntegrationMockPrisma()
      mockTx.workMeeting.deleteMany.mockResolvedValue({ count: 1 })
      mockTx.workPattern.update.mockResolvedValue({
        id: 'pattern-123',
        date: '2025-01-26',
        isTemplate: false,
        templateName: null,
        sessionId: 'test-session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        WorkBlock: [],
        WorkMeeting: [
          {
            id: 'meeting-new',
            patternId: 'pattern-123',
            name: 'Team Sync',
            startTime: '14:00',
            endTime: '15:00',
            type: 'meeting',
            recurring: 'weekly',
            daysOfWeek: null,
          },
        ],
      })

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(mockTx)
        }
        return Promise.all(callback)
      })

      const result = await caller.workPattern.update({
        id: 'pattern-123',
        meetings: [
          {
            name: 'Team Sync',
            startTime: '14:00',
            endTime: '15:00',
            type: 'meeting',
            recurring: 'weekly',
          },
        ],
      })

      expect(result.meetings).toHaveLength(1)
      expect(result.meetings[0].name).toBe('Team Sync')
    })
  })

  describe('delete', () => {
    it('should delete pattern by id', async () => {
      mockPrisma.workPattern.delete.mockResolvedValue({
        id: 'pattern-123',
      })

      const result = await caller.workPattern.delete({ id: 'pattern-123' })

      expect(result.success).toBe(true)
      expect(mockPrisma.workPattern.delete).toHaveBeenCalledWith({
        where: { id: 'pattern-123' },
      })
    })
  })

  describe('createFromTemplate', () => {
    it('should create pattern from template', async () => {
      const template = {
        id: 'template-123',
        date: '2025-01-01',
        isTemplate: true,
        templateName: 'Weekday',
        sessionId: 'test-session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        WorkBlock: [
          {
            id: 'block-template',
            patternId: 'template-123',
            startTime: '09:00',
            endTime: '17:00',
            typeConfig: JSON.stringify({ kind: BlockConfigKind.Single, typeId: 'dev' }),
            totalCapacity: 480,
          },
        ],
        WorkMeeting: [],
      }

      mockPrisma.workPattern.findFirst.mockResolvedValue(template)
      mockPrisma.workPattern.create.mockResolvedValue({
        id: 'pattern-from-template',
        date: '2025-01-28',
        isTemplate: false,
        templateName: null,
        sessionId: 'test-session-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        WorkBlock: template.WorkBlock,
        WorkMeeting: [],
      })

      const result = await caller.workPattern.createFromTemplate({
        date: '2025-01-28',
        templateName: 'Weekday',
      })

      expect(result.date).toBe('2025-01-28')
      expect(result.isTemplate).toBe(false)
      expect(result.blocks).toHaveLength(1)
    })

    it('should throw error when template not found', async () => {
      mockPrisma.workPattern.findFirst.mockResolvedValue(null)

      await expect(
        caller.workPattern.createFromTemplate({
          date: '2025-01-28',
          templateName: 'NonExistent',
        }),
      ).rejects.toThrow('Template "NonExistent" not found')
    })
  })
})
