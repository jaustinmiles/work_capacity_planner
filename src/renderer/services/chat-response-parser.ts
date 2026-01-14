/**
 * Chat Response Parser
 *
 * Parses AI responses to extract text content and embedded amendments.
 * Amendments are embedded using <amendments>JSON</amendments> tags.
 */

import { Amendment, AmendmentType } from '@shared/amendment-types'
import { AmendmentCard, AmendmentPreview } from '@shared/conversation-types'
import { ViewType } from '@shared/enums'
import { generateUniqueId } from '@shared/step-id-utils'
import { extractTimeFromISO, formatDateStringForDisplay } from '@shared/time-utils'
import { getBlockTypeName } from '@shared/user-task-types'
import { useUserTaskTypeStore } from '../store/useUserTaskTypeStore'

/**
 * Format a date for display, handling both Date objects and ISO strings.
 * Date objects may come from fresh AI responses, strings from database round-trips.
 */
function formatDateForDisplay(date: Date | string): string {
  if (date instanceof Date) {
    return date.toLocaleDateString()
  }
  return formatDateStringForDisplay(date)
}

/**
 * Result of parsing an AI response.
 */
export interface ParsedResponse {
  /** The text content with amendment tags removed */
  content: string

  /** Extracted amendment cards (empty if no amendments) */
  amendments: AmendmentCard[]
}

/**
 * Parse an AI response to extract text and amendments.
 *
 * The AI can embed amendments in its response using the format:
 * ```
 * Some conversational text here.
 *
 * <amendments>
 * [{ "type": "task_creation", "name": "...", ... }]
 * </amendments>
 *
 * More text if needed.
 * ```
 *
 * @param response The raw AI response string
 * @returns Parsed content and amendment cards
 */
export function parseAIResponse(response: string): ParsedResponse {
  const amendmentRegex = /<amendments>([\s\S]*?)<\/amendments>/gi
  const amendments: AmendmentCard[] = []
  let content = response

  // Extract all amendment blocks
  let match
  while ((match = amendmentRegex.exec(response)) !== null) {
    const matchContent = match[1]
    if (!matchContent) continue
    const jsonContent = matchContent.trim()

    try {
      const parsed = JSON.parse(jsonContent)
      const amendmentArray = Array.isArray(parsed) ? parsed : [parsed]

      for (const amendment of amendmentArray) {
        if (isValidAmendment(amendment)) {
          amendments.push({
            id: generateUniqueId('amend'),
            amendment: amendment as Amendment,
            status: 'pending',
            preview: generatePreview(amendment as Amendment),
          })
        }
      }
    } catch (e) {
      console.warn('Failed to parse amendments JSON:', e, jsonContent)
    }
  }

  // Remove amendment tags from content
  content = content.replace(amendmentRegex, '').trim()

  // Clean up extra whitespace
  content = content.replace(/\n{3,}/g, '\n\n')

  return { content, amendments }
}

/**
 * Check if an object is a valid amendment.
 */
function isValidAmendment(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false
  const amendment = obj as Record<string, unknown>
  return typeof amendment.type === 'string'
}

/**
 * Generate a preview for an amendment.
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
        },
      }

    case AmendmentType.NoteAddition:
      return {
        title: 'Add Note',
        description: `Add note to "${amendment.target.name}"`,
        targetView: ViewType.Tasks,
        details: {
          target: amendment.target.name,
          note: amendment.note?.substring(0, 50) + (amendment.note && amendment.note.length > 50 ? '...' : ''),
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
        description: `${amendment.operation} work session`,
        targetView: ViewType.Timeline,
        details: {
          operation: amendment.operation,
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
        description: amendment.response?.substring(0, 100) || 'Query response',
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

/**
 * Helper to describe work pattern modifications.
 * Returns human-readable description with type name, date, and times.
 */
function getWorkPatternDescription(amendment: Amendment & { type: AmendmentType.WorkPatternModification }): string {
  const { operation, blockData, meetingData, date } = amendment

  // Format the date for display
  const dateStr = formatDateForDisplay(date)

  // Get user task types for looking up human-readable names
  const userTypes = useUserTaskTypeStore.getState().types

  switch (operation) {
    case 'add_block':
      if (blockData) {
        const typeName = getBlockTypeName(blockData.type, userTypes)
        const startTime = extractTimeFromISO(blockData.startTime)
        const endTime = extractTimeFromISO(blockData.endTime)
        return `Add ${typeName} block on ${dateStr} (${startTime} - ${endTime})`
      }
      return `Add work block on ${dateStr}`

    case 'remove_block':
      return `Remove work block on ${dateStr}`

    case 'modify_block':
      return `Modify work block on ${dateStr}`

    case 'add_meeting':
      if (meetingData) {
        const startTime = extractTimeFromISO(meetingData.startTime)
        const endTime = extractTimeFromISO(meetingData.endTime)
        return `Add meeting "${meetingData.name}" on ${dateStr} (${startTime} - ${endTime})`
      }
      return `Add meeting on ${dateStr}`

    case 'remove_meeting':
      return `Remove meeting on ${dateStr}`

    default:
      return `Modify schedule on ${dateStr}`
  }
}
