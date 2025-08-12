import { useCallback, useEffect, useMemo } from 'react'
import { useTaskStore } from '../store/useTaskStore'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'

export interface WorkflowProgressStats {
  totalSteps: number
  completedSteps: number
  inProgressSteps: number
  totalEstimatedMinutes: number
  totalActualMinutes: number
  completionPercentage: number
  remainingEstimatedMinutes: number
  accuracyRatio: number | null // actual/estimated
}

export interface UseWorkflowProgressReturn {
  // State
  activeWorkSessions: Map<string, any>
  workSessionHistory: any[]
  
  // Actions
  startWork: (stepId: string) => void
  pauseWork: (stepId: string) => void
  completeStep: (stepId: string, actualMinutes?: number, notes?: string) => Promise<void>
  updateProgress: (stepId: string, percentComplete: number) => Promise<void>
  logTime: (stepId: string, minutes: number, notes?: string) => Promise<void>
  
  // Computed
  getStepProgress: (stepId: string) => {
    isActive: boolean
    isPaused: boolean
    elapsedMinutes: number
    percentComplete: number
  }
  getWorkflowStats: (workflowId: string) => WorkflowProgressStats
  getStepStats: (stepId: string) => {
    estimatedMinutes: number
    actualMinutes: number
    percentComplete: number
    status: string
  }
}

export function useWorkflowProgress(workflowId?: string): UseWorkflowProgressReturn {
  const store = useTaskStore()
  const workflow = workflowId ? store.getSequencedTaskById(workflowId) : undefined

  // Load work session history for current workflow steps on mount
  useEffect(() => {
    if (workflow) {
      // Load history for the first incomplete step
      const firstIncompleteStep = workflow.steps.find(s => s.status !== 'completed')
      if (firstIncompleteStep) {
        store.loadWorkSessionHistory(firstIncompleteStep.id)
      }
    }
  }, [workflow?.id])

  const startWork = useCallback((stepId: string) => {
    store.startWorkOnStep(stepId, workflowId || '')
  }, [store, workflowId])

  const pauseWork = useCallback((stepId: string) => {
    store.pauseWorkOnStep(stepId)
  }, [store])

  const completeStep = useCallback(async (stepId: string, actualMinutes?: number, notes?: string) => {
    await store.completeStep(stepId, actualMinutes, notes)
  }, [store])

  const updateProgress = useCallback(async (stepId: string, percentComplete: number) => {
    await store.updateStepProgress(stepId, percentComplete)
  }, [store])

  const logTime = useCallback(async (stepId: string, minutes: number, notes?: string) => {
    await store.logWorkSession(stepId, minutes, notes)
  }, [store])

  const getStepProgress = useCallback((stepId: string) => {
    const session = store.getActiveWorkSession(stepId)
    const step = workflow?.steps.find(s => s.id === stepId)
    
    let elapsedMinutes = 0
    if (session) {
      const elapsed = session.isPaused ? 0 : Date.now() - new Date(session.startTime).getTime()
      elapsedMinutes = session.duration + Math.floor(elapsed / 60000)
    }

    return {
      isActive: !!session && !session.isPaused,
      isPaused: !!session?.isPaused,
      elapsedMinutes,
      percentComplete: step?.percentComplete || 0,
    }
  }, [store, workflow])

  const getWorkflowStats = useCallback((workflowId: string): WorkflowProgressStats => {
    const task = store.getSequencedTaskById(workflowId)
    if (!task) {
      return {
        totalSteps: 0,
        completedSteps: 0,
        inProgressSteps: 0,
        totalEstimatedMinutes: 0,
        totalActualMinutes: 0,
        completionPercentage: 0,
        remainingEstimatedMinutes: 0,
        accuracyRatio: null,
      }
    }

    const stats = task.steps.reduce((acc, step) => {
      acc.totalSteps++
      acc.totalEstimatedMinutes += step.duration

      if (step.status === 'completed') {
        acc.completedSteps++
        acc.totalActualMinutes += step.actualDuration || 0
      } else if (step.status === 'in_progress') {
        acc.inProgressSteps++
        // Add current session time if active
        const progress = getStepProgress(step.id)
        if (progress.isActive || progress.isPaused) {
          acc.totalActualMinutes += progress.elapsedMinutes
        }
      } else {
        // For incomplete steps, add to remaining time
        acc.remainingEstimatedMinutes += step.duration * (1 - (step.percentComplete || 0) / 100)
      }

      return acc
    }, {
      totalSteps: 0,
      completedSteps: 0,
      inProgressSteps: 0,
      totalEstimatedMinutes: 0,
      totalActualMinutes: 0,
      remainingEstimatedMinutes: 0,
    })

    const completionPercentage = stats.totalSteps > 0
      ? Math.round((stats.completedSteps / stats.totalSteps) * 100)
      : 0

    const accuracyRatio = stats.totalActualMinutes > 0 && stats.completedSteps > 0
      ? stats.totalActualMinutes / (stats.totalEstimatedMinutes * (stats.completedSteps / stats.totalSteps))
      : null

    return {
      ...stats,
      completionPercentage,
      accuracyRatio,
    }
  }, [store, getStepProgress])

  const getStepStats = useCallback((stepId: string) => {
    const step = workflow?.steps.find(s => s.id === stepId)
    if (!step) {
      return {
        estimatedMinutes: 0,
        actualMinutes: 0,
        percentComplete: 0,
        status: 'unknown',
      }
    }

    const progress = getStepProgress(stepId)
    const actualMinutes = step.actualDuration || progress.elapsedMinutes

    return {
      estimatedMinutes: step.duration,
      actualMinutes,
      percentComplete: step.percentComplete || 0,
      status: step.status,
    }
  }, [workflow, getStepProgress])

  return {
    activeWorkSessions: store.activeWorkSessions,
    workSessionHistory: store.workSessionHistory,
    startWork,
    pauseWork,
    completeStep,
    updateProgress,
    logTime,
    getStepProgress,
    getWorkflowStats,
    getStepStats,
  }
}