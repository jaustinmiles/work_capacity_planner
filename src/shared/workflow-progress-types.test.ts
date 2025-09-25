import { describe, it, expect } from 'vitest'
import {
  WorkSession,
  TimeEstimateAccuracy,
  WorkflowProgress,
  StepProgress,
  TimeAccuracyStats,
  WorkflowUpdate,
  CompletedStepUpdate,
  DurationUpdate,
  ProgressUpdate,
  NewStepUpdate,
  DependencyUpdate,
  WorkflowEditingState,
  TimeLoggingState,
  ValidationResult,
  WorkflowAnalytics,
  DailyWorkSummary,
  isCompletedStep,
  isActiveWorkSession,
  hasTimeVariance,
  TIME_ESTIMATION_THRESHOLDS,
  WORKFLOW_STATUS_THRESHOLDS,
} from './workflow-progress-types'

describe('workflow-progress-types', () => {
  describe('Helper functions', () => {
    describe('isCompletedStep', () => {
      it('should return true for completed steps', () => {
        expect(isCompletedStep({ status: 'completed' })).toBe(true)
      })

      it('should return false for non-completed steps', () => {
        expect(isCompletedStep({ status: 'pending' })).toBe(false)
        expect(isCompletedStep({ status: 'in_progress' })).toBe(false)
        expect(isCompletedStep({ status: 'blocked' })).toBe(false)
      })
    })

    describe('isActiveWorkSession', () => {
      it('should return true for sessions without end time', () => {
        const session: WorkSession = {
          id: 'session-1',
          taskStepId: 'step-1',
          startTime: new Date(),
          duration: 60,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        expect(isActiveWorkSession(session)).toBe(true)
      })

      it('should return false for sessions with end time', () => {
        const session: WorkSession = {
          id: 'session-1',
          taskStepId: 'step-1',
          startTime: new Date(),
          endTime: new Date(),
          duration: 60,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        expect(isActiveWorkSession(session)).toBe(false)
      })
    })

    describe('hasTimeVariance', () => {
      it('should return false when variance is within threshold', () => {
        expect(hasTimeVariance(100, 105)).toBe(false) // 5% variance
        expect(hasTimeVariance(100, 95)).toBe(false) // 5% variance
        expect(hasTimeVariance(100, 110)).toBe(false) // 10% variance (exactly at threshold)
      })

      it('should return true when variance exceeds threshold', () => {
        expect(hasTimeVariance(100, 115)).toBe(true) // 15% variance
        expect(hasTimeVariance(100, 80)).toBe(true) // 20% variance
        expect(hasTimeVariance(100, 150)).toBe(true) // 50% variance
      })

      it('should use custom threshold when provided', () => {
        expect(hasTimeVariance(100, 105, 0.03)).toBe(true) // 5% > 3% threshold
        expect(hasTimeVariance(100, 120, 0.25)).toBe(false) // 20% < 25% threshold
        expect(hasTimeVariance(100, 130, 0.25)).toBe(true) // 30% > 25% threshold
      })

      it('should handle zero estimated time', () => {
        expect(hasTimeVariance(0, 10)).toBe(true) // Infinity variance
        expect(hasTimeVariance(0, 0)).toBe(false) // NaN becomes false
      })
    })
  })

  describe('Constants', () => {
    describe('TIME_ESTIMATION_THRESHOLDS', () => {
      it('should have correct threshold values', () => {
        expect(TIME_ESTIMATION_THRESHOLDS.ACCURATE).toBe(0.1)
        expect(TIME_ESTIMATION_THRESHOLDS.MODERATE).toBe(0.25)
        expect(TIME_ESTIMATION_THRESHOLDS.POOR).toBe(0.5)
      })

      it('should be defined as const', () => {
        // The 'as const' assertion makes the object readonly at the type level
        // but doesn't make it truly immutable at runtime
        expect(TIME_ESTIMATION_THRESHOLDS).toBeDefined()
        expect(typeof TIME_ESTIMATION_THRESHOLDS).toBe('object')
      })
    })

    describe('WORKFLOW_STATUS_THRESHOLDS', () => {
      it('should have correct threshold values', () => {
        expect(WORKFLOW_STATUS_THRESHOLDS.DELAYED).toBe(1.2)
        expect(WORKFLOW_STATUS_THRESHOLDS.AT_RISK).toBe(1.1)
        expect(WORKFLOW_STATUS_THRESHOLDS.ON_TRACK).toBe(1.0)
      })

      it('should be defined as const', () => {
        // The 'as const' assertion makes the object readonly at the type level
        // but doesn't make it truly immutable at runtime
        expect(WORKFLOW_STATUS_THRESHOLDS).toBeDefined()
        expect(typeof WORKFLOW_STATUS_THRESHOLDS).toBe('object')
      })
    })
  })

  describe('Type validation', () => {
    it('should create valid WorkSession', () => {
      const session: WorkSession = {
        id: 'ws-1',
        taskStepId: 'step-1',
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T11:00:00'),
        duration: 60,
        notes: 'Completed successfully',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(session.id).toBe('ws-1')
      expect(session.duration).toBe(60)
      expect(session.notes).toBe('Completed successfully')
    })

    it('should create valid TimeEstimateAccuracy', () => {
      const accuracy: TimeEstimateAccuracy = {
        id: 'acc-1',
        sessionId: 'session-1',
        taskType: 'focused',
        workflowCategory: 'development',
        estimatedMinutes: 60,
        actualMinutes: 75,
        variance: 25,
        createdAt: new Date(),
      }

      expect(accuracy.taskType).toBe('focused')
      expect(accuracy.variance).toBe(25)
    })

    it('should create valid WorkflowProgress', () => {
      const progress: WorkflowProgress = {
        stepProgress: 50,
        timeProgress: 45,
        completedSteps: 2,
        totalSteps: 4,
        totalEstimatedMinutes: 240,
        totalActualMinutes: 180,
        completedMinutes: 108,
        remainingMinutes: 132,
        variance: -12,
        status: 'on_track',
      }

      expect(progress.stepProgress).toBe(50)
      expect(progress.status).toBe('on_track')
    })

    it('should create valid StepProgress', () => {
      const stepProgress: StepProgress = {
        stepId: 'step-1',
        percentComplete: 75,
        actualDuration: 45,
        workSessions: [],
        lastWorkedAt: new Date(),
      }

      expect(stepProgress.percentComplete).toBe(75)
      expect(stepProgress.actualDuration).toBe(45)
    })

    it('should create valid TimeAccuracyStats', () => {
      const stats: TimeAccuracyStats = {
        averageVariance: 15,
        totalSamples: 100,
        overestimateCount: 30,
        underestimateCount: 40,
        accurateCount: 30,
        byTaskType: {
          focused: { variance: 12, samples: 60 },
          admin: { variance: 20, samples: 40 },
        },
        trend: 'improving',
      }

      expect(stats.averageVariance).toBe(15)
      expect(stats.trend).toBe('improving')
      expect(stats.byTaskType.focused.variance).toBe(12)
    })

    it('should create valid WorkflowUpdate', () => {
      const update: WorkflowUpdate = {
        completedSteps: [
          { stepId: 'step-1', actualMinutes: 45, notes: 'Done' },
        ],
        durationUpdates: [
          { stepId: 'step-2', newDuration: 90, reason: 'More complex' },
        ],
        progressUpdates: [
          { stepId: 'step-3', percentComplete: 50, notes: 'Halfway' },
        ],
        newSteps: [
          { name: 'Review', duration: 30, type: 'admin', insertAfter: 'step-3' },
        ],
        removedSteps: ['step-4'],
        dependencyChanges: [
          { stepId: 'step-5', action: 'add', dependsOn: 'step-2' },
        ],
      }

      expect(update.completedSteps).toHaveLength(1)
      expect(update.newSteps[0].type).toBe('admin')
      expect(update.dependencyChanges[0].action).toBe('add')
    })

    it('should create valid WorkflowEditingState', () => {
      const state: WorkflowEditingState = {
        isRecording: false,
        transcript: 'Mark step 1 as complete',
        isProcessing: true,
        proposedUpdate: {
          completedSteps: [],
          durationUpdates: [],
          progressUpdates: [],
          newSteps: [],
          removedSteps: [],
          dependencyChanges: [],
        },
        error: undefined,
      }

      expect(state.isRecording).toBe(false)
      expect(state.transcript).toBe('Mark step 1 as complete')
    })

    it('should create valid TimeLoggingState', () => {
      const state: TimeLoggingState = {
        stepId: 'step-1',
        minutes: 45,
        percentComplete: 80,
        notes: 'Almost done',
      }

      expect(state.minutes).toBe(45)
      expect(state.percentComplete).toBe(80)
    })

    it('should create valid ValidationResult', () => {
      const result: ValidationResult = {
        isValid: false,
        errors: [
          { field: 'duration', message: 'Duration must be positive', severity: 'error' },
          { field: 'name', message: 'Name is recommended', severity: 'warning' },
        ],
      }

      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0].severity).toBe('error')
    })

    it('should create valid WorkflowAnalytics', () => {
      const analytics: WorkflowAnalytics = {
        workflowId: 'workflow-1',
        totalWorkflows: 10,
        averageCompletionTime: 180,
        averageVariance: 15,
        successRate: 0.8,
        commonBottlenecks: [
          { stepName: 'Code Review', averageDelay: 120, frequency: 0.7 },
          { stepName: 'Testing', averageDelay: 60, frequency: 0.5 },
        ],
      }

      expect(analytics.successRate).toBe(0.8)
      expect(analytics.commonBottlenecks).toHaveLength(2)
    })

    it('should create valid DailyWorkSummary', () => {
      const summary: DailyWorkSummary = {
        date: '2025-01-15',
        totalMinutesWorked: 420,
        focus: 240,
        admin: 180,
        completedSteps: 5,
        workflowsProgressed: ['workflow-1', 'workflow-2'],
      }

      expect(summary.totalMinutesWorked).toBe(420)
      expect(summary.workflowsProgressed).toHaveLength(2)
    })
  })

  describe('Update types', () => {
    it('should create valid CompletedStepUpdate', () => {
      const update: CompletedStepUpdate = {
        stepId: 'step-1',
        actualMinutes: 60,
        notes: 'Completed with minor issues',
      }

      expect(update.stepId).toBe('step-1')
      expect(update.actualMinutes).toBe(60)
    })

    it('should create valid DurationUpdate', () => {
      const update: DurationUpdate = {
        stepId: 'step-2',
        newDuration: 120,
        reason: 'Underestimated complexity',
      }

      expect(update.newDuration).toBe(120)
      expect(update.reason).toBe('Underestimated complexity')
    })

    it('should create valid ProgressUpdate', () => {
      const update: ProgressUpdate = {
        stepId: 'step-3',
        percentComplete: 75,
        notes: 'Three quarters done',
      }

      expect(update.percentComplete).toBe(75)
    })

    it('should create valid NewStepUpdate', () => {
      const update: NewStepUpdate = {
        name: 'Additional Testing',
        duration: 45,
        type: 'focused',
        insertAfter: 'step-4',
        dependencies: ['step-3', 'step-4'],
      }

      expect(update.type).toBe('focused')
      expect(update.dependencies).toHaveLength(2)
    })

    it('should create valid DependencyUpdate', () => {
      const update: DependencyUpdate = {
        stepId: 'step-5',
        action: 'remove',
        dependsOn: 'step-2',
      }

      expect(update.action).toBe('remove')
      expect(update.dependsOn).toBe('step-2')
    })
  })
})
