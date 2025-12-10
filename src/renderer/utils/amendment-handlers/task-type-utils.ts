/**
 * Task type resolution utilities for amendment handlers
 * Resolves user-requested task types to valid type IDs
 */

import { useUserTaskTypeStore } from '../../store/useUserTaskTypeStore'
import { logger } from '@/logger'

/**
 * Validate and resolve a task type ID against user-defined types.
 * Matches by exact ID or case-insensitive name.
 *
 * @param requestedType - The type ID or name requested by the AI
 * @returns A valid type ID or empty string if not found
 */
export function resolveTaskType(requestedType: string | undefined): string {
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
