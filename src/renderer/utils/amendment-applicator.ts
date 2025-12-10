/**
 * Applies amendments to tasks and workflows
 */

import {
  Amendment,
  AmendmentType,
  StatusUpdate,
  TimeLog,
  NoteAddition,
  DurationChange,
  StepAddition,
  StepRemoval,
  TaskCreation,
  WorkflowCreation,
  DependencyChange,
  DeadlineChange,
  PriorityChange,
  TypeChange,
  ArchiveToggle,
  WorkPatternModification,
  WorkSessionEdit,
  TaskTypeCreation,
} from '@shared/amendment-types'
import { assertNever } from '@shared/enums'
import { extractTimeFromISO } from '@shared/time-utils'
import { getDatabase } from '../services/database'
import { logger } from '@/logger'
import { useTaskStore } from '../store/useTaskStore'
import { useUserTaskTypeStore } from '../store/useUserTaskTypeStore'
import { resolveAmendmentTargets } from './target-resolver'
import { getBlockTypeName } from '@shared/user-task-types'
import { Message } from '../components/common/Message'
import { WorkPatternOperation } from '@shared/enums'
import type { HandlerContext } from './amendment-handlers'
import {
  handleStatusUpdate,
  handleTimeLog,
  handleNoteAddition,
  handleDurationChange,
  handleTaskCreation,
  handleDeadlineChange,
  handlePriorityChange,
  handleTypeChange,
  handleArchiveToggle,
  handleWorkflowCreation,
  handleStepAddition,
  handleStepRemoval,
  handleDependencyChange,
  handleWorkPatternModification,
  handleWorkSessionEdit,
  handleTaskTypeCreation,
} from './amendment-handlers'

/**
 * Result for a single amendment application
 */
export interface AmendmentResult {
  amendment: Amendment
  success: boolean
  message: string
}

/**
 * Summary of all amendment applications
 */
export interface ApplyAmendmentsResult {
  successCount: number
  errorCount: number
  results: AmendmentResult[]
}

/**
 * Get a human-readable summary of an amendment for display
 */
function getAmendmentDescription(amendment: Amendment): string {
  switch (amendment.type) {
    case AmendmentType.TaskCreation:
      return `Create task "${amendment.name}"`
    case AmendmentType.WorkflowCreation:
      return `Create workflow "${amendment.name}" (${amendment.steps.length} steps)`
    case AmendmentType.StatusUpdate:
      return `Update ${amendment.target.name} → ${amendment.newStatus}`
    case AmendmentType.TimeLog:
      return `Log ${amendment.duration}min on ${amendment.target.name}`
    case AmendmentType.NoteAddition:
      return `Add note to ${amendment.target.name}`
    case AmendmentType.DurationChange:
      return `Change ${amendment.target.name} duration to ${amendment.newDuration}min`
    case AmendmentType.StepAddition:
      return `Add step "${amendment.stepName}" to ${amendment.workflowTarget.name}`
    case AmendmentType.StepRemoval:
      return `Remove step "${amendment.stepName}" from ${amendment.workflowTarget.name}`
    case AmendmentType.DependencyChange:
      return `Update dependencies for ${amendment.target.name}`
    case AmendmentType.DeadlineChange:
      return `Set deadline for ${amendment.target.name}`
    case AmendmentType.PriorityChange:
      return `Update priority for ${amendment.target.name}`
    case AmendmentType.TypeChange:
      return `Change ${amendment.target.name} type to ${amendment.newType}`
    case AmendmentType.WorkPatternModification: {
      const mod = amendment as WorkPatternModification
      // Show specific operation details for better user understanding
      if (mod.operation === WorkPatternOperation.AddBlock && mod.blockData) {
        const start = extractTimeFromISO(mod.blockData.startTime)
        const end = extractTimeFromISO(mod.blockData.endTime)
        const typeName = getBlockTypeName(mod.blockData.type, useUserTaskTypeStore.getState().types)
        return `Add ${typeName} block ${start} - ${end}`
      }
      if (mod.operation === WorkPatternOperation.AddMeeting && mod.meetingData) {
        const start = extractTimeFromISO(mod.meetingData.startTime)
        const end = extractTimeFromISO(mod.meetingData.endTime)
        return `Add meeting "${mod.meetingData.name}" ${start} - ${end}`
      }
      if (mod.operation === WorkPatternOperation.RemoveBlock) {
        return 'Remove block'
      }
      if (mod.operation === WorkPatternOperation.RemoveMeeting) {
        return 'Remove meeting'
      }
      return `${mod.operation} work pattern`
    }
    case AmendmentType.WorkSessionEdit:
      return `${amendment.operation} work session`
    case AmendmentType.ArchiveToggle:
      return `${amendment.archive ? 'Archive' : 'Unarchive'} ${amendment.target.name}`
    case AmendmentType.QueryResponse:
      return 'Query response (no changes)'
    case AmendmentType.TaskTypeCreation:
      return `Create task type "${amendment.name}"`
  }
}

