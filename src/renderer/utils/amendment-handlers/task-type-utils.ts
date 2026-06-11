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
 * Never returns an unknown or empty type: an unmatched (or omitted) request
 * falls back to the first user-defined type — the server rejects unknown
 * types, so silently passing the AI's string through would fail the create.
 * Throws when no task types exist, failing the amendment visibly instead of
 * persisting a typeless task.
 *
 * @param requestedType - The type ID or name requested by the AI
 * @returns A valid user-defined type ID
 */
export function resolveTaskType(requestedType: string | undefined): string {
  const userTypes = useUserTaskTypeStore.getState().types
  const fallbackType = userTypes[0]

  if (!fallbackType) {
    throw new Error(
      'No task types are defined in this session — create a task type before adding tasks',
    )
  }

  if (requestedType) {
    const matchedType = userTypes.find(t =>
      t.id === requestedType ||
      t.name.toLowerCase() === requestedType.toLowerCase(),
    )

    if (matchedType) {
      return matchedType.id
    }

    logger.ui.warn('Task type not found in user-defined types — falling back to first type', {
      requestedType,
      fallbackTypeId: fallbackType.id,
      availableTypes: userTypes.map(t => ({ id: t.id, name: t.name })),
    }, 'task-type-resolution')
  }

  return fallbackType.id
}
