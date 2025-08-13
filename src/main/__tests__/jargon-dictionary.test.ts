import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseService } from '../database'

// Mock Prisma client
const mockPrismaClient = {
  jargonEntry: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  session: {
    findFirst: vi.fn(() => Promise.resolve({ id: 'test-session' })),
  },
}

describe('Jargon Dictionary', () => {
  let db: DatabaseService

  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-ignore - Mock for testing
    db = new DatabaseService()
    // @ts-ignore - Replace client with mock
    db.client = mockPrismaClient
  })

  describe('getJargonDictionary', () => {
    it('should return a key-value dictionary from jargon entries', async () => {
      const mockEntries = [
        { id: '1', term: 'CI/CD', definition: 'Continuous Integration/Continuous Deployment' },
        { id: '2', term: 'PR', definition: 'Pull Request' },
        { id: '3', term: 'K8s', definition: '' },
      ]
      
      mockPrismaClient.jargonEntry.findMany.mockResolvedValue(mockEntries)
      
      const result = await db.getJargonDictionary()
      
      expect(result).toEqual({
        'CI/CD': 'Continuous Integration/Continuous Deployment',
        'PR': 'Pull Request',
        'K8s': '',
      })
    })

    it('should handle empty jargon entries', async () => {
      mockPrismaClient.jargonEntry.findMany.mockResolvedValue([])
      
      const result = await db.getJargonDictionary()
      
      expect(result).toEqual({})
    })
  })

  describe('updateJargonDefinition', () => {
    it('should update existing jargon entry', async () => {
      const existingEntry = { 
        id: 'entry-1', 
        term: 'API', 
        definition: 'Old definition',
        sessionId: 'test-session'
      }
      
      mockPrismaClient.jargonEntry.findFirst.mockResolvedValue(existingEntry)
      mockPrismaClient.jargonEntry.update.mockResolvedValue({
        ...existingEntry,
        definition: 'Application Programming Interface'
      })
      
      await db.updateJargonDefinition('API', 'Application Programming Interface')
      
      expect(mockPrismaClient.jargonEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          definition: 'Application Programming Interface',
        })
      })
    })

    it('should create new entry if term does not exist', async () => {
      mockPrismaClient.jargonEntry.findFirst.mockResolvedValue(null)
      
      await db.updateJargonDefinition('REST', 'Representational State Transfer')
      
      expect(mockPrismaClient.jargonEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          term: 'REST',
          definition: 'Representational State Transfer',
          category: 'custom',
        })
      })
    })
  })
})