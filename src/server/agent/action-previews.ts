/**
 * Action Preview Generator
 *
 * Generates human-readable previews for write tool proposals.
 * These previews are displayed in the ProposedActionCard UI
 * so users can understand what the agent wants to do before approving.
 */

import type { ActionPreview } from '../../shared/agent-types'

/**
 * Generate a human-readable preview for a proposed write tool call.
 */
export function generateActionPreview(
  toolName: string,
  toolInput: Record<string, unknown>,
): ActionPreview {
  switch (toolName) {
    case 'create_task':
      return {
        title: 'Create Task',
        description: `"${toolInput.name}" — ${toolInput.duration}min, importance ${toolInput.importance}/10, urgency ${toolInput.urgency}/10`,
        details: {
          name: toolInput.name,
          duration: `${toolInput.duration} minutes`,
          importance: toolInput.importance,
          urgency: toolInput.urgency,
          ...(toolInput.deadline ? { deadline: toolInput.deadline } : {}),
          ...(toolInput.notes ? { notes: toolInput.notes } : {}),
        },
      }

    case 'update_task': {
      const fields = Object.keys(toolInput).filter(k => k !== 'id')
      const summary = fields.length <= 3
        ? fields.join(', ')
        : `${fields.slice(0, 3).join(', ')} +${fields.length - 3} more`
      return {
        title: 'Update Task',
        description: `Updating ${summary}`,
        details: toolInput,
      }
    }

    case 'complete_task':
      return {
        title: 'Complete Task',
        description: toolInput.actualDuration
          ? `Mark complete (${toolInput.actualDuration}min actual)`
          : 'Mark task as completed',
        details: toolInput,
      }

    case 'archive_task':
      return {
        title: 'Archive Task',
        description: 'Move task to archive',
        details: toolInput,
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
          steps: steps?.map(s => `${s.name} (${s.duration}min)`),
          importance: toolInput.importance,
          urgency: toolInput.urgency,
        },
      }
    }

    case 'add_workflow_step':
      return {
        title: 'Add Workflow Step',
        description: `"${toolInput.name}" — ${toolInput.duration}min`,
        details: {
          stepName: toolInput.name,
          duration: `${toolInput.duration} minutes`,
          ...(toolInput.afterStep ? { afterStep: toolInput.afterStep } : {}),
          ...(toolInput.beforeStep ? { beforeStep: toolInput.beforeStep } : {}),
        },
      }

    case 'log_work_session': {
      const minutes = toolInput.actualMinutes ?? toolInput.duration
      return {
        title: 'Log Work Session',
        description: minutes
          ? `${minutes}min on task${toolInput.notes ? ` — "${toolInput.notes}"` : ''}`
          : `Starting at ${toolInput.startTime}`,
        details: {
          taskId: toolInput.taskId,
          startTime: toolInput.startTime,
          ...(toolInput.endTime ? { endTime: toolInput.endTime } : {}),
          ...(minutes ? { minutes } : {}),
        },
      }
    }

    case 'create_schedule': {
      const blocks = toolInput.blocks as Array<Record<string, unknown>> | undefined
      const meetings = toolInput.meetings as Array<Record<string, unknown>> | undefined
      const parts: string[] = []
      if (blocks?.length) parts.push(`${blocks.length} blocks`)
      if (meetings?.length) parts.push(`${meetings.length} meetings`)
      return {
        title: 'Create Schedule',
        description: `${toolInput.date} — ${parts.join(', ') || 'empty schedule'}`,
        details: {
          date: toolInput.date,
          blockCount: blocks?.length ?? 0,
          meetingCount: meetings?.length ?? 0,
          blocks: blocks?.map(b => `${b.startTime}-${b.endTime}`),
          meetings: meetings?.map(m => `${m.name} ${m.startTime}-${m.endTime}`),
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
          ...(toolInput.deadline ? { deadline: toolInput.deadline } : {}),
        },
      }

    case 'link_task_to_endeavor':
      return {
        title: 'Link Task to Endeavor',
        description: 'Add task to endeavor for goal tracking',
        details: toolInput,
      }

    case 'manage_sprint':
      return {
        title: toolInput.inActiveSprint ? 'Add to Sprint' : 'Remove from Sprint',
        description: toolInput.inActiveSprint
          ? 'Add task to active sprint for scheduling'
          : 'Remove task from active sprint',
        details: toolInput,
      }

    case 'create_task_type':
      return {
        title: 'Create Task Type',
        description: `${toolInput.emoji} ${toolInput.name} (${toolInput.color})`,
        details: toolInput,
      }

    default:
      return {
        title: toolName,
        description: JSON.stringify(toolInput).substring(0, 100),
        details: toolInput,
      }
  }
}
