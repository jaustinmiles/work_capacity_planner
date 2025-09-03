import { Task, TaskStep } from './types'
import { TaskType, TaskStatus, StepStatus } from './enums'

// Re-export TaskStep for backward compatibility
export type { TaskStep }

export interface ConditionalBranch {
  id: string
  condition: string // human-readable description
  probability: number // 0-1, likelihood this branch will be taken
  additionalSteps: TaskStep[] // steps to add if this condition occurs
  repeatFromStepId?: string // step to restart from if needed
}

// SequencedTask is now just a Task with hasSteps=true
// This type alias helps with migration
export type SequencedTask = Task & {
  steps: TaskStep[]
  hasSteps: true
}

export interface WorkflowExecution {
  taskId: string
  executionId: string
  startedAt: Date
  completedAt?: Date

  // Track which branches were taken
  executedSteps: {
    stepId: string
    startedAt: Date
    completedAt?: Date
    actualDuration?: number
    branchesTaken?: string[]
  }[]

  // Current state
  currentStepId?: string
  isWaitingForAsync: boolean
  waitingSince?: Date
}

// Helper function to create a workflow task
export function createWorkflowTask(params: {
  name: string
  importance: number
  urgency: number
  type: TaskType
  steps: Omit<TaskStep, 'id' | 'taskId'>[]
  notes?: string
  sessionId: string
}): Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'> {
  const steps: TaskStep[] = params.steps.map((step, index) => ({
    ...step,
    id: `step-${index}`,
    taskId: '', // Will be set when saved
    stepIndex: index,
    status: step.status || StepStatus.Pending,
    percentComplete: step.percentComplete || 0,
    dependsOn: step.dependsOn || [],
  }))

  const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0)
  const criticalPathDuration = calculateCriticalPath(steps)
  const worstCaseDuration = calculateWorstCase(steps)

  return {
    name: params.name,
    duration: totalDuration,
    importance: params.importance,
    urgency: params.urgency,
    type: params.type,
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    notes: params.notes,
    sessionId: params.sessionId,
    hasSteps: true,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration,
    worstCaseDuration,
    steps,
  }
}

function calculateCriticalPath(steps: TaskStep[]): number {
  // Simplified critical path calculation
  // In reality, this would need to consider dependencies
  return steps.reduce((sum, step) => sum + step.duration + step.asyncWaitTime, 0)
}

function calculateWorstCase(steps: TaskStep[]): number {
  // Simplified worst case calculation
  // Would need to consider conditional branches
  return steps.reduce((sum, step) => sum + step.duration + step.asyncWaitTime, 0) * 1.5
}

// Example remains the same but uses the new structure
export const exampleSequencedTask: SequencedTask = {
  id: 'task-123',
  name: 'Feature Implementation with CI/CD and Code Review',
  duration: 365,
  importance: 8,
  urgency: 7,
  type: TaskType.Focused,
  asyncWaitTime: 0,
  dependencies: [],
  completed: false,
  completedAt: undefined,
  actualDuration: undefined,
  deadline: undefined,
  projectId: undefined,
  sessionId: 'default-session',
  createdAt: new Date(),
  updatedAt: new Date(),
  notes: 'Complex workflow with async waits and conditional branches',
  hasSteps: true,
  currentStepId: undefined,
  overallStatus: TaskStatus.NotStarted,
  criticalPathDuration: 425,
  worstCaseDuration: 1200,
  steps: [
    {
      id: 'step-1',
      taskId: 'task-123',
      name: 'Data Mining',
      duration: 120,
      type: TaskType.Focused,
      dependsOn: [],
      asyncWaitTime: 0,
      status: StepStatus.Pending,
      stepIndex: 0,
      percentComplete: 0,
    },
    {
      id: 'step-2',
      taskId: 'task-123',
      name: 'Code Authoring',
      duration: 180,
      type: TaskType.Focused,
      dependsOn: ['step-1'],
      asyncWaitTime: 0,
      status: StepStatus.Pending,
      stepIndex: 1,
      percentComplete: 0,
    },
    {
      id: 'step-3',
      taskId: 'task-123',
      name: 'Workflow Running',
      duration: 15,
      type: TaskType.Admin,
      dependsOn: ['step-2'],
      asyncWaitTime: 60,
      status: StepStatus.Pending,
      stepIndex: 2,
      percentComplete: 0,
    },
    {
      id: 'step-4',
      taskId: 'task-123',
      name: 'Verification',
      duration: 30,
      type: TaskType.Focused,
      dependsOn: ['step-3'],
      asyncWaitTime: 0,
      status: StepStatus.Pending,
      stepIndex: 3,
      percentComplete: 0,
    },
    {
      id: 'step-5',
      taskId: 'task-123',
      name: 'CL Process (Submit for Review)',
      duration: 20,
      type: TaskType.Admin,
      dependsOn: ['step-4'],
      asyncWaitTime: 480,
      status: StepStatus.Pending,
      stepIndex: 4,
      percentComplete: 0,
    },
  ],
}
