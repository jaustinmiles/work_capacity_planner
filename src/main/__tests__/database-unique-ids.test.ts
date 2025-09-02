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

  beforeEach(async () => {
    vi.clearAllMocks()
    uuidIndex = 0 // Reset UUID index

    const prismaModule = await import('@prisma/client') as any
    mockTaskCreate = prismaModule.__mocks.mockTaskCreate
    mockTaskStepCreateMany = prismaModule.__mocks.mockTaskStepCreateMany
    mockTaskFindUnique = prismaModule.__mocks.mockTaskFindUnique
    mockSessionFindFirst = prismaModule.__mocks.mockSessionFindFirst

    // Mock session for active session
    mockSessionFindFirst.mockResolvedValue({ id: 'test-session' })

    // DatabaseService is a singleton, get instance
    db = DatabaseService.getInstance()
  })

  it('should preserve step IDs provided from frontend', async () => {
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

    // Verify that createMany was called with the provided IDs (new behavior)
    expect(mockTaskStepCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'ai-step-1', // Should preserve the provided ID
          name: 'Step 1',
        }),
        expect.objectContaining({
          id: 'ai-step-2', // Should preserve the provided ID
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

    // Verify that createMany was called with the same IDs for the second workflow
    expect(mockTaskStepCreateMany).toHaveBeenLastCalledWith({
      data: [
        expect.objectContaining({
          id: 'ai-step-1', // Same ID as input
          name: 'Step 1',
        }),
        expect.objectContaining({
          id: 'ai-step-2', // Same ID as input
          name: 'Step 2',
        }),
      ],
    })

    // Both calls should use the same IDs since we're using the same step data
    const firstCallIds = mockTaskStepCreateMany.mock.calls[0][0].data.map((s: any) => s.id)
    const secondCallIds = mockTaskStepCreateMany.mock.calls[1][0].data.map((s: any) => s.id)

    // The IDs should be the same across both calls since we're using the same input
    expect(firstCallIds).toEqual(['ai-step-1', 'ai-step-2'])
    expect(secondCallIds).toEqual(['ai-step-1', 'ai-step-2'])
  })
})
