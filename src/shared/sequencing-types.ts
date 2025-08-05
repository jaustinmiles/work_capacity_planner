import { Task } from './types'

export interface TaskStep {
  id: string
  name: string
  duration: number // minutes
  type: 'focused' | 'admin'
  
  // Dependency relationships
  dependsOn: string[] // step IDs that must complete before this step
  asyncWaitTime: number // time to wait after step completion
  
  // Conditional execution
  conditionalBranches?: ConditionalBranch[]
  
  // Status tracking
  status: 'pending' | 'in_progress' | 'waiting' | 'completed' | 'skipped'
  completedAt?: Date
  actualDuration?: number
}

export interface ConditionalBranch {
  id: string
  condition: string // human-readable description
  probability: number // 0-1, likelihood this branch will be taken
  additionalSteps: TaskStep[] // steps to add if this condition occurs
  repeatFromStepId?: string // step to restart from if needed
}

export interface SequencedTask extends Omit<Task, 'duration' | 'asyncWaitTime'> {
  steps: TaskStep[]
  
  // Calculated fields
  totalDuration: number // sum of all step durations
  criticalPathDuration: number // longest path through the workflow
  worstCaseDuration: number // duration including all conditional branches
  
  // Workflow status
  currentStepId?: string
  overallStatus: 'not_started' | 'in_progress' | 'waiting' | 'completed'
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

// Example of your described workflow:
export const exampleSequencedTask: SequencedTask = {
  id: "task-123",
  name: "Feature Implementation with CI/CD and Code Review",
  importance: 8,
  urgency: 7,
  type: 'focused',
  dependencies: [],
  completed: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  notes: "Complex workflow with async waits and conditional branches",
  
  steps: [
    {
      id: "step-1",
      name: "Data Mining",
      duration: 120, // 2 hours
      type: 'focused',
      dependsOn: [],
      asyncWaitTime: 0,
      status: 'pending'
    },
    {
      id: "step-2", 
      name: "Code Authoring",
      duration: 180, // 3 hours
      type: 'focused',
      dependsOn: ["step-1"], // sequential after data mining
      asyncWaitTime: 0,
      status: 'pending'
    },
    {
      id: "step-3",
      name: "Workflow Running", 
      duration: 15, // 15 minutes to trigger
      type: 'admin',
      dependsOn: ["step-2"],
      asyncWaitTime: 60, // wait 1 hour for workflow to complete
      status: 'pending'
    },
    {
      id: "step-4",
      name: "Verification",
      duration: 30, // 30 minutes
      type: 'focused', 
      dependsOn: ["step-3"],
      asyncWaitTime: 0,
      status: 'pending',
      conditionalBranches: [{
        id: "branch-1",
        condition: "Verification fails, need to fix and re-run workflow",
        probability: 0.4, // 40% chance
        additionalSteps: [], // will repeat from step-2
        repeatFromStepId: "step-2"
      }]
    },
    {
      id: "step-5",
      name: "CL Process (Submit for Review)",
      duration: 20, // 20 minutes to create PR
      type: 'admin',
      dependsOn: ["step-4"],
      asyncWaitTime: 480, // 8 hours for review (worst case)
      status: 'pending',
      conditionalBranches: [{
        id: "branch-2", 
        condition: "Review feedback requires changes",
        probability: 0.6, // 60% chance
        additionalSteps: [
          {
            id: "step-5a",
            name: "Address Review Feedback",
            duration: 90,
            type: 'focused',
            dependsOn: ["step-5"],
            asyncWaitTime: 240, // 4 hours for re-review
            status: 'pending'
          }
        ]
      }]
    }
  ],
  
  totalDuration: 365, // sum of all step durations
  criticalPathDuration: 425, // including async waits on critical path
  worstCaseDuration: 1200, // including all branches and retries
  overallStatus: 'not_started'
}