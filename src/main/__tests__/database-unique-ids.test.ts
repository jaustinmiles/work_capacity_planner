import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DatabaseService } from '../database'

// Mock crypto.randomUUID
const mockUUIDs = [
  'uuid-task-1',
  'uuid-step-1-1', 
  'uuid-step-1-2',
  'uuid-task-2',
  'uuid-step-2-1',
  'uuid-step-2-2',
]
let uuidIndex = 0

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => mockUUIDs[uuidIndex++]),
}))

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const mockTaskCreate = vi.fn()
  const mockTaskStepCreateMany = vi.fn()
  const mockTaskFindUnique = vi.fn()
  const mockSessionFindFirst = vi.fn()
  const mockSessionCreate = vi.fn()

  return {
    PrismaClient: vi.fn(() => ({
      task: {
        create: mockTaskCreate,
        findUnique: mockTaskFindUnique,
      },
      taskStep: {
        createMany: mockTaskStepCreateMany,
      },
      session: {
        findFirst: mockSessionFindFirst,
        create: mockSessionCreate,
      },
    })),
    __mocks: {
      mockTaskCreate,
      mockTaskStepCreateMany,
      mockTaskFindUnique,
      mockSessionFindFirst,
      mockSessionCreate,
    },
  }
})

describe('Database - Unique ID Generation', () => {
  let db: DatabaseService
  let mockTaskCreate: any
  let mockTaskStepCreateMany: any
  let mockTaskFindUnique: any
  let mockSessionFindFirst: any
  let mockSessionCreate: any

  beforeEach(async () => {
    vi.clearAllMocks()
    uuidIndex = 0 // Reset UUID index
    
    const prismaModule = await import('@prisma/client') as any
    mockTaskCreate = prismaModule.__mocks.mockTaskCreate
    mockTaskStepCreateMany = prismaModule.__mocks.mockTaskStepCreateMany
    mockTaskFindUnique = prismaModule.__mocks.mockTaskFindUnique
    mockSessionFindFirst = prismaModule.__mocks.mockSessionFindFirst
    mockSessionCreate = prismaModule.__mocks.mockSessionCreate
    
    // Mock session for active session
    mockSessionFindFirst.mockResolvedValue({ id: 'test-session' })
    
    // DatabaseService is a singleton, get instance
    db = DatabaseService.getInstance()
  })

  it('should generate unique IDs for steps even when same step data is used', async () => {
    // Setup mock responses
    mockTaskCreate.mockResolvedValueOnce({ id: 'uuid-task-1' })
    mockTaskStepCreateMany.mockResolvedValueOnce({})
    mockTaskFindUnique.mockResolvedValueOnce({
      id: 'uuid-task-1',
      name: 'Test Workflow 1',
      TaskStep: [],
    })

    // Create workflow with steps that have IDs (simulating AI-generated data)
    const stepData = [
      { id: 'ai-step-1', name: 'Step 1', duration: 30, type: 'focused' },
      { id: 'ai-step-2', name: 'Step 2', duration: 45, type: 'admin' },
    ]

    await db.createTask({
      name: 'Test Workflow 1',
      duration: 75,
      hasSteps: true,
      steps: stepData,
    })

    // Verify that createMany was called with new UUIDs, not the provided IDs
    expect(mockTaskStepCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'uuid-step-1-1', // New UUID, not 'ai-step-1'
          name: 'Step 1',
        }),
        expect.objectContaining({
          id: 'uuid-step-1-2', // New UUID, not 'ai-step-2'
          name: 'Step 2',
        }),
      ],
    })

    // Reset mocks for second workflow
    mockTaskCreate.mockResolvedValueOnce({ id: 'uuid-task-2' })
    mockTaskStepCreateMany.mockResolvedValueOnce({})
    mockTaskFindUnique.mockResolvedValueOnce({
      id: 'uuid-task-2',
      name: 'Test Workflow 2',
      TaskStep: [],
    })

    // Create another workflow with the same step data (simulating duplicate creation)
    await db.createTask({
      name: 'Test Workflow 2',
      duration: 75,
      hasSteps: true,
      steps: stepData, // Same step data with same IDs
    })

    // Verify that createMany was called with different UUIDs for the second workflow
    expect(mockTaskStepCreateMany).toHaveBeenLastCalledWith({
      data: [
        expect.objectContaining({
          id: 'uuid-step-2-1', // Different UUID from first workflow
          name: 'Step 1',
        }),
        expect.objectContaining({
          id: 'uuid-step-2-2', // Different UUID from first workflow
          name: 'Step 2',
        }),
      ],
    })

    // Ensure no duplicate IDs were used
    const firstCallIds = mockTaskStepCreateMany.mock.calls[0][0].data.map((s: any) => s.id)
    const secondCallIds = mockTaskStepCreateMany.mock.calls[1][0].data.map((s: any) => s.id)
    
    const allIds = [...firstCallIds, ...secondCallIds]
    const uniqueIds = new Set(allIds)
    
    expect(uniqueIds.size).toBe(allIds.length) // All IDs should be unique
  })
})