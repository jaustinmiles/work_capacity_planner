import { describe, it, expect, vi } from 'vitest'
import { formatContextForAI, estimateTokenCount, AppContext, JobContextData } from '../chat-context-provider'
import { TaskStatus } from '@shared/enums'

// Mock the time provider
vi.mock('@shared/time-provider', () => ({
  getCurrentTime: () => new Date('2024-01-15T10:00:00Z'),
  getLocalDateString: () => '2024-01-15',
}))

describe('Chat Context Provider', () => {
  // Create minimal valid AppContext for testing
  const createMockContext = (overrides: Partial<AppContext> = {}): AppContext => ({
    currentDate: '2024-01-15',
    currentTime: '2024-01-15T10:00:00Z',
    tasks: [],
    workPatterns: [],
    schedule: [],
    workSessions: [],
    workSettings: {
      workStartTime: '09:00',
      workEndTime: '17:00',
      breakDuration: 15,
      focusBlockDuration: 90,
      adminBlockDuration: 30,
      maxFocusBlocks: 4,
      timezone: 'America/New_York',
    },
    userTaskTypes: [],
    summary: {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      archivedTasks: 0,
      totalWorkflows: 0,
      completedWorkflows: 0,
      inProgressWorkflows: 0,
      archivedWorkflows: 0,
      totalWorkPatterns: 0,
      totalScheduledItems: 0,
      totalWorkSessions: 0,
    },
    ...overrides,
  })

  describe('formatContextForAI', () => {
    it('should format empty context correctly', () => {
      const context = createMockContext()
      const result = formatContextForAI(context)

      expect(result).toContain('# Current App Context')
      expect(result).toContain('**Date:** 2024-01-15')
      expect(result).toContain('## Summary')
      expect(result).toContain('**Tasks:** 0 total')
      expect(result).toContain('**Workflows:** 0 total')
    })

    it('should include task information', () => {
      const context = createMockContext({
        tasks: [
          {
            id: 'task-1',
            name: 'Test Task',
            duration: 60,
            importance: 8,
            urgency: 7,
            type: 'focused',
            sessionId: 'session-1',
            asyncWaitTime: 0,
            dependencies: [],
            completed: false,
            hasSteps: false,
            overallStatus: TaskStatus.NotStarted,
            criticalPathDuration: 60,
            worstCaseDuration: 60,
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalTasks: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('**Test Task** (ID: task-1)')
      expect(result).toContain('Duration: 60min')
      expect(result).toContain('Importance: 8')
      expect(result).toContain('Urgency: 7')
    })

    it('should include workflow information with steps', () => {
      const context = createMockContext({
        tasks: [
          {
            id: 'workflow-1',
            name: 'Test Workflow',
            duration: 180,
            importance: 9,
            urgency: 8,
            type: 'focused',
            sessionId: 'session-1',
            asyncWaitTime: 0,
            dependencies: [],
            completed: false,
            hasSteps: true,
            overallStatus: TaskStatus.InProgress,
            criticalPathDuration: 240,
            worstCaseDuration: 300,
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
            steps: [
              {
                id: 'step-1',
                taskId: 'workflow-1',
                name: 'Step 1',
                duration: 60,
                type: 'focused',
                dependsOn: [],
                asyncWaitTime: 0,
                status: 'completed',
                stepIndex: 0,
                percentComplete: 100,
              },
              {
                id: 'step-2',
                taskId: 'workflow-1',
                name: 'Step 2',
                duration: 120,
                type: 'admin',
                dependsOn: ['step-1'],
                asyncWaitTime: 30,
                status: 'in_progress',
                stepIndex: 1,
                percentComplete: 50,
              },
            ],
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalWorkflows: 1,
          inProgressWorkflows: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('**Test Workflow** (ID: workflow-1)')
      expect(result).toContain('Steps (2)')
      expect(result).toContain('Step 1')
      expect(result).toContain('Step 2')
      expect(result).toContain('Depends on: Step 1')
    })

    it('should include job context when provided', () => {
      const jobContext: JobContextData = {
        name: 'Software Engineer',
        description: 'Full-stack development',
        context: 'React, TypeScript, Node.js',
        asyncPatterns: 'Daily standups, PR reviews',
        reviewCycles: 'Weekly sprint reviews',
        tools: 'VS Code, GitHub, Jira',
      }

      const context = createMockContext({ jobContext })
      const result = formatContextForAI(context)

      expect(result).toContain('## Job Context')
      expect(result).toContain('**Name:** Software Engineer')
      expect(result).toContain('**Description:** Full-stack development')
      expect(result).toContain('**Tools:** VS Code, GitHub, Jira')
    })

    it('should include user task types', () => {
      const context = createMockContext({
        userTaskTypes: [
          {
            id: 'utt-1',
            sessionId: 'session-1',
            name: 'Coding',
            emoji: '💻',
            color: '#FF5733',
            sortOrder: 0,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
          },
          {
            id: 'utt-2',
            sessionId: 'session-1',
            name: 'Design',
            emoji: '🎨',
            color: '#33FF57',
            sortOrder: 1,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
          },
        ],
      })

      const result = formatContextForAI(context)

      expect(result).toContain('## Available Task Types (2)')
      expect(result).toContain('**Coding** (ID: `utt-1`) 💻')
      expect(result).toContain('**Design** (ID: `utt-2`) 🎨')
    })

    it('should include work patterns', () => {
      const context = createMockContext({
        workPatterns: [
          {
            id: 'wp-1',
            date: '2024-01-15',
            blocks: [
              {
                id: 'block-1',
                startTime: '09:00',
                endTime: '12:00',
                typeConfig: { kind: 'system', systemType: 'focused' },
                capacity: { totalMinutes: 180, focusedMinutes: 180, adminMinutes: 0 },
                totalCapacity: 180,
                patternId: 'wp-1',
              },
            ],
            meetings: [],
            workSessions: [],
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalWorkPatterns: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('## Work Patterns (1)')
      expect(result).toContain('**2024-01-15**')
      expect(result).toContain('09:00-12:00')
    })

    it('should include task dependencies', () => {
      const context = createMockContext({
        tasks: [
          {
            id: 'task-1',
            name: 'Dependent Task',
            duration: 30,
            importance: 5,
            urgency: 5,
            type: 'admin',
            sessionId: 'session-1',
            asyncWaitTime: 0,
            dependencies: ['task-0', 'task-2'],
            completed: false,
            hasSteps: false,
            overallStatus: TaskStatus.NotStarted,
            criticalPathDuration: 30,
            worstCaseDuration: 30,
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalTasks: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('Dependencies: task-0, task-2')
    })

    it('should truncate long notes', () => {
      const longNotes = 'A'.repeat(150)
      const context = createMockContext({
        tasks: [
          {
            id: 'task-1',
            name: 'Task with Notes',
            duration: 30,
            importance: 5,
            urgency: 5,
            type: 'admin',
            sessionId: 'session-1',
            asyncWaitTime: 0,
            dependencies: [],
            completed: false,
            hasSteps: false,
            overallStatus: TaskStatus.NotStarted,
            criticalPathDuration: 30,
            worstCaseDuration: 30,
            notes: longNotes,
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalTasks: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('Notes:')
      expect(result).toContain('...')
      expect(result).not.toContain(longNotes) // Should be truncated
    })

    it('should include meetings in work patterns', () => {
      const context = createMockContext({
        workPatterns: [
          {
            id: 'wp-1',
            date: '2024-01-15',
            blocks: [],
            meetings: [
              {
                id: 'meeting-1',
                name: 'Team Standup',
                startTime: '09:00',
                endTime: '09:30',
                patternId: 'wp-1',
              },
            ],
            workSessions: [],
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalWorkPatterns: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('Meetings: Team Standup (09:00-09:30)')
    })

    it('should include work session details with task names', () => {
      const context = createMockContext({
        tasks: [
          {
            id: 'task-1',
            name: 'Write Documentation',
            duration: 60,
            importance: 5,
            urgency: 5,
            type: 'focused',
            sessionId: 'session-1',
            asyncWaitTime: 0,
            dependencies: [],
            completed: false,
            hasSteps: false,
            overallStatus: TaskStatus.NotStarted,
            criticalPathDuration: 60,
            worstCaseDuration: 60,
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        ],
        workSessions: [
          {
            id: 'ws-1',
            taskId: 'task-1',
            startTime: new Date('2024-01-15T10:00:00Z'),
            endTime: new Date('2024-01-15T10:45:00Z'),
            plannedMinutes: 60,
            actualMinutes: 45,
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalTasks: 1,
          totalWorkSessions: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('## Recent Work Sessions (1)')
      expect(result).toContain('**Write Documentation**')
      expect(result).toContain('45 min')
    })

    it('should show ACTIVE indicator for ongoing sessions', () => {
      const context = createMockContext({
        tasks: [
          {
            id: 'task-1',
            name: 'Code Review',
            duration: 30,
            importance: 5,
            urgency: 5,
            type: 'admin',
            sessionId: 'session-1',
            asyncWaitTime: 0,
            dependencies: [],
            completed: false,
            hasSteps: false,
            overallStatus: TaskStatus.InProgress,
            criticalPathDuration: 30,
            worstCaseDuration: 30,
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        ],
        workSessions: [
          {
            id: 'ws-1',
            taskId: 'task-1',
            startTime: new Date('2024-01-15T09:30:00Z'),
            // No endTime = ongoing session
            plannedMinutes: 30,
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalTasks: 1,
          totalWorkSessions: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('**Code Review**')
      expect(result).toContain('ongoing')
      expect(result).toContain('ACTIVE')
    })

    it('should include workflow step names for step sessions', () => {
      const context = createMockContext({
        tasks: [
          {
            id: 'workflow-1',
            name: 'Release v1.0',
            duration: 180,
            importance: 9,
            urgency: 8,
            type: 'focused',
            sessionId: 'session-1',
            asyncWaitTime: 0,
            dependencies: [],
            completed: false,
            hasSteps: true,
            overallStatus: TaskStatus.InProgress,
            criticalPathDuration: 240,
            worstCaseDuration: 300,
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
            steps: [
              {
                id: 'step-1',
                taskId: 'workflow-1',
                name: 'Write changelog',
                duration: 30,
                type: 'focused',
                dependsOn: [],
                asyncWaitTime: 0,
                status: 'completed',
                stepIndex: 0,
                percentComplete: 100,
              },
            ],
          },
        ],
        workSessions: [
          {
            id: 'ws-1',
            taskId: 'workflow-1',
            stepId: 'step-1',
            startTime: new Date('2024-01-15T09:00:00Z'),
            endTime: new Date('2024-01-15T09:30:00Z'),
            plannedMinutes: 30,
            actualMinutes: 30,
          },
        ],
        summary: {
          ...createMockContext().summary,
          totalWorkflows: 1,
          totalWorkSessions: 1,
        },
      })

      const result = formatContextForAI(context)

      expect(result).toContain('**Write changelog (workflow: Release v1.0)**')
      expect(result).toContain('30 min')
    })
  })

  describe('estimateTokenCount', () => {
    it('should estimate token count for empty context', () => {
      const context = createMockContext()
      const tokenCount = estimateTokenCount(context)

      // Should return a positive number
      expect(tokenCount).toBeGreaterThan(0)
      // Empty context should be relatively small
      expect(tokenCount).toBeLessThan(500)
    })

    it('should increase token count with more content', () => {
      const emptyContext = createMockContext()
      const emptyTokens = estimateTokenCount(emptyContext)

      const contextWithTasks = createMockContext({
        tasks: Array(10).fill(null).map((_, i) => ({
          id: `task-${i}`,
          name: `Test Task ${i}`,
          duration: 60,
          importance: 8,
          urgency: 7,
          type: 'focused' as const,
          sessionId: 'session-1',
          asyncWaitTime: 0,
          dependencies: [],
          completed: false,
          hasSteps: false,
          overallStatus: TaskStatus.NotStarted,
          criticalPathDuration: 60,
          worstCaseDuration: 60,
          createdAt: new Date('2024-01-15'),
          updatedAt: new Date('2024-01-15'),
        })),
        summary: {
          ...createMockContext().summary,
          totalTasks: 10,
        },
      })

      const tasksTokens = estimateTokenCount(contextWithTasks)

      expect(tasksTokens).toBeGreaterThan(emptyTokens)
    })

    it('should use approximately 4 characters per token', () => {
      const context = createMockContext()
      const formatted = formatContextForAI(context)
      const tokenCount = estimateTokenCount(context)

      // Token count should be roughly characters / 4
      const expectedTokens = Math.ceil(formatted.length / 4)
      expect(tokenCount).toBe(expectedTokens)
    })
  })
})
