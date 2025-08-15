import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AmendmentParser } from '../amendment-parser'
import { AmendmentContext, AmendmentType, EntityType, TaskStatus } from '../amendment-types'

// Mock the AI service
const mockCreate = vi.fn()
vi.mock('../ai-service', () => ({
  getAIService: vi.fn(() => ({
    anthropic: {
      messages: {
        create: mockCreate,
      },
    },
  })),
}))

describe('AmendmentParser - Edge Cases and Regressions', () => {
  let aiParser: AmendmentParser
  let context: AmendmentContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockClear()
    
    aiParser = new AmendmentParser({ useAI: true })
    
    context = {
      recentTasks: [
        { id: 'task-1', name: 'API Implementation' },
      ],
      recentWorkflows: [
        { id: 'wf-1', name: 'Safety Documentation Sprint' },
        { id: 'wf-2', name: 'Deployment Workflow' },
      ],
      currentView: 'workflows',
    }
  })

  describe('Step Addition Parsing', () => {
    it('should correctly parse step_addition with stepType not type', async () => {
      // This tests the issue where Claude was returning type: "focused" instead of stepType
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [{
              type: 'step_addition',
              workflowTarget: {
                type: 'workflow',
                id: 'wf-1',
                name: 'Safety Documentation Sprint',
                confidence: 0.95
              },
              stepName: 'Adjust timestamps',
              duration: 60,
              stepType: 'focused', // CORRECT: stepType not type
              afterStep: 'Previous Step'
            }],
            confidence: 0.9,
            warnings: [],
            needsClarification: []
          })
        }]
      })

      const result = await aiParser.parseTranscription(
        'Add a step to adjust timestamps after the previous step',
        context
      )

      expect(result.amendments).toHaveLength(1)
      const amendment = result.amendments[0]
      expect(amendment.type).toBe(AmendmentType.StepAddition)
      expect((amendment as any).stepType).toBe('focused')
      expect((amendment as any).stepName).toBe('Adjust timestamps')
    })

    it('should handle Claude returning conflicting type fields', async () => {
      // Test that we handle malformed JSON where type appears twice
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: `{
            "amendments": [{
              "type": "step_addition",
              "workflowTarget": {
                "type": "workflow",
                "id": "wf-1",
                "name": "Safety Documentation Sprint",
                "confidence": 0.95
              },
              "stepName": "Code Review",
              "duration": 45,
              "stepType": "focused"
            }],
            "confidence": 0.9,
            "warnings": [],
            "needsClarification": []
          }`
        }]
      })

      const result = await aiParser.parseTranscription(
        'Add a code review step',
        context
      )

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments[0].type).toBe(AmendmentType.StepAddition)
    })

    it('should parse multiple step additions from complex workflow description', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [
              {
                type: 'step_addition',
                workflowTarget: {
                  type: 'workflow',
                  id: 'wf-1',
                  name: 'Safety Documentation Sprint',
                  confidence: 0.95
                },
                stepName: 'Adjust timestamps for remaining chunks',
                duration: 60,
                stepType: 'focused'
              },
              {
                type: 'step_addition',
                workflowTarget: {
                  type: 'workflow',
                  id: 'wf-1',
                  name: 'Safety Documentation Sprint',
                  confidence: 0.95
                },
                stepName: 'Submit full workflow',
                duration: 30,
                stepType: 'admin',
                afterStep: 'Adjust timestamps for remaining chunks'
              },
              {
                type: 'step_addition',
                workflowTarget: {
                  type: 'workflow',
                  id: 'wf-1',
                  name: 'Safety Documentation Sprint',
                  confidence: 0.95
                },
                stepName: 'Wait for workflow processing',
                duration: 1440,
                stepType: 'admin',
                afterStep: 'Submit full workflow'
              }
            ],
            confidence: 0.9,
            warnings: [],
            needsClarification: []
          })
        }]
      })

      const result = await aiParser.parseTranscription(
        'After adjusting timestamps, I need to submit the workflow which takes 24 hours',
        context
      )

      expect(result.amendments).toHaveLength(3)
      expect(result.amendments.every(a => a.type === AmendmentType.StepAddition)).toBe(true)
      
      const stepNames = result.amendments.map((a: any) => a.stepName)
      expect(stepNames).toContain('Adjust timestamps for remaining chunks')
      expect(stepNames).toContain('Submit full workflow')
      expect(stepNames).toContain('Wait for workflow processing')
    })
  })

  describe('JSON Extraction from Claude Response', () => {
    it('should handle response wrapped in markdown code blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '```json\n' + JSON.stringify({
            amendments: [{
              type: 'status_update',
              target: {
                type: 'task',
                id: 'task-1',
                name: 'API Implementation',
                confidence: 0.9
              },
              newStatus: 'completed'
            }],
            confidence: 0.9
          }) + '\n```'
        }]
      })

      const result = await aiParser.parseTranscription(
        'Mark API Implementation as complete',
        context
      )

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments[0].type).toBe(AmendmentType.StatusUpdate)
    })

    it('should handle response with extra text before/after JSON', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Here is the parsed result:\n```json\n' + JSON.stringify({
            amendments: [{
              type: 'time_log',
              target: {
                type: 'task',
                id: 'task-1',
                name: 'API Implementation',
                confidence: 0.9
              },
              duration: 120
            }],
            confidence: 0.9
          }) + '\n```\nThis represents 2 hours of work.'
        }]
      })

      const result = await aiParser.parseTranscription(
        'I spent 2 hours on API Implementation',
        context
      )

      expect(result.amendments).toHaveLength(1)
      expect(result.amendments[0].type).toBe(AmendmentType.TimeLog)
      expect((result.amendments[0] as any).duration).toBe(120)
    })
  })

  describe('Enum Type Safety', () => {
    it('should use correct enum values for amendment types', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [
              {
                type: 'status_update',
                target: { type: 'task', id: 'task-1', name: 'Task', confidence: 0.9 },
                newStatus: 'completed'
              },
              {
                type: 'time_log',
                target: { type: 'task', id: 'task-1', name: 'Task', confidence: 0.9 },
                duration: 60
              },
              {
                type: 'note_addition',
                target: { type: 'task', id: 'task-1', name: 'Task', confidence: 0.9 },
                note: 'Test note',
                append: true
              },
              {
                type: 'duration_change',
                target: { type: 'task', id: 'task-1', name: 'Task', confidence: 0.9 },
                newDuration: 180
              },
              {
                type: 'step_addition',
                workflowTarget: { type: 'workflow', id: 'wf-1', name: 'Workflow', confidence: 0.9 },
                stepName: 'New Step',
                duration: 30,
                stepType: 'focused'
              }
            ],
            confidence: 0.9
          })
        }]
      })

      const result = await aiParser.parseTranscription('Multiple amendments', context)

      expect(result.amendments[0].type).toBe(AmendmentType.StatusUpdate)
      expect(result.amendments[1].type).toBe(AmendmentType.TimeLog)
      expect(result.amendments[2].type).toBe(AmendmentType.NoteAddition)
      expect(result.amendments[3].type).toBe(AmendmentType.DurationChange)
      expect(result.amendments[4].type).toBe(AmendmentType.StepAddition)
    })

    it('should use correct enum values for entity types', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            amendments: [{
              type: 'status_update',
              target: {
                type: 'workflow',
                id: 'wf-1',
                name: 'Deployment Workflow',
                confidence: 0.9
              },
              newStatus: 'in_progress'
            }],
            confidence: 0.9
          })
        }]
      })

      const result = await aiParser.parseTranscription(
        'Start the deployment workflow',
        context
      )

      expect(result.amendments).toHaveLength(1)
      const target = (result.amendments[0] as any).target
      expect(target.type).toBe(EntityType.Workflow)
    })

    it('should use correct enum values for task status', async () => {
      const statuses = ['not_started', 'in_progress', 'waiting', 'completed']
      
      for (const status of statuses) {
        mockCreate.mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              amendments: [{
                type: 'status_update',
                target: {
                  type: 'task',
                  id: 'task-1',
                  name: 'Test Task',
                  confidence: 0.9
                },
                newStatus: status
              }],
              confidence: 0.9
            })
          }]
        })

        const result = await aiParser.parseTranscription(
          `Set status to ${status}`,
          context
        )

        const amendment = result.amendments[0] as any
        expect(Object.values(TaskStatus)).toContain(amendment.newStatus)
      }
    })
  })

  describe('Error Recovery', () => {
    it('should handle malformed JSON gracefully', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '```json\n{invalid json}\n```'
        }]
      })

      const result = await aiParser.parseTranscription(
        'This should fail to parse',
        context
      )

      expect(result.amendments).toHaveLength(0)
      expect(result.confidence).toBe(0)
      expect(result.warnings).toBeDefined()
      expect(result.warnings![0]).toContain('Failed to parse')
    })

    it('should handle empty Claude response', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: ''
        }]
      })

      const result = await aiParser.parseTranscription(
        'Empty response test',
        context
      )

      expect(result.amendments).toHaveLength(0)
      expect(result.confidence).toBe(0)
      expect(result.warnings).toBeDefined()
    })

    it('should handle Claude API errors', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'))

      const result = await aiParser.parseTranscription(
        'This should trigger an error',
        context
      )

      expect(result.amendments).toHaveLength(0)
      expect(result.confidence).toBe(0)
      expect(result.warnings).toBeDefined()
      expect(result.warnings![0]).toContain('Failed to parse')
      expect(result.needsClarification).toBeDefined()
    })
  })

  describe('Complex Real-World Scenarios', () => {
    it('should parse the safety workflow scenario from user feedback', async () => {
      // This is the exact scenario that failed for the user
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '```json\n' + JSON.stringify({
            amendments: [
              {
                type: 'step_addition',
                workflowTarget: {
                  type: 'workflow',
                  id: 'wf-1',
                  name: 'Safety Documentation Sprint',
                  confidence: 0.95
                },
                stepName: 'Adjust timestamps for remaining chunks',
                duration: 60,
                stepType: 'focused'
              },
              {
                type: 'step_addition',
                workflowTarget: {
                  type: 'workflow',
                  id: 'wf-1',
                  name: 'Safety Documentation Sprint',
                  confidence: 0.95
                },
                stepName: 'Submit full workflow',
                duration: 30,
                stepType: 'admin',
                afterStep: 'Adjust timestamps for remaining chunks'
              },
              {
                type: 'step_addition',
                workflowTarget: {
                  type: 'workflow',
                  id: 'wf-1',
                  name: 'Safety Documentation Sprint',
                  confidence: 0.95
                },
                stepName: 'Wait for workflow processing (24 hours)',
                duration: 1440,
                stepType: 'admin',
                afterStep: 'Submit full workflow'
              },
              {
                type: 'step_addition',
                workflowTarget: {
                  type: 'workflow',
                  id: 'wf-1',
                  name: 'Safety Documentation Sprint',
                  confidence: 0.95
                },
                stepName: 'Close full workflow',
                duration: 15,
                stepType: 'admin',
                afterStep: 'Wait for workflow processing (24 hours)'
              }
            ],
            confidence: 0.9,
            warnings: [],
            needsClarification: []
          }) + '\n```'
        }]
      })

      const result = await aiParser.parseTranscription(
        'Okay, so on the safety workflow, after I adjust all of the timestamps for the remaining chunks, I need to submit a full workflow, which will take 24 hours before I can close that full workflow.',
        context
      )

      expect(result.amendments).toHaveLength(4)
      expect(result.amendments.every(a => a.type === AmendmentType.StepAddition)).toBe(true)
      
      // Verify the steps are in the correct order with dependencies
      const steps = result.amendments as any[]
      expect(steps[0].stepName).toBe('Adjust timestamps for remaining chunks')
      expect(steps[1].stepName).toBe('Submit full workflow')
      expect(steps[1].afterStep).toBe('Adjust timestamps for remaining chunks')
      expect(steps[2].stepName).toContain('24 hours')
      expect(steps[3].stepName).toBe('Close full workflow')
      
      // Verify all have stepType, not type overwriting the amendment type
      steps.forEach(step => {
        expect(step.type).toBe(AmendmentType.StepAddition)
        expect(['focused', 'admin']).toContain(step.stepType)
      })
    })
  })
})