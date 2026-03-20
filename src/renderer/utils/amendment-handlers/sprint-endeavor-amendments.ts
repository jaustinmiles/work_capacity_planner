/**
 * Handlers for sprint and endeavor management amendments
 */

import type { SprintManagement, EndeavorManagement } from '@shared/amendment-types'
import type { HandlerContext } from './types'
import { useTaskStore } from '../../store/useTaskStore'
import { useEndeavorStore } from '../../store/useEndeavorStore'
import { logger } from '@/logger'

export async function handleSprintManagement(
  amendment: SprintManagement,
  ctx: HandlerContext,
): Promise<void> {
  const taskId = amendment.target.id
  if (!taskId) {
    ctx.markFailed(`Cannot update sprint - target "${amendment.target.name}" not found`)
    return
  }

  const store = useTaskStore.getState()

  if (amendment.operation === 'add') {
    await store.addTaskToSprint(taskId)
  } else if (amendment.operation === 'remove') {
    await store.removeTaskFromSprint(taskId)
  } else {
    ctx.markFailed(`Unknown sprint operation: ${amendment.operation}`)
  }
}

export async function handleEndeavorManagement(
  amendment: EndeavorManagement,
  ctx: HandlerContext,
): Promise<void> {
  const taskId = amendment.target.id
  if (!taskId) {
    ctx.markFailed(`Cannot update endeavor - target "${amendment.target.name}" not found`)
    return
  }

  // Resolve endeavor by name
  const endeavorStore = useEndeavorStore.getState()
  const endeavor = endeavorStore.endeavors.find(
    e => e.name.toLowerCase() === amendment.endeavorName.toLowerCase(),
  )

  if (!endeavor) {
    ctx.markFailed(`Endeavor "${amendment.endeavorName}" not found`)
    return
  }

  if (amendment.operation === 'add_task') {
    await endeavorStore.addTaskToEndeavor(endeavor.id, taskId)
  } else if (amendment.operation === 'remove_task') {
    await endeavorStore.removeTaskFromEndeavor(endeavor.id, taskId)
  } else {
    ctx.markFailed(`Unknown endeavor operation: ${amendment.operation}`)
  }

  logger.ui.info('Endeavor management applied', {
    operation: amendment.operation,
    endeavorName: endeavor.name,
    taskId,
  }, 'endeavor-amendment')
}
