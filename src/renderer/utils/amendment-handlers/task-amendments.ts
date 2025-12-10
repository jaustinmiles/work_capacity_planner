/**
 * Handlers for task-related amendments
 */

import type {
  StatusUpdate,
  TimeLog,
  NoteAddition,
  DurationChange,
  TaskCreation,
  DeadlineChange,
  PriorityChange,
  TypeChange,
  ArchiveToggle,
} from '@shared/amendment-types'
import { EntityType, TaskStatus } from '@shared/amendment-types'
import type { TaskStep, Task } from '@shared/types'
import type { HandlerContext } from './types'
import { Message } from '../../components/common/Message'
import { useUserTaskTypeStore } from '../../store/useUserTaskTypeStore'
import { logger } from '@/logger'

/**
 * Validate and resolve a task type ID against user-defined types.
 * Returns a valid type ID or empty string if not found.
 */
function resolveTaskType(requestedType: string | undefined): string {
  if (!requestedType) return ''

  const userTypes = useUserTaskTypeStore.getState().types
  const matchedType = userTypes.find(t =>
    t.id === requestedType ||
    t.name.toLowerCase() === requestedType.toLowerCase(),
  )

  if (matchedType) {
    return matchedType.id
  }

  // Log warning if type not found
  if (requestedType) {
    logger.ui.warn('Task type not found in user-defined types', {
      requestedType,
      availableTypes: userTypes.map(t => ({ id: t.id, name: t.name })),
    }, 'task-type-resolution')
  }

  return ''
}

export async function handleStatusUpdate(
  amendment: StatusUpdate,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    if (amendment.stepName) {
      // Update workflow step status
      const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
      if (workflow && workflow.steps) {
        const step = workflow.steps.find((s: TaskStep) =>
          s.name.toLowerCase().includes(amendment.stepName!.toLowerCase()) ||
          amendment.stepName!.toLowerCase().includes(s.name.toLowerCase()),
        )
        if (step) {
          await ctx.db.updateTaskStepProgress(step.id, {
            status: amendment.newStatus,
          })
        } else {
          ctx.markFailed(`Step "${amendment.stepName}" not found in workflow "${workflow.name}"`)
        }
      } else {
        ctx.markFailed(`Workflow not found or has no steps for target "${amendment.target.name}"`)
      }
    } else if (amendment.target.type === EntityType.Workflow) {
      // Update workflow status
      await ctx.db.updateSequencedTask(amendment.target.id, {
        overallStatus: amendment.newStatus,
      })
    } else {
      // Update task status
      await ctx.db.updateTask(amendment.target.id, {
        completed: amendment.newStatus === TaskStatus.Completed,
        overallStatus: amendment.newStatus,
      })
    }
  } else {
    ctx.markFailed(`Cannot update "${amendment.target.name}" - target not found in database`)
  }
}

export async function handleTimeLog(
  amendment: TimeLog,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    if (amendment.stepName) {
      // Log time for workflow step
      const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
      if (workflow && workflow.steps) {
        const step = workflow.steps.find((s: TaskStep) =>
          s.name.toLowerCase().includes(amendment.stepName!.toLowerCase()) ||
          amendment.stepName!.toLowerCase().includes(s.name.toLowerCase()),
        )
        if (step) {
          // Create work session for the step
          await ctx.db.createWorkSession({
            stepId: step.id,
            taskId: workflow.id,
            date: amendment.date || new Date(),
            plannedMinutes: step.duration,
            actualMinutes: amendment.duration,
            description: amendment.description || `Time logged for step: ${step.name}`,
            type: step.type as any,
          })
        } else {
          ctx.markFailed(`Step "${amendment.stepName}" not found in workflow "${workflow.name}"`)
        }
      } else {
        ctx.markFailed(`Workflow not found or has no steps for target "${amendment.target.name}"`)
      }
    } else {
      // Log time for task - look up task's type from database
      const task = await ctx.db.getTaskById(amendment.target.id)
      await ctx.db.createWorkSession({
        taskId: amendment.target.id,
        date: amendment.date ? amendment.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        plannedMinutes: amendment.duration,
        actualMinutes: amendment.duration,
        type: task?.type || '',
      })
    }
  } else {
    ctx.markFailed(`Cannot log time for "${amendment.target.name}" - target not found in database`)
  }
}

