/**
 * Action Preview Generator
 *
 * Generates human-readable previews for write tool proposals.
 * These previews are displayed in the ProposedActionCard UI
 * so users can understand what the agent wants to do before approving.
 *
 * Accepts optional entityNames context to resolve IDs to human-readable names.
 */

import type { ActionPreview } from '../../shared/agent-types'

/**
 * Optional context for resolving entity IDs to display names.
 * Populated by the agent loop before generating previews.
 */
export interface PreviewEntityContext {
  taskNames?: Map<string, string>
  endeavorNames?: Map<string, string>
  typeNames?: Map<string, string>
}

/**
 * Generate a human-readable preview for a proposed write tool call.
 */
export function generateActionPreview(
  toolName: string,
  toolInput: Record<string, unknown>,
  entityContext?: PreviewEntityContext,
): ActionPreview {
  const resolveName = (id: string | unknown, map?: Map<string, string>): string => {
    if (!id || typeof id !== 'string') return String(id ?? 'unknown')
    return map?.get(id) ?? id
  }

  switch (toolName) {
    case 'create_task':
      return {
        title: 'Create Task',
        description: `"${toolInput.name}" — ${toolInput.duration}min, importance ${toolInput.importance}/10, urgency ${toolInput.urgency}/10`,
        details: {
          name: toolInput.name,
          duration: `${toolInput.duration} minutes`,
          importance: `${toolInput.importance}/10`,
          urgency: `${toolInput.urgency}/10`,
          type: resolveName(toolInput.type, entityContext?.typeNames),
          ...(toolInput.deadline ? { deadline: toolInput.deadline } : {}),
          ...(toolInput.notes ? { notes: toolInput.notes } : {}),
          ...(toolInput.cognitiveComplexity ? { cognitiveComplexity: `${toolInput.cognitiveComplexity}/5` } : {}),
        },
      }

    case 'update_task': {
      const taskName = resolveName(toolInput.id, entityContext?.taskNames)
      const fields = Object.keys(toolInput).filter(k => k !== 'id')
      const fieldSummaries: string[] = []
      for (const field of fields) {
        const val = toolInput[field]
        if (field === 'type') {
          fieldSummaries.push(`type → ${resolveName(val, entityContext?.typeNames)}`)
        } else if (field === 'importance' || field === 'urgency') {
          fieldSummaries.push(`${field} → ${val}/10`)
        } else if (field === 'duration') {
          fieldSummaries.push(`duration → ${val}min`)
        } else {
          fieldSummaries.push(`${field} → ${typeof val === 'string' && val.length > 30 ? val.substring(0, 30) + '...' : val}`)
        }
      }
      return {
        title: 'Update Task',
        description: `"${taskName}" — ${fieldSummaries.join(', ')}`,
        details: { taskName, ...toolInput },
      }
    }

    case 'complete_task': {
      const taskName = resolveName(toolInput.id, entityContext?.taskNames)
      return {
        title: 'Complete Task',
        description: toolInput.actualDuration
          ? `"${taskName}" — mark complete (${toolInput.actualDuration}min actual)`
          : `"${taskName}" — mark as completed`,
        details: { taskName, ...toolInput },
      }
    }

    case 'archive_task': {
      const taskName = resolveName(toolInput.id, entityContext?.taskNames)
      return {
        title: 'Archive Task',
        description: `"${taskName}" — move to archive`,
        details: { taskName, ...toolInput },
      }
    }

    case 'create_workflow': {
      const steps = toolInput.steps as Array<Record<string, unknown>> | undefined
      const stepCount = steps?.length ?? 0
      const totalDuration = steps?.reduce((sum, s) => sum + (s.duration as number), 0) ?? 0
      return {
        title: 'Create Workflow',
        description: `"${toolInput.name}" — ${stepCount} steps, ${totalDuration}min total`,
        details: {
          name: toolInput.name,
          type: resolveName(toolInput.type, entityContext?.typeNames),
          importance: `${toolInput.importance}/10`,
          urgency: `${toolInput.urgency}/10`,
          steps: steps?.map(s => `${s.name} (${s.duration}min)`),
        },
      }
    }

    case 'add_workflow_step': {
      const workflowName = resolveName(toolInput.workflowId, entityContext?.taskNames)
      return {
        title: 'Add Workflow Step',
        description: `"${toolInput.name}" (${toolInput.duration}min) → workflow "${workflowName}"`,
        details: {
          stepName: toolInput.name,
          workflowName,
          duration: `${toolInput.duration} minutes`,
          type: resolveName(toolInput.type, entityContext?.typeNames),
          ...(toolInput.afterStep ? { afterStep: toolInput.afterStep } : {}),
          ...(toolInput.beforeStep ? { beforeStep: toolInput.beforeStep } : {}),
        },
      }
    }

    case 'log_work_session': {
      const taskName = resolveName(toolInput.taskId, entityContext?.taskNames)
      const minutes = toolInput.actualMinutes ?? toolInput.duration
      return {
        title: 'Log Work Session',
        description: minutes
          ? `${minutes}min on "${taskName}"${toolInput.notes ? ` — "${toolInput.notes}"` : ''}`
          : `"${taskName}" starting at ${toolInput.startTime}`,
        details: {
          taskName,
          startTime: toolInput.startTime,
          ...(toolInput.endTime ? { endTime: toolInput.endTime } : {}),
          ...(minutes ? { minutes: `${minutes} minutes` } : {}),
          ...(toolInput.notes ? { notes: toolInput.notes } : {}),
        },
      }
    }

    case 'create_schedule': {
      const blocks = toolInput.blocks as Array<Record<string, unknown>> | undefined
      const meetings = toolInput.meetings as Array<Record<string, unknown>> | undefined
      const parts: string[] = []
      if (blocks?.length) parts.push(`${blocks.length} block${blocks.length > 1 ? 's' : ''}`)
      if (meetings?.length) parts.push(`${meetings.length} meeting${meetings.length > 1 ? 's' : ''}`)
      return {
        title: 'Create Schedule',
        description: `${toolInput.date} — ${parts.join(', ') || 'empty schedule'}`,
        details: {
          date: toolInput.date,
          blocks: blocks?.map(b => `${b.startTime}-${b.endTime}`),
          meetings: meetings?.map(m => `${(m as Record<string, unknown>).name} ${m.startTime}-${m.endTime}`),
        },
      }
    }

    case 'create_endeavor':
      return {
        title: 'Create Endeavor',
        description: `"${toolInput.name}"${toolInput.description ? ` — ${(toolInput.description as string).substring(0, 60)}` : ''}`,
        details: {
          name: toolInput.name,
          ...(toolInput.description ? { description: toolInput.description } : {}),
          ...(toolInput.importance ? { importance: `${toolInput.importance}/10` } : {}),
          ...(toolInput.urgency ? { urgency: `${toolInput.urgency}/10` } : {}),
          ...(toolInput.deadline ? { deadline: toolInput.deadline } : {}),
        },
      }

    case 'link_task_to_endeavor': {
      const taskName = resolveName(toolInput.taskId, entityContext?.taskNames)
      const endeavorName = resolveName(toolInput.endeavorId, entityContext?.endeavorNames)
      return {
        title: 'Link Task to Endeavor',
        description: `"${taskName}" → "${endeavorName}"`,
        details: { taskName, endeavorName },
      }
    }

    case 'manage_sprint': {
      const taskName = resolveName(toolInput.taskId, entityContext?.taskNames)
      return {
        title: toolInput.inActiveSprint ? 'Add to Sprint' : 'Remove from Sprint',
        description: toolInput.inActiveSprint
          ? `"${taskName}" — add to active sprint`
          : `"${taskName}" — remove from sprint`,
        details: { taskName, inActiveSprint: toolInput.inActiveSprint },
      }
    }

    case 'create_task_type':
      return {
        title: 'Create Task Type',
        description: `${toolInput.emoji} ${toolInput.name} (${toolInput.color})`,
        details: {
          name: toolInput.name,
          emoji: toolInput.emoji,
          color: toolInput.color,
        },
      }

    default:
      return {
        title: toolName,
        description: JSON.stringify(toolInput).substring(0, 100),
        details: toolInput,
      }
  }
}
