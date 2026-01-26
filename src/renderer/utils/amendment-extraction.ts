/**
 * Amendment Extraction Utilities
 *
 * Pure functions for extracting and parsing amendments from AI responses.
 * These are separated from the orchestration layer for testability.
 */

import { Amendment, AmendmentType } from '@shared/amendment-types'
import { AmendmentPreview } from '@shared/conversation-types'
import { ViewType } from '@shared/enums'

// =============================================================================
// Constants
// =============================================================================

/** Regex pattern for matching amendment blocks */
export const AMENDMENT_TAG_REGEX = /<amendments>([\s\S]*?)<\/amendments>/gi

// =============================================================================
// Extraction Functions
// =============================================================================

/**
 * Extract all amendment JSON blocks from a response string.
 *
 * @param response - The raw AI response containing <amendments> tags
 * @returns Array of raw JSON strings found within amendment tags
 */
export function extractAmendmentBlocks(response: string): string[] {
  const blocks: string[] = []
  const regex = new RegExp(AMENDMENT_TAG_REGEX.source, 'gi')

  let match
  while ((match = regex.exec(response)) !== null) {
    const content = match[1]
    if (content) {
      blocks.push(content.trim())
    }
  }

  return blocks
}

/**
 * Remove all amendment tags from a response string.
 *
 * @param response - The raw AI response
 * @returns The response with all <amendments>...</amendments> blocks removed
 */
export function removeAmendmentTags(response: string): string {
  return response.replace(new RegExp(AMENDMENT_TAG_REGEX.source, 'gi'), '')
}

/**
 * Parse a JSON string into an array of amendments.
 *
 * Handles both single objects and arrays:
 * - `{ "type": "task_creation", ... }` -> [amendment]
 * - `[{ ... }, { ... }]` -> [amendment, amendment]
 *
 * @param jsonString - The JSON string to parse
 * @returns Array of parsed objects (not validated), or null if parsing fails
 */