export async function handleNoteAddition(
  amendment: NoteAddition,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    if (amendment.stepName) {
      // Add note to workflow step
      const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
      if (workflow && workflow.steps) {
        const step = workflow.steps.find((s: TaskStep) =>
          s.name.toLowerCase().includes(amendment.stepName!.toLowerCase()) ||
          amendment.stepName!.toLowerCase().includes(s.name.toLowerCase()),
        )
        if (step) {
          const currentNotes = step.notes || ''
          const newNotes = amendment.append
            ? currentNotes + (currentNotes ? '\n' : '') + amendment.note
            : amendment.note

          // Update the step with new notes
          await ctx.db.updateTaskStepProgress(step.id, {
            notes: newNotes,
          })
        } else {
          ctx.markFailed(`Step "${amendment.stepName}" not found in workflow "${workflow.name}"`)
        }
      } else {
        ctx.markFailed(`Workflow not found or has no steps for target "${amendment.target.name}"`)
      }
    } else if (amendment.target.type === EntityType.Workflow) {
      // Add note to workflow
      const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
      if (workflow) {
        const currentNotes = workflow.notes || ''
        const newNotes = amendment.append
          ? currentNotes + (currentNotes ? '\n' : '') + amendment.note
          : amendment.note
        await ctx.db.updateSequencedTask(amendment.target.id, { notes: newNotes })
      }
    } else {
      // Add note to task
      const task = await ctx.db.getTaskById(amendment.target.id)
      if (task) {
        const currentNotes = task.notes || ''
        const newNotes = amendment.append
          ? currentNotes + (currentNotes ? '\n' : '') + amendment.note
          : amendment.note
        await ctx.db.updateTask(amendment.target.id, { notes: newNotes })
      }
    }
  } else {
    ctx.markFailed(`Cannot add note to "${amendment.target.name}" - target not found in database`)
  }
}

export async function handleDurationChange(
  amendment: DurationChange,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    if (amendment.stepName) {
      // Update workflow step duration
      const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
      if (workflow && workflow.steps) {
        const step = workflow.steps.find((s: TaskStep) =>
          s.name.toLowerCase().includes(amendment.stepName!.toLowerCase()) ||
          amendment.stepName!.toLowerCase().includes(s.name.toLowerCase()),
        )
        if (step) {
          // Update the step duration
          await ctx.db.updateTaskStepProgress(step.id, {
            duration: amendment.newDuration,
          })

          // Recalculate workflow total duration
          const updatedWorkflow = await ctx.db.getSequencedTaskById(amendment.target.id)
          if (updatedWorkflow && updatedWorkflow.steps) {
            const newTotalDuration = updatedWorkflow.steps.reduce((sum: number, s: TaskStep) => sum + s.duration, 0)
            await ctx.db.updateSequencedTask(amendment.target.id, {
              duration: newTotalDuration,
            })
          }
        } else {
          ctx.markFailed(`Step "${amendment.stepName}" not found in workflow "${workflow.name}"`)
        }
      } else {
        ctx.markFailed(`Workflow not found or has no steps for target "${amendment.target.name}"`)
      }
    } else if (amendment.target.type === EntityType.Workflow) {
      // Update workflow duration
      await ctx.db.updateSequencedTask(amendment.target.id, {
        duration: amendment.newDuration,
      })
    } else {
      // Update task duration
      await ctx.db.updateTask(amendment.target.id, {
        duration: amendment.newDuration,
      })
    }
  } else {
    ctx.markFailed(`Cannot update duration for "${amendment.target.name}" - target not found in database`)
  }
}

