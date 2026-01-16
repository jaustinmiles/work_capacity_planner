/**
 * USER TASK TYPE STORE
 *
 * Manages user-defined task types for the current session.
 * Types are session-scoped - each session has its own set of types.
 *
 * This store:
 * - Loads types from the database on initialization
 * - Provides CRUD operations for types
 * - Caches types for fast access
 * - Clears on session switch
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import {
  UserTaskType,
  CreateUserTaskTypeInput,
  UpdateUserTaskTypeInput,
  getTypeById,
  getTypeColor,
  getTypeEmoji,
  getTypeName,
  getSortedTypes,
} from '@/shared/user-task-types'
import { logger } from '@/logger'
import { getDatabase } from '@/renderer/services/database'

interface UserTaskTypeStoreState {
  // Core state
  types: UserTaskType[]
  isLoading: boolean
  error: string | null
  isInitialized: boolean

  // Actions
  loadTypes: () => Promise<void>
  createType: (input: Omit<CreateUserTaskTypeInput, 'sessionId'>) => Promise<UserTaskType>
  updateType: (id: string, updates: UpdateUserTaskTypeInput) => Promise<UserTaskType>
  deleteType: (id: string) => Promise<void>
  reorderTypes: (orderedIds: string[]) => Promise<void>
  clearTypes: () => void

  // Helpers (derived from state)
  getById: (id: string) => UserTaskType | undefined
  getColor: (typeId: string) => string
  getEmoji: (typeId: string) => string
  getName: (typeId: string) => string
  getSorted: () => UserTaskType[]
  hasTypes: () => boolean
}

export const useUserTaskTypeStore = create<UserTaskTypeStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    types: [],
    isLoading: false,
    error: null,
    isInitialized: false,

    /**
     * Load all types for the current session from the database.
     */
    loadTypes: async () => {
      set({ isLoading: true, error: null })

      try {
        const types = await getDatabase().getUserTaskTypes()

        set({
          types,
          isLoading: false,
          isInitialized: true,
        })

        logger.ui.info('User task types loaded', {
          count: types.length,
          typeNames: types.map((t) => t.name),
        }, 'user-task-types-loaded')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        set({ error: errorMessage, isLoading: false, isInitialized: true })
        logger.ui.error('Failed to load user task types', { error: errorMessage }, 'user-task-types-error')
      }
    },

    /**
     * Create a new user task type.
     */
    createType: async (input) => {
      try {
        const newType = await getDatabase().createUserTaskType(input)

        set((state) => ({
          types: [...state.types, newType],
        }))

        logger.ui.info('Created user task type', {
          id: newType.id,
          name: newType.name,
        }, 'user-task-type-created')

        return newType
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to create user task type', { error: errorMessage }, 'user-task-type-create-error')
        throw error
      }
    },

    /**
     * Update an existing user task type.
     */
    updateType: async (id, updates) => {
      try {
        const updatedType = await getDatabase().updateUserTaskType(id, updates)

        set((state) => ({
          types: state.types.map((t) => (t.id === id ? updatedType : t)),
        }))

        logger.ui.info('Updated user task type', {
          id: updatedType.id,
          name: updatedType.name,
          updates,
        }, 'user-task-type-updated')

        return updatedType
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to update user task type', { error: errorMessage, id }, 'user-task-type-update-error')
        throw error
      }
    },

    /**
     * Delete a user task type.
     * Note: Does not check if type is in use by tasks or blocks.
     */
    deleteType: async (id) => {
      try {
        await getDatabase().deleteUserTaskType(id)

        set((state) => ({
          types: state.types.filter((t) => t.id !== id),
        }))

        logger.ui.info('Deleted user task type', { id }, 'user-task-type-deleted')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to delete user task type', { error: errorMessage, id }, 'user-task-type-delete-error')
        throw error
      }
    },

    /**
     * Reorder types by providing ordered IDs.
     */
    reorderTypes: async (orderedIds) => {
      try {
        await getDatabase().reorderUserTaskTypes(orderedIds)

        // Update local state with new order
        set((state) => {
          const typeMap = new Map(state.types.map((t) => [t.id, t]))
          const reorderedTypes = orderedIds
            .map((id, index) => {
              const type = typeMap.get(id)
              if (type) {
                return { ...type, sortOrder: index }
              }
              return null
            })
            .filter((t): t is UserTaskType => t !== null)

          return { types: reorderedTypes }
        })

        logger.ui.info('Reordered user task types', { count: orderedIds.length }, 'user-task-types-reordered')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.ui.error('Failed to reorder user task types', { error: errorMessage }, 'user-task-types-reorder-error')
        throw error
      }
    },

    /**
     * Clear all types from the store (used on session switch).
     */
    clearTypes: () => {
      logger.ui.info('Clearing user task types for session switch', {}, 'user-task-types-clear')
      set({
        types: [],
        isLoading: false,
        error: null,
        isInitialized: false,
      })
    },

    // Helper methods that use state
    getById: (id) => getTypeById(get().types, id),
    getColor: (typeId) => getTypeColor(get().types, typeId),
    getEmoji: (typeId) => getTypeEmoji(get().types, typeId),
    getName: (typeId) => getTypeName(get().types, typeId),
    getSorted: () => getSortedTypes(get().types),
    hasTypes: () => get().types.length > 0,
  })),
)

/**
 * Hook to get a specific type by ID with reactivity.
 */
export function useUserTaskType(typeId: string): UserTaskType | undefined {
  return useUserTaskTypeStore((state) => state.types.find((t) => t.id === typeId))
}

/**
 * Hook to check if session has any types defined.
 */
export function useHasUserTaskTypes(): boolean {
  return useUserTaskTypeStore((state) => state.types.length > 0)
}

/**
 * Hook to get all types sorted by sortOrder.
 * Uses useShallow to prevent infinite re-renders when array reference changes
 * but content is the same.
 */
export function useSortedUserTaskTypes(): UserTaskType[] {
  return useUserTaskTypeStore(
    useShallow((state) => getSortedTypes(state.types)),
  )
}