export function parseAmendmentJSON(jsonString: string): unknown[] | null {
  try {
    const parsed = JSON.parse(jsonString)

    // Normalize to array
    if (Array.isArray(parsed)) {
      return parsed
    } else {
      return [parsed]
    }
  } catch {
    return null
  }
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Check if an object is a valid amendment (has required type field).
 *
 * @param obj - The object to validate
 * @returns true if the object has a string type field
 */
export function isValidAmendment(obj: unknown): obj is Amendment {
  if (!obj || typeof obj !== 'object') return false
  const amendment = obj as Record<string, unknown>
  return typeof amendment.type === 'string'
}

/**
 * Check if a string is a valid amendment type.
 *
 * @param type - The type string to check
 * @returns true if it's a known AmendmentType
 */
export function isKnownAmendmentType(type: string): type is AmendmentType {
  return Object.values(AmendmentType).includes(type as AmendmentType)
}

// =============================================================================
// Content Normalization
// =============================================================================

/**
 * Normalize whitespace in content (collapse multiple newlines).
 *
 * @param content - The content to normalize
 * @returns Content with 3+ consecutive newlines collapsed to 2
 */
export function normalizeWhitespace(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Clean AI response content by removing tags and normalizing whitespace.
 *
 * @param response - The raw AI response
 * @returns Cleaned content ready for display
 */
export function cleanResponseContent(response: string): string {
  const withoutTags = removeAmendmentTags(response)
  return normalizeWhitespace(withoutTags)
}

// =============================================================================
// Preview Generation
// =============================================================================

/**
 * Generate a user-friendly preview for an amendment.
 *
 * @param amendment - The amendment to generate preview for
 * @returns Preview object with title, description, and details
 */
export function generatePreview(amendment: Amendment): AmendmentPreview {
  switch (amendment.type) {
    case AmendmentType.TaskCreation:
      return {
        title: 'Create Task',
        description: `"${amendment.name}" (${amendment.duration} min)`,
        targetView: ViewType.Tasks,
        details: {
          name: amendment.name,
          duration: amendment.duration,
          importance: amendment.importance,
          urgency: amendment.urgency,
        },
      }

    case AmendmentType.WorkflowCreation:
      return {
        title: 'Create Workflow',
        description: `"${amendment.name}" with ${amendment.steps?.length || 0} steps`,
        targetView: ViewType.Workflows,
        details: {
          name: amendment.name,
          steps: amendment.steps?.map((s) => s.name),
          estimatedDuration: amendment.steps?.reduce((acc, s) => acc + s.duration, 0),
        },
      }

    case AmendmentType.StatusUpdate:
      return {
        title: 'Update Status',
        description: `Set "${amendment.target.name}" to ${amendment.newStatus}`,
        targetView: ViewType.Tasks,
        details: {
          target: amendment.target.name,
          newStatus: amendment.newStatus,
        },
      }

    case AmendmentType.TimeLog:
      return {
        title: 'Log Time',
        description: `Log ${amendment.duration} min to "${amendment.target.name}"`,
        targetView: ViewType.Timeline,
        details: {
          target: amendment.target.name,
          duration: amendment.duration,
          date: amendment.date,
          startTime: amendment.startTime,
          endTime: amendment.endTime,
          description: amendment.description,
        },
      }

    case AmendmentType.NoteAddition:
      return {
        title: 'Add Note',
        description: `Add note to "${amendment.target.name}"`,
        targetView: ViewType.Tasks,
        details: {
          target: amendment.target.name,
          note: truncateText(amendment.note || '', 50),
        },
      }

    case AmendmentType.DurationChange:
      return {
        title: 'Update Duration',
        description: `Change "${amendment.target.name}" to ${amendment.newDuration} min`,
        targetView: ViewType.Tasks,
        details: {
          target: amendment.target.name,
          newDuration: amendment.newDuration,
        },
      }

    case AmendmentType.StepAddition:
      return {
        title: 'Add Step',
        description: `Add "${amendment.stepName}" to workflow`,
        targetView: ViewType.Workflows,
        details: {
          stepName: amendment.stepName,
          duration: amendment.duration,
        },
      }

    case AmendmentType.StepRemoval:
      return {
        title: 'Remove Step',
        description: `Remove "${amendment.stepName}" from workflow`,
        targetView: ViewType.Workflows,
        details: {
          stepName: amendment.stepName,
        },
      }

    case AmendmentType.DependencyChange: {
      // Build a descriptive summary of what's changing
      const targetName = amendment.stepName || amendment.target?.name || 'item'
      const parts: string[] = []
      if (amendment.addDependencies?.length) {
        parts.push(`add: ${amendment.addDependencies.join(', ')}`)
      }
      if (amendment.removeDependencies?.length) {
        parts.push(`remove: ${amendment.removeDependencies.join(', ')}`)
      }
      if (amendment.addDependents?.length) {
        parts.push(`dependents add: ${amendment.addDependents.join(', ')}`)
      }
      if (amendment.removeDependents?.length) {
        parts.push(`dependents remove: ${amendment.removeDependents.join(', ')}`)
      }
      const changesSummary = parts.length > 0 ? ` (${parts.join('; ')})` : ''

      return {
        title: 'Update Dependencies',
        description: `Modify dependencies for "${targetName}"${changesSummary}`,
        targetView: ViewType.Workflows,
        details: {
          target: targetName,
          stepName: amendment.stepName,
          addDependencies: amendment.addDependencies,
          removeDependencies: amendment.removeDependencies,
          addDependents: amendment.addDependents,
          removeDependents: amendment.removeDependents,
        },
      }
    }

    case AmendmentType.DeadlineChange:
      return {
        title: 'Set Deadline',
        description: `Set deadline for "${amendment.target.name}"`,
        targetView: ViewType.Tasks,
        details: {
          target: amendment.target.name,
          deadline: amendment.newDeadline,
        },
      }

    case AmendmentType.PriorityChange:
      return {
        title: 'Update Priority',
        description: `Change priority of "${amendment.target.name}"`,
        targetView: ViewType.Tasks,
        details: {
          target: amendment.target.name,
          importance: amendment.importance,
          urgency: amendment.urgency,
        },
      }

    case AmendmentType.TypeChange:
      return {
        title: 'Change Type',
        description: `Change type of "${amendment.target.name}"`,
        targetView: ViewType.Tasks,
        details: {
          target: amendment.target.name,
          newType: amendment.newType,
        },
      }

    case AmendmentType.WorkPatternModification:
      return {
        title: 'Modify Schedule',
        description: getWorkPatternDescription(amendment),
        targetView: ViewType.Schedule,
        details: {
          date: amendment.date,
          operation: amendment.operation,
        },
      }

    case AmendmentType.WorkSessionEdit:
      return {
        title: 'Edit Work Session',
        description: `${capitalizeFirst(amendment.operation)} work session`,
        targetView: ViewType.Timeline,
        details: {
          operation: amendment.operation,
          startTime: amendment.startTime,
          endTime: amendment.endTime,
          plannedMinutes: amendment.plannedMinutes,
          taskId: amendment.taskId,
        },
      }

    case AmendmentType.ArchiveToggle:
      return {
        title: amendment.archive ? 'Archive' : 'Unarchive',
        description: `${amendment.archive ? 'Archive' : 'Unarchive'} "${amendment.target.name}"`,
        targetView: ViewType.Tasks,
        details: {
          target: amendment.target.name,
          archive: amendment.archive,
        },
      }

    case AmendmentType.TaskTypeCreation:
      return {
        title: 'Create Task Type',
        description: `Create "${amendment.name}" type with ${amendment.emoji}`,
        details: {
          name: amendment.name,
          emoji: amendment.emoji,
          color: amendment.color,
        },
      }

    case AmendmentType.QueryResponse:
      return {
        title: 'Information',
        description: truncateText(amendment.response || 'Query response', 100),
        details: {},
      }

    default:
      return {
        title: 'Amendment',
        description: 'Proposed change',
        details: {},
      }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a human-readable description for work pattern modifications.
 */
export function getWorkPatternDescription(
  amendment: Amendment & { type: AmendmentType.WorkPatternModification },
): string {
  const { operation, blockData, meetingData } = amendment

  switch (operation) {
    case 'add_block':
      if (blockData) {
        return `Add ${blockData.type} block`
      }
      return 'Add work block'

    case 'remove_block':
      return 'Remove work block'

    case 'modify_block':
      return 'Modify work block'

    case 'add_meeting':
      if (meetingData) {
        return `Add meeting: ${meetingData.name}`
      }
      return 'Add meeting'

    case 'remove_meeting':
      return 'Remove meeting'

    default:
      return 'Modify schedule'
  }
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalizeFirst(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}
