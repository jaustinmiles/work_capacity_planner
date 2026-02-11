/**
 * Tests for UnifiedScheduler dependency resolution with completed steps
 */

import { UnifiedScheduler } from '../unified-scheduler'
import { SequencedTask } from '../sequencing-types'
import { Task } from '../types'
import { TaskStatus, StepStatus } from '../enums'
// Helper to create a simple work pattern with new typeConfig format
const createMockWorkPattern = () => ({
  date: '2024-01-01',
  accumulated: {}, // Dynamic format: Record<string, number>
  blocks: [
    {
      id: 'block-1',
      startTime: '09:00',
      endTime: '17:00',
      typeConfig: { kind: 'single' as const, typeId: 'focused' },
      capacity: {
        totalMinutes: 480,
      },
    },
  ],
  meetings: [],
})

describe('UnifiedScheduler - Completed Dependencies', () => {
  let scheduler: UnifiedScheduler

  beforeEach(() => {
    scheduler = new UnifiedScheduler()
  })

  describe('workflow steps with completed dependencies', () => {
    it('should schedule steps when previous steps are completed', () => {
      const workflow: SequencedTask = {
        id: 'workflow-1',
        name: 'Test Workflow',
        duration: 120,
        importance: 5,
        urgency: 5,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        hasSteps: true,
        currentStepId: 'step-2',
        overallStatus: TaskStatus.InProgress,
        criticalPathDuration: 120,
        worstCaseDuration: 150,
        sessionId: 'session-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: 'step-1',
            taskId: 'workflow-1',
            name: 'First Step',
            duration: 60,
            type: 'focused',
            dependsOn: [],
            asyncWaitTime: 0,
            status: StepStatus.Completed, // This is completed
            stepIndex: 0,
            percentComplete: 100,
          },
          {
            id: 'step-2',
            taskId: 'workflow-1',
            name: 'Second Step',
            duration: 60,
            type: 'focused',
            dependsOn: ['step-1'], // Depends on completed step
            asyncWaitTime: 0,
            status: StepStatus.Pending,
            stepIndex: 1,
            percentComplete: 0,
          },
        ],
      }

      const workPatterns = [createMockWorkPattern()]
      const context = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00Z'),
        tasks: [],
        workflows: [workflow],
        workPatterns,
        workSettings: {
          sleepHours: { start: '23:00', end: '07:00' },
          workingHours: { start: '09:00', end: '17:00' },
          breakPreferences: { duration: 15, frequency: 90 },
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 2,
            maxPersonalHours: 1,
          },
        },
      }

      const config = {
        startDate: '2024-01-01',
        allowTaskSplitting: false,
        respectMeetings: true,
        debugMode: true,
        includeWeekends: false,
        optimizationMode: 'realistic' as const,
      }

      const result = scheduler.scheduleForDisplay([workflow], context, config)

      // Should be able to schedule step-2 since step-1 is completed
      expect(result.scheduled.length).toBe(1)
      expect(result.scheduled[0].id).toBe('step-2')
      expect(result.conflicts.length).toBe(0)
    })

    it('should fail to schedule steps when dependencies are missing (not completed)', () => {
      const workflow: SequencedTask = {
        id: 'workflow-1',
        name: 'Test Workflow',
        duration: 120,
        importance: 5,
        urgency: 5,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        hasSteps: true,
        currentStepId: 'step-2',
        overallStatus: TaskStatus.InProgress,
        criticalPathDuration: 120,
        worstCaseDuration: 150,
        sessionId: 'session-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: 'step-2',
            taskId: 'workflow-1',
            name: 'Second Step',
            duration: 60,
            type: 'focused',
            dependsOn: ['step-1'], // Depends on missing step
            asyncWaitTime: 0,
            status: StepStatus.Pending,
            stepIndex: 1,
            percentComplete: 0,
          },
        ],
      }

      const workPatterns = [createMockWorkPattern()]
      const context = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00Z'),
        tasks: [],
        workflows: [workflow],
        workPatterns,
        workSettings: {
          sleepHours: { start: '23:00', end: '07:00' },
          workingHours: { start: '09:00', end: '17:00' },
          breakPreferences: { duration: 15, frequency: 90 },
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 2,
            maxPersonalHours: 1,
          },
        },
      }

      const config = {
        startDate: '2024-01-01',
        allowTaskSplitting: false,
        respectMeetings: true,
        debugMode: true,
        includeWeekends: false,
        optimizationMode: 'realistic' as const,
      }

      const result = scheduler.scheduleForDisplay([workflow], context, config)

      // Should auto-heal: strip the broken dependency and still schedule items
      // Conflicts are still reported so the UI can warn the user
      expect(result.scheduled.length).toBeGreaterThan(0)
      expect(result.conflicts.length).toBeGreaterThan(0)
      expect(result.conflicts[0].description).toContain('missing item "step-1"')
    })

    it('should handle mixed completed and pending dependencies', () => {
      const workflow: SequencedTask = {
        id: 'workflow-1',
        name: 'Test Workflow',
        duration: 180,
        importance: 5,
        urgency: 5,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        hasSteps: true,
        currentStepId: 'step-3',
        overallStatus: TaskStatus.InProgress,
        criticalPathDuration: 180,
        worstCaseDuration: 220,
        sessionId: 'session-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: 'step-1',
            taskId: 'workflow-1',
            name: 'First Step',
            duration: 60,
            type: 'focused',
            dependsOn: [],
            asyncWaitTime: 0,
            status: StepStatus.Completed, // Completed
            stepIndex: 0,
            percentComplete: 100,
          },
          {
            id: 'step-2',
            taskId: 'workflow-1',
            name: 'Second Step',
            duration: 60,
            type: 'focused',
            dependsOn: [],
            asyncWaitTime: 0,
            status: StepStatus.Pending, // Still pending
            stepIndex: 1,
            percentComplete: 0,
          },
          {
            id: 'step-3',
            taskId: 'workflow-1',
            name: 'Third Step',
            duration: 60,
            type: 'focused',
            dependsOn: ['step-1', 'step-2'], // Depends on both completed and pending
            asyncWaitTime: 0,
            status: StepStatus.Pending,
            stepIndex: 2,
            percentComplete: 0,
          },
        ],
      }

      const workPatterns = [createMockWorkPattern()]
      const context = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00Z'),
        tasks: [],
        workflows: [workflow],
        workPatterns,
        workSettings: {
          sleepHours: { start: '23:00', end: '07:00' },
          workingHours: { start: '09:00', end: '17:00' },
          breakPreferences: { duration: 15, frequency: 90 },
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 2,
            maxPersonalHours: 1,
          },
        },
      }

      const config = {
        startDate: '2024-01-01',
        allowTaskSplitting: false,
        respectMeetings: true,
        debugMode: true,
        includeWeekends: false,
        optimizationMode: 'realistic' as const,
      }

      const result = scheduler.scheduleForDisplay([workflow], context, config)

      // Should be able to schedule step-2 (no dependencies)
      // Step-3 should be scheduled after step-2
      expect(result.scheduled.length).toBe(2)
      const scheduledIds = result.scheduled.map(s => s.id)
      expect(scheduledIds).toContain('step-2')
      expect(scheduledIds).toContain('step-3')

      // Step-2 should be scheduled before step-3
      const step2Index = result.scheduled.findIndex(s => s.id === 'step-2')
      const step3Index = result.scheduled.findIndex(s => s.id === 'step-3')
      expect(step2Index).toBeLessThan(step3Index)
    })
  })

  describe('cross-workflow dependencies with completion', () => {
    it('should handle dependencies on completed tasks from other workflows', () => {
      const completedTask: Task = {
        id: 'task-1',
        name: 'Completed Task',
        duration: 60,
        importance: 5,
        urgency: 5,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: true, // Completed
        hasSteps: false,
        overallStatus: TaskStatus.Completed,
        criticalPathDuration: 60,
        worstCaseDuration: 70,
        sessionId: 'session-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const workflow: SequencedTask = {
        id: 'workflow-1',
        name: 'Dependent Workflow',
        duration: 60,
        importance: 5,
        urgency: 5,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        hasSteps: true,
        currentStepId: 'step-1',
        overallStatus: TaskStatus.Pending,
        criticalPathDuration: 60,
        worstCaseDuration: 70,
        sessionId: 'session-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        steps: [
          {
            id: 'step-1',
            taskId: 'workflow-1',
            name: 'First Step',
            duration: 60,
            type: 'focused',
            dependsOn: ['task-1'], // Depends on completed task
            asyncWaitTime: 0,
            status: StepStatus.Pending,
            stepIndex: 0,
            percentComplete: 0,
          },
        ],
      }

      const workPatterns = [createMockWorkPattern()]
      const context = {
        startDate: '2024-01-01',
        currentTime: new Date('2024-01-01T09:00:00Z'),
        tasks: [completedTask],
        workflows: [workflow],
        workPatterns,
        workSettings: {
          sleepHours: { start: '23:00', end: '07:00' },
          workingHours: { start: '09:00', end: '17:00' },
          breakPreferences: { duration: 15, frequency: 90 },
          defaultCapacity: {
            maxFocusHours: 4,
            maxAdminHours: 2,
            maxPersonalHours: 1,
          },
        },
      }

      const config = {
        startDate: '2024-01-01',
        allowTaskSplitting: false,
        respectMeetings: true,
        debugMode: true,
        includeWeekends: false,
        optimizationMode: 'realistic' as const,
      }

      const result = scheduler.scheduleForDisplay([completedTask, workflow], context, config)

      // Should be able to schedule step-1 since task-1 is completed
      expect(result.scheduled.length).toBe(1)
      expect(result.scheduled[0].id).toBe('step-1')
      expect(result.conflicts.length).toBe(0)
    })
  })
})
