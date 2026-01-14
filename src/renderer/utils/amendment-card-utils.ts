/**
 * Amendment Card Utilities
 *
 * Pure functions for amendment card display logic.
 * Extracted from AmendmentCard component for testability.
 */

import { AmendmentType } from '@shared/enums'
import { AmendmentCardStatus } from '@shared/conversation-types'

/**
 * Icon identifiers for amendment types.
 * Maps to Arco Design icons in the component.
 */
export type AmendmentIconType =
  | 'plus'
  | 'check'
  | 'clock'
  | 'calendar'
  | 'list'
  | 'edit'
  | 'bulb'

/**
 * Get icon identifier for an amendment type.
 * The component maps this to the actual icon component.
 */
export function getAmendmentIconType(type: AmendmentType): AmendmentIconType {
  switch (type) {
    case AmendmentType.TaskCreation:
    case AmendmentType.WorkflowCreation:
      return 'plus'
    case AmendmentType.StatusUpdate:
      return 'check'
    case AmendmentType.DurationChange:
    case AmendmentType.TimeLog:
      return 'clock'
    case AmendmentType.WorkPatternModification:
    case AmendmentType.DeadlineChange:
      return 'calendar'
    case AmendmentType.StepAddition:
    case AmendmentType.StepRemoval:
      return 'list'
    case AmendmentType.NoteAddition:
    case AmendmentType.PriorityChange:
    case AmendmentType.TypeChange:
      return 'edit'
    case AmendmentType.DependencyChange:
    case AmendmentType.ArchiveToggle:
    case AmendmentType.WorkSessionEdit:
    case AmendmentType.QueryResponse:
    case AmendmentType.TaskTypeCreation:
    default:
      return 'bulb'
  }
}

/**
 * Arco Design color names for amendment types.
 */
export type AmendmentColorName = 'arcoblue' | 'green' | 'purple' | 'orangered' | 'gray'

/**
 * Get Arco Design color name for an amendment type.
 */
export function getAmendmentColor(type: AmendmentType): AmendmentColorName {
  switch (type) {
    case AmendmentType.TaskCreation:
    case AmendmentType.WorkflowCreation:
      return 'arcoblue'
    case AmendmentType.StatusUpdate:
      return 'green'
    case AmendmentType.WorkPatternModification:
      return 'purple'
    case AmendmentType.DurationChange:
    case AmendmentType.TimeLog:
      return 'orangered'
    default:
      return 'gray'
  }
}

/**
 * Status flags for amendment card rendering.
 */
export interface AmendmentStatusFlags {
  isPending: boolean
  isApplied: boolean
  isSkipped: boolean
}

/**
 * Get status flags from amendment card status.
 */
export function getAmendmentStatusFlags(status: AmendmentCardStatus): AmendmentStatusFlags {
  return {
    isPending: status === 'pending',
    isApplied: status === 'applied',
    isSkipped: status === 'skipped',
  }
}

/**
 * Maximum number of workflow steps to show in preview.
 */
export const MAX_PREVIEW_STEPS = 5

/**
 * Format workflow steps for preview display.
 * Returns visible steps and overflow count.
 */
export function formatWorkflowSteps(
  steps: string[],
  maxVisible: number = MAX_PREVIEW_STEPS,
): { visibleSteps: string[]; overflowCount: number } {
  if (!steps || steps.length === 0) {
    return { visibleSteps: [], overflowCount: 0 }
  }

  const visibleSteps = steps.slice(0, maxVisible)
  const overflowCount = Math.max(0, steps.length - maxVisible)

  return { visibleSteps, overflowCount }
}

/**
 * Format duration for display (e.g., "90 min" or "1h 30min").
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) {
    return '0 min'
  }

  if (minutes < 60) {
    return `${minutes} min`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (remainingMinutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${remainingMinutes}min`
}

/**
 * Get border color CSS variable based on status.
 */
export function getCardBorderColor(status: AmendmentCardStatus): string {
  switch (status) {
    case 'applied':
      return 'var(--color-success-light-4)'
    case 'skipped':
      return 'var(--color-border-2)'
    case 'pending':
    default:
      return 'var(--color-border)'
  }
}

/**
 * Get background color CSS variable based on status.
 */
export function getCardBackgroundColor(status: AmendmentCardStatus): string {
  switch (status) {
    case 'applied':
      return 'var(--color-success-light-1)'
    case 'skipped':
      return 'var(--color-fill-2)'
    case 'pending':
    default:
      return 'var(--color-bg-1)'
  }
}

/**
 * Get opacity based on status.
 */
export function getCardOpacity(status: AmendmentCardStatus): number {
  return status === 'skipped' ? 0.7 : 1
}
