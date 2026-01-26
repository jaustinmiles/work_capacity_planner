/**
 * Handlers for work session amendments
 */

import type { WorkSessionEdit, TaskTypeCreation } from '@shared/amendment-types'
import { WorkSessionOperation } from '@shared/enums'
import type { HandlerContext } from './types'
import { Message } from '../../components/common/Message'
import { useUserTaskTypeStore } from '../../store/useUserTaskTypeStore'
import { logger } from '@/logger'

export async function handleWorkSessionEdit(
  amendment: WorkSessionEdit,
  ctx: HandlerContext,
): Promise<void> {
  try {
    switch (amendment.operation) {
      case WorkSessionOperation.Create: {
        if (!amendment.taskId) {
          Message.warning('Task ID required to create work session')
          ctx.markFailed('Task ID required to create work session')
          break
        }

        const startTime = amendment.startTime
          ? (amendment.startTime instanceof Date ? amendment.startTime : new Date(amendment.startTime))
          : new Date()

        await ctx.db.createWorkSession({
          taskId: amendment.taskId,
          stepId: amendment.stepId,
          startTime,
          endTime: amendment.endTime
            ? (amendment.endTime instanceof Date ? amendment.endTime : new Date(amendment.endTime))
            : undefined,
          // Only include plannedMinutes if provided (no arbitrary defaults)
          plannedMinutes: amendment.plannedMinutes !== undefined
            ? Math.round(amendment.plannedMinutes)
            : 0,
          actualMinutes: amendment.actualMinutes !== undefined
            ? Math.round(amendment.actualMinutes)
            : undefined,
          notes: amendment.notes,
        })
        Message.success('Created work session')
        break
      }

      case WorkSessionOperation.Update: {
        if (!amendment.sessionId) {
          Message.warning('Session ID required to update work session')
          ctx.markFailed('Session ID required to update work session')
          break
        }

        await ctx.db.updateWorkSession(amendment.sessionId, {
          startTime: amendment.startTime
            ? (amendment.startTime instanceof Date ? amendment.startTime : new Date(amendment.startTime))
            : undefined,
          endTime: amendment.endTime
            ? (amendment.endTime instanceof Date ? amendment.endTime : new Date(amendment.endTime))
            : undefined,
          // Zod schema requires integers - round to prevent validation errors
          plannedMinutes: amendment.plannedMinutes !== undefined
            ? Math.round(amendment.plannedMinutes)
            : undefined,
          actualMinutes: amendment.actualMinutes !== undefined
            ? Math.round(amendment.actualMinutes)
            : undefined,
          notes: amendment.notes,
        })
        Message.success('Updated work session')
        break
      }

      case WorkSessionOperation.Delete: {
        if (!amendment.sessionId) {
          Message.warning('Session ID required to delete work session')
          ctx.markFailed('Session ID required to delete work session')
          break
        }

        await ctx.db.deleteWorkSession(amendment.sessionId)
        Message.success('Deleted work session')
        break
      }

      case WorkSessionOperation.Split: {
        // Split requires new database method - defer for now
        Message.info('Work session split not yet implemented')
        break
      }
    }
  } catch (error) {
    logger.ui.error('Failed to edit work session', {
      error: error instanceof Error ? error.message : String(error),
      operation: amendment.operation,
    }, 'work-session-edit-error')
    Message.error(`Failed to ${amendment.operation} work session`)
    ctx.markFailed(`Failed to ${amendment.operation} work session: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function handleTaskTypeCreation(
  amendment: TaskTypeCreation,
  ctx: HandlerContext,
): Promise<void> {
  try {
    // Validate hex color format
    if (!amendment.color.match(/^#[0-9A-Fa-f]{6}$/)) {
      Message.warning(`Invalid color format "${amendment.color}" - must be #RRGGBB`)
      ctx.markFailed(`Invalid color format "${amendment.color}" - must be #RRGGBB`)
      return
    }

    // Check for duplicate type name
    const existingTypes = useUserTaskTypeStore.getState().types
    const duplicate = existingTypes.find(
      t => t.name.toLowerCase() === amendment.name.toLowerCase(),
    )
    if (duplicate) {
      Message.warning(`Task type "${amendment.name}" already exists`)
      ctx.markFailed(`Task type "${amendment.name}" already exists`)
      return
    }

    // Create the new task type
    await useUserTaskTypeStore.getState().createType({
      name: amendment.name.trim(),
      emoji: amendment.emoji || '📌',
      color: amendment.color.toUpperCase(),
    })

    Message.success(`Created task type: ${amendment.emoji} ${amendment.name}`)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.ui.error('Failed to create task type', {
      error: errMsg,
      name: amendment.name,
    }, 'task-type-creation-error')
    Message.error(`Failed to create task type "${amendment.name}": ${errMsg}`)
    ctx.markFailed(`Failed to create task type: ${errMsg}`)
  }
}