export async function handleTaskCreation(
  amendment: TaskCreation,
  ctx: HandlerContext,
  amendments: any[],
): Promise<void> {
  // Check for duplicate task names to prevent creating duplicates
  const existingTasks = await ctx.db.getTasks()
  const duplicateTask = existingTasks.find((t: Task) =>
    t.name === amendment.name &&
    !t.completed &&
    Math.abs(t.duration - amendment.duration) < 30, // Similar duration
  )

  if (duplicateTask) {
    Message.warning(`Task "${amendment.name}" already exists`)
    // Track the existing task ID for dependency resolution
    const placeholderIndex = amendments.findIndex(a =>
      a.type === 'TaskCreation' && a === amendment,
    )
    ctx.createdTaskMap.set(`task-new-${placeholderIndex + 1}`, duplicateTask.id)
    return
  }

  // Create the task - use notes field since description doesn't exist in schema
  const taskData = {
    name: amendment.name,
    notes: amendment.description || '',
    importance: amendment.importance || 5,
    urgency: amendment.urgency || 5,
    duration: amendment.duration,
    type: resolveTaskType(amendment.taskType),
    asyncWaitTime: 0,
    completed: false,
    dependencies: [],
    hasSteps: false as const,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration: amendment.duration,
    worstCaseDuration: amendment.duration,
    archived: false,
  }

  const newTask = await ctx.db.createTask(taskData)

  // Track the created task ID for resolving placeholders
  const placeholderIndex = amendments.findIndex(a =>
    a.type === 'TaskCreation' && a === amendment,
  )
  ctx.createdTaskMap.set(`task-new-${placeholderIndex + 1}`, newTask.id)
}

export async function handleDeadlineChange(
  amendment: DeadlineChange,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    const deadline = amendment.newDeadline
    const deadlineType = amendment.deadlineType

    if (amendment.stepName) {
      // Changing deadline for a workflow step
      Message.warning('Step deadlines are not yet supported')
      ctx.markFailed('Step deadlines are not yet supported')
    } else if (amendment.target.type === EntityType.Workflow) {
      // Update workflow deadline
      await ctx.db.updateSequencedTask(amendment.target.id, {
        deadline: deadline,
        deadlineType: deadlineType,
      })
      Message.success(`Deadline updated to ${amendment.newDeadline.toLocaleString()}`)
    } else {
      // Update task deadline
      await ctx.db.updateTask(amendment.target.id, {
        deadline: deadline,
        deadlineType: deadlineType,
      })
      Message.success(`Deadline updated to ${amendment.newDeadline.toLocaleString()}`)
    }
  } else {
    Message.warning(`Cannot update deadline for ${amendment.target.name} - not found`)
    ctx.markFailed(`Cannot update deadline for ${amendment.target.name} - not found`)
  }
}

