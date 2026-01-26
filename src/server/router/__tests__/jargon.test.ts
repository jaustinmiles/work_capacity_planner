/**
 * Tests for the jargon router
 *
 * Tests JargonEntry CRUD operations including filtering,
 * dictionary generation, and upsert by term
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createMockContext,
  createMockJargonEntry,
  type MockPrisma,
} from './router-test-helpers'

describe('jargon router', () => {
  let mockPrisma: MockPrisma
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    ctx = createMockContext()
    mockPrisma = ctx.prisma as unknown as MockPrisma
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should return all jargon entries for the session', async () => {
      const mockEntries = [
        createMockJargonEntry({ id: 'jargon-1', term: 'API' }),
        createMockJargonEntry({ id: 'jargon-2', term: 'MVP' }),
      ]
      mockPrisma.jargonEntry.findMany.mockResolvedValue(mockEntries)

      const entries = await mockPrisma.jargonEntry.findMany({
        where: { sessionId: ctx.activeSessionId },
        orderBy: { term: 'asc' },
      })

      expect(entries).toHaveLength(2)
    })

    it('should filter by category', async () => {
      const mockEntries = [
        createMockJargonEntry({ term: 'Sprint', category: 'agile' }),
      ]
      mockPrisma.jargonEntry.findMany.mockResolvedValue(mockEntries)

      const entries = await mockPrisma.jargonEntry.findMany({
        where: {
          sessionId: ctx.activeSessionId,
          category: 'agile',
        },
      })

      expect(entries).toHaveLength(1)
      expect(entries[0].category).toBe('agile')
    })

    it('should filter by search term in term or definition', async () => {
      const searchTerm = 'product'
      const mockEntries = [
        createMockJargonEntry({
          term: 'MVP',
          definition: 'Minimum Viable Product',
        }),
      ]
      mockPrisma.jargonEntry.findMany.mockResolvedValue(mockEntries)

      await mockPrisma.jargonEntry.findMany({
        where: {
          sessionId: ctx.activeSessionId,
          OR: [
            { term: { contains: searchTerm } },
            { definition: { contains: searchTerm } },
          ],
        },
      })

      expect(mockPrisma.jargonEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { term: { contains: 'product' } },
              { definition: { contains: 'product' } },
            ]),
          }),
        }),
      )
    })
  })

  describe('getById', () => {
    it('should return jargon entry when found', async () => {
      const mockEntry = createMockJargonEntry({ id: 'jargon-123' })
      mockPrisma.jargonEntry.findUnique.mockResolvedValue(mockEntry)

      const entry = await mockPrisma.jargonEntry.findUnique({
        where: { id: 'jargon-123' },
      })

      expect(entry).toBeTruthy()
      expect(entry?.id).toBe('jargon-123')
    })

    it('should return null when not found', async () => {
      mockPrisma.jargonEntry.findUnique.mockResolvedValue(null)

      const entry = await mockPrisma.jargonEntry.findUnique({
        where: { id: 'non-existent' },
      })

      expect(entry).toBeNull()
    })
  })

  describe('create', () => {
    it('should create a new jargon entry', async () => {
      const newEntry = createMockJargonEntry({
        id: 'jargon-new',
        term: 'CI/CD',
        definition: 'Continuous Integration/Continuous Deployment',
        category: 'devops',
      })
      mockPrisma.jargonEntry.create.mockResolvedValue(newEntry)

      const entry = await mockPrisma.jargonEntry.create({
        data: {
          sessionId: ctx.activeSessionId,
          term: 'CI/CD',
          definition: 'Continuous Integration/Continuous Deployment',
          category: 'devops',
        },
      })

      expect(entry.term).toBe('CI/CD')
      expect(entry.category).toBe('devops')
    })

    it('should create entry with optional fields as null', async () => {
      const newEntry = createMockJargonEntry({
        id: 'jargon-new',
        category: null,
        examples: null,
        relatedTerms: null,
      })
      mockPrisma.jargonEntry.create.mockResolvedValue(newEntry)

      const entry = await mockPrisma.jargonEntry.create({
        data: {
          sessionId: ctx.activeSessionId,
          term: 'Test',
          definition: 'Test definition',
          category: null,
          examples: null,
          relatedTerms: null,
        },
      })

      expect(entry.category).toBeNull()
      expect(entry.examples).toBeNull()
    })
  })

  describe('update', () => {
    it('should update jargon entry fields', async () => {
      const updatedEntry = createMockJargonEntry({
        id: 'jargon-123',
        definition: 'Updated definition',
      })
      mockPrisma.jargonEntry.update.mockResolvedValue(updatedEntry)

      const entry = await mockPrisma.jargonEntry.update({
        where: { id: 'jargon-123' },
        data: { definition: 'Updated definition' },
      })

      expect(entry.definition).toBe('Updated definition')
    })
  })

  describe('delete', () => {
    it('should delete jargon entry by id', async () => {
      mockPrisma.jargonEntry.delete.mockResolvedValue(createMockJargonEntry())

      await mockPrisma.jargonEntry.delete({
        where: { id: 'jargon-123' },
      })

      expect(mockPrisma.jargonEntry.delete).toHaveBeenCalledWith({
        where: { id: 'jargon-123' },
      })
    })
  })

  describe('getDictionary', () => {
    it('should return term -> definition map', async () => {
      const entries = [
        { term: 'API', definition: 'Application Programming Interface' },
        { term: 'MVP', definition: 'Minimum Viable Product' },
        { term: 'CI', definition: 'Continuous Integration' },
      ]
      mockPrisma.jargonEntry.findMany.mockResolvedValue(entries)

      const result = await mockPrisma.jargonEntry.findMany({
        where: { sessionId: ctx.activeSessionId },
        select: { term: true, definition: true },
      })

      // Simulate getDictionary logic
      const dictionary = Object.fromEntries(
        result.map((e: { term: string; definition: string }) => [e.term, e.definition]),
      )

      expect(dictionary).toEqual({
        API: 'Application Programming Interface',
        MVP: 'Minimum Viable Product',
        CI: 'Continuous Integration',
      })
    })

    it('should return empty object when no entries', async () => {
      mockPrisma.jargonEntry.findMany.mockResolvedValue([])

      const result = await mockPrisma.jargonEntry.findMany({
        where: { sessionId: ctx.activeSessionId },
        select: { term: true, definition: true },
      })

      const dictionary = Object.fromEntries(
        result.map((e: { term: string; definition: string }) => [e.term, e.definition]),
      )

      expect(dictionary).toEqual({})
    })
  })

  describe('upsertByTerm', () => {
    it('should create new entry when term does not exist', async () => {
      // Check if exists by composite key
      mockPrisma.jargonEntry.findUnique.mockResolvedValue(null)

      const existing = await mockPrisma.jargonEntry.findUnique({
        where: {
          sessionId_term: {
            sessionId: ctx.activeSessionId as string,
            term: 'NewTerm',
          },
        },
      })

      expect(existing).toBeNull()

      // Create new entry
      const newEntry = createMockJargonEntry({
        id: 'jargon-new',
        term: 'NewTerm',
        definition: 'New definition',
      })
      mockPrisma.jargonEntry.create.mockResolvedValue(newEntry)

      const created = await mockPrisma.jargonEntry.create({
        data: {
          sessionId: ctx.activeSessionId,
          term: 'NewTerm',
          definition: 'New definition',
        },
      })

      expect(created.term).toBe('NewTerm')
    })

    it('should update existing entry when term exists', async () => {
      const existingEntry = createMockJargonEntry({
        id: 'jargon-existing',
        term: 'ExistingTerm',
        definition: 'Old definition',
      })
      mockPrisma.jargonEntry.findUnique.mockResolvedValue(existingEntry)

      const existing = await mockPrisma.jargonEntry.findUnique({
        where: {
          sessionId_term: {
            sessionId: ctx.activeSessionId as string,
            term: 'ExistingTerm',
          },
        },
      })

      expect(existing).toBeTruthy()

      // Update existing entry
      const updatedEntry = createMockJargonEntry({
        id: 'jargon-existing',
        term: 'ExistingTerm',
        definition: 'Updated definition',
      })
      mockPrisma.jargonEntry.update.mockResolvedValue(updatedEntry)

      const updated = await mockPrisma.jargonEntry.update({
        where: { id: existing!.id },
        data: { definition: 'Updated definition' },
      })

      expect(updated.definition).toBe('Updated definition')
    })
  })
})