export async function applyAmendments(amendments: Amendment[]): Promise<ApplyAmendmentsResult> {
  const db = getDatabase()

  // CRITICAL: Resolve target names to IDs before processing
  // The AI generates amendments with target names but no IDs
  logger.ui.info('Resolving amendment targets', {
    amendmentCount: amendments.length,
    types: amendments.map(a => a.type),
  }, 'target-resolution-start')
  await resolveAmendmentTargets(amendments, db)

  let successCount = 0
  let errorCount = 0
  const results: AmendmentResult[] = []

  /**
   * Helper to record a failed amendment
   */
  function recordError(amendment: Amendment, message: string): void {
    errorCount++
    results.push({ amendment, success: false, message })
  }

  // Track the current amendment's success/error status
  let currentAmendmentFailed = false
  let currentAmendmentError = ''

  /**
   * Mark current amendment as failed (called from existing error paths)
   */
  function markFailed(error: string): void {
    currentAmendmentFailed = true
    currentAmendmentError = error
  }

  // Track newly created task IDs to resolve placeholders
  const createdTaskMap = new Map<string, string>() // placeholder -> actual ID

  // Create handler context
  const ctx: HandlerContext = {
    db,
    markFailed,
    createdTaskMap,
  }

  for (const amendment of amendments) {
    // Reset tracking for this amendment
    currentAmendmentFailed = false
    currentAmendmentError = ''
    const amendmentDesc = getAmendmentDescription(amendment)
    // Track original counts to detect if this amendment changed them
    const prevSuccessCount = successCount
    const prevErrorCount = errorCount

    try {
      switch (amendment.type) {
        case AmendmentType.StatusUpdate:
          await handleStatusUpdate(amendment as StatusUpdate, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.TimeLog:
          await handleTimeLog(amendment as TimeLog, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.NoteAddition:
          await handleNoteAddition(amendment as NoteAddition, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.DurationChange:
          await handleDurationChange(amendment as DurationChange, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.StepAddition:
          await handleStepAddition(amendment as StepAddition, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.StepRemoval:
          await handleStepRemoval(amendment as StepRemoval, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.DependencyChange:
          await handleDependencyChange(amendment as DependencyChange, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.TaskCreation:
          await handleTaskCreation(amendment as TaskCreation, ctx, amendments)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.WorkflowCreation:
          await handleWorkflowCreation(amendment as WorkflowCreation, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.DeadlineChange:
          await handleDeadlineChange(amendment as DeadlineChange, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.PriorityChange:
          await handlePriorityChange(amendment as PriorityChange, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.TypeChange:
          await handleTypeChange(amendment as TypeChange, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.WorkPatternModification:
          await handleWorkPatternModification(amendment as WorkPatternModification, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.WorkSessionEdit:
          await handleWorkSessionEdit(amendment as WorkSessionEdit, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.ArchiveToggle:
          await handleArchiveToggle(amendment as ArchiveToggle, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        case AmendmentType.QueryResponse:
          // QueryResponse doesn't modify anything, just informational
          // No action needed
          break

        case AmendmentType.TaskTypeCreation:
          await handleTaskTypeCreation(amendment as TaskTypeCreation, ctx)
          if (!currentAmendmentFailed) successCount++
          else errorCount++
          break

        default: {
          // This will cause a compile-time error if we miss any enum values
          const _exhaustiveCheck: never = amendment
          assertNever(_exhaustiveCheck)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.ui.error('Error applying amendment', {
        error: errorMessage,
        amendmentType: amendment.type,
      }, 'amendment-apply-error')
      // Only record if we haven't already tracked this amendment
      if (successCount === prevSuccessCount && errorCount === prevErrorCount) {
        recordError(amendment, errorMessage)
      }
    }

    // Record result based on what happened during this amendment
    // If counts didn't change in the switch, record based on markFailed flag
    if (successCount === prevSuccessCount && errorCount === prevErrorCount) {
      // Nothing was recorded yet - use the tracking flags
      if (currentAmendmentFailed) {
        results.push({ amendment, success: false, message: currentAmendmentError || 'Unknown error' })
      } else {
        // No explicit success/error - assume success for amendments that don't increment counts
        results.push({ amendment, success: true, message: amendmentDesc })
      }
    } else if (successCount > prevSuccessCount) {
      // Success was recorded via successCount++
      results.push({ amendment, success: true, message: amendmentDesc })
    } else if (errorCount > prevErrorCount) {
      // Error was recorded via errorCount++
      results.push({ amendment, success: false, message: currentAmendmentError || amendmentDesc })
    }
  }

  // Update stores if any amendments succeeded
  if (successCount > 0) {
    await useTaskStore.getState().initializeData()
    // Schedule will automatically recompute via reactive subscriptions
  }

  // Show summary messages (for backwards compatibility with existing behavior)
  if (successCount > 0 && errorCount === 0) {
    Message.success(`Applied ${successCount} amendment${successCount > 1 ? 's' : ''}`)
  } else if (successCount > 0 && errorCount > 0) {
    Message.success(`Applied ${successCount} amendment${successCount > 1 ? 's' : ''}`)
    Message.error(`Failed to apply ${errorCount} amendment${errorCount > 1 ? 's' : ''}`)
  } else if (errorCount > 0) {
    Message.error(`Failed to apply ${errorCount} amendment${errorCount > 1 ? 's' : ''}`)
  }

  return {
    successCount,
    errorCount,
    results,
  }
}