export async function handlePriorityChange(
  amendment: PriorityChange,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    const updates: any = {}
    if (amendment.importance !== undefined) updates.importance = amendment.importance
    if (amendment.urgency !== undefined) updates.urgency = amendment.urgency
    if (amendment.cognitiveComplexity !== undefined) updates.cognitiveComplexity = amendment.cognitiveComplexity

    if (amendment.stepName) {
      // Changing priority for a workflow step
      const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
      if (workflow && workflow.steps) {
        const stepIndex = workflow.steps.findIndex(s =>
          s.name.toLowerCase().includes(amendment.stepName!.toLowerCase()) ||
          amendment.stepName!.toLowerCase().includes(s.name.toLowerCase()),
        )

        if (stepIndex !== -1) {
          // Update step properties - schema supports importance and urgency for steps
          const updatedSteps = [...workflow.steps]
          const step = updatedSteps[stepIndex]
          if (!step) return

          // Apply the priority changes that are supported
          if (amendment.importance !== undefined) {
            step.importance = amendment.importance
          }
          if (amendment.urgency !== undefined) {
            step.urgency = amendment.urgency
          }
          if (amendment.cognitiveComplexity !== undefined) {
            step.cognitiveComplexity = amendment.cognitiveComplexity
          }

          await ctx.db.updateSequencedTask(amendment.target.id, { steps: updatedSteps })
          Message.success(`Updated priority for step "${amendment.stepName}"`)
        } else {
          Message.warning(`Step "${amendment.stepName}" not found`)
          ctx.markFailed(`Step "${amendment.stepName}" not found`)
        }
      }
    } else if (amendment.target.type === EntityType.Workflow) {
      // Update workflow priority
      await ctx.db.updateSequencedTask(amendment.target.id, updates)
      Message.success('Priority updated successfully')
    } else {
      // Update task priority
      await ctx.db.updateTask(amendment.target.id, updates)
      Message.success('Priority updated successfully')
    }
  } else {
    Message.warning(`Cannot update priority for ${amendment.target.name} - not found`)
    ctx.markFailed(`Cannot update priority for ${amendment.target.name} - not found`)
  }
}

export async function handleTypeChange(
  amendment: TypeChange,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    if (amendment.stepName) {
      // Changing type for a workflow step
      const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
      if (workflow && workflow.steps) {
        const stepIndex = workflow.steps.findIndex(s =>
          s.name.toLowerCase().includes(amendment.stepName!.toLowerCase()) ||
          amendment.stepName!.toLowerCase().includes(s.name.toLowerCase()),
        )

        if (stepIndex !== -1) {
          const updatedSteps = [...workflow.steps]
          const existingStep = updatedSteps[stepIndex]
          if (!existingStep) return
          updatedSteps[stepIndex] = {
            ...existingStep,
            type: amendment.newType,
          }

          await ctx.db.updateSequencedTask(amendment.target.id, { steps: updatedSteps })
          Message.success(`Step type changed to ${amendment.newType}`)
        } else {
          Message.warning(`Step "${amendment.stepName}" not found`)
          ctx.markFailed(`Step "${amendment.stepName}" not found`)
        }
      }
    } else if (amendment.target.type === EntityType.Workflow) {
      // Update workflow type
      await ctx.db.updateSequencedTask(amendment.target.id, { type: amendment.newType })
      Message.success(`Type changed to ${amendment.newType}`)
    } else {
      // Update task type
      await ctx.db.updateTask(amendment.target.id, { type: amendment.newType })
      Message.success(`Type changed to ${amendment.newType}`)
    }
  } else {
    Message.warning(`Cannot update type for ${amendment.target.name} - not found`)
    ctx.markFailed(`Cannot update type for ${amendment.target.name} - not found`)
  }
}

export async function handleArchiveToggle(
  amendment: ArchiveToggle,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    if (amendment.target.type === EntityType.Workflow) {
      await ctx.db.updateSequencedTask(amendment.target.id, {
        archived: amendment.archive,
      })
      Message.success(`${amendment.archive ? 'Archived' : 'Unarchived'} workflow: ${amendment.target.name}`)
    } else if (amendment.target.type === EntityType.Task) {
      if (amendment.archive) {
        await ctx.db.archiveTask(amendment.target.id)
      } else {
        await ctx.db.unarchiveTask(amendment.target.id)
      }
      Message.success(`${amendment.archive ? 'Archived' : 'Unarchived'} task: ${amendment.target.name}`)
    } else {
      Message.warning('Cannot archive/unarchive steps directly')
      ctx.markFailed('Cannot archive/unarchive steps directly')
    }
  } else {
    Message.warning(`Cannot find ${amendment.target.name} to archive/unarchive`)
    ctx.markFailed(`Cannot find ${amendment.target.name} to archive/unarchive`)
  }
}
