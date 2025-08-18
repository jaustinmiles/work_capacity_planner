import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AmendmentParser } from '../amendment-parser'
import { AmendmentContext, AmendmentType } from '../amendment-types'

// Mock Anthropic
vi.mock('@anthropic-ai/sdk')

// Mock the getAIService to reset singleton
vi.mock('../ai-service', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    getAIService: vi.fn(),
  }
})

describe('AmendmentParser - Dependency Handling', () => {
  let parser: AmendmentParser
  let context: AmendmentContext
  let mockAnthropicClient: any

  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks()

    // Mock Anthropic client
    mockAnthropicClient = {
      messages: {
        create: vi.fn(),
      },
    }

    // Mock getAIService to return our mocked client
    const { getAIService } = await import('../ai-service')
    vi.mocked(getAIService).mockReturnValue({
      anthropic: mockAnthropicClient,
    } as any)

    // Set API key environment variable
    process.env.ANTHROPIC_API_KEY = 'test-api-key'

    // Use real AI for integration testing
    parser = new AmendmentParser({ useAI: true })

    context = {
      recentTasks: [
        { id: 'task-1', name: 'Implement Safety Certification' },
        { id: 'task-2', name: 'Package Egomotion Timestamps' },
        { id: 'task-3', name: 'Run Safety Workflow' },
        { id: 'task-4', name: 'Deploy to Production' },
      ],
      recentWorkflows: [
        { id: 'workflow-1', name: 'Safety Certification Task (Monday Deadline)' },
        { id: 'workflow-2', name: 'Deployment Pipeline' },
      ],
      currentView: 'workflows',
      jobContexts: [{
        role: 'Software Engineer',
        context: 'Working on autonomous vehicle safety systems',
        jargonDictionary: {
          'Egomotion': 'Vehicle self-motion estimation from sensors',
          'Safety Certification': 'Process to verify system meets safety standards',
        },
      }],
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Dependency Creation', () => {
    it('should create a dependency when a task is blocked by another', async () => {
      const transcription = 'The Safety Workflow is blocked by Package Egomotion Timestamps'

      // Mock AI response for dependency creation
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [{
              type: 'dependency_change',
              target: {
                type: 'workflow',
                id: 'workflow-1',
                name: 'Safety Certification Task (Monday Deadline)',
                confidence: 0.9,
              },
              addDependencies: ['task-2'],
            }],
            confidence: 0.85,
            warnings: [],
            needsClarification: [],
          }),
        }],
      })

      const result = await parser.parseTranscription(transcription, context)

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments[0].type).toBe(AmendmentType.DependencyChange)

      const amendment = result.amendments[0] as any
      expect(amendment.target.name).toContain('Safety')
      expect(amendment.addDependencies).toContain('task-2')
    })

    it('should handle "waiting on" as a dependency creation', async () => {
      const transcription = 'Deploy to Production is waiting on the Safety Certification Task workflow'

      // Mock AI response
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [{
              type: 'dependency_change',
              target: {
                type: 'task',
                id: 'task-4',
                name: 'Deploy to Production',
                confidence: 0.9,
              },
              addDependencies: ['workflow-1'],
            }],
            confidence: 0.85,
            warnings: [],
            needsClarification: [],
          }),
        }],
      })

      const result = await parser.parseTranscription(transcription, context)

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments[0].type).toBe(AmendmentType.DependencyChange)

      const amendment = result.amendments[0] as any
      expect(amendment.target.name).toContain('Deploy')
      expect(amendment.addDependencies).toContain('workflow-1')
    })

    it('should create a new blocker task when mentioned', async () => {
      const transcription = 'I need to fix the timestamp packaging issue before I can run the Safety Workflow'

      // Mock AI response with both task creation and dependency
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [
              {
                type: 'task_creation',
                name: 'Fix timestamp packaging issue',
                duration: 120,
                description: 'Fix the issue with timestamp file sizes being too large',
                importance: 8,
                urgency: 9,
                taskType: 'focused',
              },
              {
                type: 'dependency_change',
                target: {
                  type: 'workflow',
                  id: 'workflow-1',
                  name: 'Safety Certification Task (Monday Deadline)',
                  confidence: 0.9,
                },
                addDependencies: ['task-new-1'],
              },
            ],
            confidence: 0.85,
            warnings: [],
            needsClarification: [],
          }),
        }],
      })

      const result = await parser.parseTranscription(transcription, context)

      // Should create a new task AND add it as a dependency
      expect(result.amendments.length).toBeGreaterThanOrEqual(2)

      const taskCreation = result.amendments.find(a => a.type === AmendmentType.TaskCreation)
      const dependencyChange = result.amendments.find(a => a.type === AmendmentType.DependencyChange)

      expect(taskCreation).toBeDefined()
      expect(dependencyChange).toBeDefined()

      if (taskCreation) {
        expect((taskCreation as any).name).toContain('timestamp')
      }

      if (dependencyChange) {
        expect((dependencyChange as any).target.name).toContain('Safety')
      }
    })

    it('should understand "can\'t do X until Y" pattern', async () => {
      const transcription = "I can't deploy to production until the safety certification is complete"

      // Mock AI response
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [{
              type: 'dependency_change',
              target: {
                type: 'task',
                id: 'task-4',
                name: 'Deploy to Production',
                confidence: 0.9,
              },
              addDependencies: ['workflow-1'],
            }],
            confidence: 0.85,
            warnings: [],
            needsClarification: [],
          }),
        }],
      })

      const result = await parser.parseTranscription(transcription, context)

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments[0].type).toBe(AmendmentType.DependencyChange)

      const amendment = result.amendments[0] as any
      expect(amendment.target.name).toContain('Deploy')
      expect(amendment.addDependencies.length).toBeGreaterThan(0)
    })

    it('should handle removing dependencies', async () => {
      const transcription = 'Deploy to Production no longer depends on the Safety Certification'

      // Mock AI response for removing dependencies
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [{
              type: 'dependency_change',
              target: {
                type: 'task',
                id: 'task-4',
                name: 'Deploy to Production',
                confidence: 0.9,
              },
              removeDependencies: ['workflow-1'],
            }],
            confidence: 0.85,
            warnings: [],
            needsClarification: [],
          }),
        }],
      })

      const result = await parser.parseTranscription(transcription, context)

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments[0].type).toBe(AmendmentType.DependencyChange)

      const amendment = result.amendments[0] as any
      expect(amendment.target.name).toContain('Deploy')
      expect(amendment.removeDependencies).toContain('workflow-1')
    })
  })

  describe('Complex Dependency Scenarios', () => {
    it('should handle the timestamp file size issue scenario', async () => {
      const transcription = `On my Safety Certification workflow, I realized that my changes 
        to the timestamps caused the files to be too big, so I need to figure out a 
        different way to package those timestamps before I can run the workflow`

      // Mock AI response for complex scenario
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [
              {
                type: 'task_creation',
                name: 'Figure out different way to package timestamps',
                duration: 180,
                description: 'Find alternative approach to package timestamps to reduce file size',
                importance: 8,
                urgency: 9,
                taskType: 'focused',
              },
              {
                type: 'dependency_change',
                target: {
                  type: 'workflow',
                  id: 'workflow-1',
                  name: 'Safety Certification Task (Monday Deadline)',
                  confidence: 0.9,
                },
                addDependencies: ['task-new-1'],
              },
            ],
            confidence: 0.85,
            warnings: [],
            needsClarification: [],
          }),
        }],
      })

      const result = await parser.parseTranscription(transcription, context)

      // Should either:
      // 1. Create a new task for fixing timestamps and add as dependency
      // 2. Add existing timestamp task as a dependency
      // 3. At minimum, recognize this is a blocking relationship

      expect(result.amendments.length).toBeGreaterThan(0)

      const hasRelevantAmendment = result.amendments.some(a =>
        a.type === AmendmentType.DependencyChange ||
        a.type === AmendmentType.TaskCreation ||
        (a.type === AmendmentType.StatusUpdate && (a as any).newStatus === 'waiting'),
      )

      expect(hasRelevantAmendment).toBe(true)
    })

    it('should create both tasks when discovering a new blocker', async () => {
      const transcription = 'I discovered we need security review approval before deploying, that will take about 2 days'

      // Mock AI response for creating approval task with duration
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [
              {
                type: 'task_creation',
                name: 'Security review approval',
                duration: 2880, // 2 days in minutes
                description: 'Get security review approval before deployment',
                importance: 9,
                urgency: 8,
                taskType: 'admin',
              },
              {
                type: 'dependency_change',
                target: {
                  type: 'task',
                  id: 'task-4',
                  name: 'Deploy to Production',
                  confidence: 0.9,
                },
                addDependencies: ['task-new-1'],
              },
            ],
            confidence: 0.85,
            warnings: [],
            needsClarification: [],
          }),
        }],
      })

      const result = await parser.parseTranscription(transcription, context)

      // Should create a security review task and add it as a dependency to deployment
      const taskCreation = result.amendments.find(a => a.type === AmendmentType.TaskCreation)
      const dependencyChange = result.amendments.find(a => a.type === AmendmentType.DependencyChange)

      expect(taskCreation).toBeDefined()
      if (taskCreation) {
        const task = taskCreation as any
        expect(task.name.toLowerCase()).toContain('security')
        expect(task.duration).toBeGreaterThan(0) // Should parse "2 days" to minutes
      }

      expect(dependencyChange).toBeDefined()
      if (dependencyChange) {
        const dep = dependencyChange as any
        expect(dep.target.name).toContain('Deploy')
      }
    })
  })

  describe('Workflow Step Dependencies', () => {
    it('should handle step-level dependency changes', async () => {
      context.recentWorkflows[0] = {
        id: 'workflow-1',
        name: 'Safety Certification Task (Monday Deadline)',
      }

      const transcription = 'The testing step in the Safety workflow needs to wait for the timestamp fix'

      // Mock AI response for step-level dependency
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [{
              type: 'dependency_change',
              target: {
                type: 'workflow',
                id: 'workflow-1',
                name: 'Safety Certification Task (Monday Deadline)',
                confidence: 0.9,
              },
              stepName: 'testing',
              addDependencies: ['task-2'],
            }],
            confidence: 0.85,
            warnings: [],
            needsClarification: [],
          }),
        }],
      })

      const result = await parser.parseTranscription(transcription, context)

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments[0].type).toBe(AmendmentType.DependencyChange)

      const amendment = result.amendments[0] as any
      expect(amendment.workflowTarget || amendment.target).toBeDefined()
      expect(amendment.stepName).toBe('testing')
    })
  })
})
