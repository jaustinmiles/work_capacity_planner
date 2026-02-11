/**
 * Endeavor Store
 *
 * Manages endeavor state using Zustand, following the same patterns
 * as other stores in this application (useTaskStore, useConversationStore).
 */

import { create } from 'zustand'
import { getDatabase } from '../services/database'
import { logger } from '@/logger'
import type { Endeavor, EndeavorWithTasks, EndeavorProgress, EndeavorDependencyWithNames, CreateEndeavorDependencyInput } from '@shared/types'
import { EndeavorStatus, DeadlineType } from '@shared/enums'
import { calculateEndeavorProgress, sortEndeavorsByPriority } from '@shared/endeavor-utils'

export enum EndeavorLoadStatus {
  Idle = 'idle',
  Loading = 'loading',
  Loaded = 'loaded',
  Error = 'error',
}

interface EndeavorStore {
  // State
  endeavors: EndeavorWithTasks[]
  selectedEndeavorId: string | null
  status: EndeavorLoadStatus
  error: string | null
  dependencies: Map<string, EndeavorDependencyWithNames[]> // endeavorId -> dependencies

  // Computed (derived from endeavors)
  getSelectedEndeavor: () => EndeavorWithTasks | null
  getEndeavorProgress: (endeavorId: string) => EndeavorProgress | null
  getDependenciesForEndeavor: (endeavorId: string) => EndeavorDependencyWithNames[]

  // Data loading
  loadEndeavors: (options?: { status?: EndeavorStatus; includeArchived?: boolean }) => Promise<void>
  refreshEndeavors: () => Promise<void>
  loadDependencies: (endeavorId: string) => Promise<EndeavorDependencyWithNames[]>

  // Selection
  selectEndeavor: (id: string | null) => void

  // CRUD operations
  createEndeavor: (data: CreateEndeavorInput) => Promise<Endeavor>
  updateEndeavor: (id: string, data: UpdateEndeavorInput) => Promise<Endeavor>
  deleteEndeavor: (id: string) => Promise<void>

  // Item management
  addTaskToEndeavor: (endeavorId: string, taskId: string) => Promise<void>
  removeTaskFromEndeavor: (endeavorId: string, taskId: string) => Promise<void>
  reorderEndeavorItems: (endeavorId: string, orderedTaskIds: string[]) => Promise<void>

  // Dependency management
  addDependency: (input: CreateEndeavorDependencyInput) => Promise<void>
  removeDependency: (id: string, endeavorId: string) => Promise<void>
  updateDependency: (id: string, endeavorId: string, updates: { isHardBlock?: boolean; notes?: string | null }) => Promise<void>
}

export interface CreateEndeavorInput {
  name: string
  description?: string
  notes?: string
  importance?: number
  urgency?: number
  deadline?: Date
  deadlineType?: DeadlineType
  color?: string
}

export interface UpdateEndeavorInput {
  name?: string
  description?: string | null
  notes?: string | null
  status?: EndeavorStatus
  importance?: number
  urgency?: number
  deadline?: Date | null
  deadlineType?: DeadlineType | null
  color?: string | null
}

export const useEndeavorStore = create<EndeavorStore>((set, get) => ({
  // Initial state
  endeavors: [],
  selectedEndeavorId: null,
  status: EndeavorLoadStatus.Idle,
  error: null,
  dependencies: new Map(),

  // Computed
  getSelectedEndeavor: () => {
    const { endeavors, selectedEndeavorId } = get()
    if (!selectedEndeavorId) return null
    return endeavors.find((e) => e.id === selectedEndeavorId) || null
  },

  getEndeavorProgress: (endeavorId: string) => {
    const { endeavors } = get()
    const endeavor = endeavors.find((e) => e.id === endeavorId)
    if (!endeavor) return null
    return calculateEndeavorProgress(endeavor)
  },

  getDependenciesForEndeavor: (endeavorId: string) => {
    const { dependencies } = get()
    return dependencies.get(endeavorId) || []
  },

  // Data loading
  loadEndeavors: async (options) => {
    set({ status: EndeavorLoadStatus.Loading, error: null })
    try {
      const db = getDatabase()
      const endeavors = await db.getEndeavors(options)
      const sorted = sortEndeavorsByPriority(endeavors)
      set({ endeavors: sorted, status: EndeavorLoadStatus.Loaded })
      logger.ui.info('Endeavors loaded', { count: endeavors.length }, 'endeavor-load')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load endeavors'
      set({ status: EndeavorLoadStatus.Error, error: message })
      logger.ui.error('Failed to load endeavors', { error: message }, 'endeavor-load-error')
    }
  },

  refreshEndeavors: async () => {
    // Refresh with same options as last load
    await get().loadEndeavors()
  },

  loadDependencies: async (endeavorId: string) => {
    try {
      const db = getDatabase()
      const deps = await db.getEndeavorDependencies(endeavorId)
      // Transform to proper types
      const transformed: EndeavorDependencyWithNames[] = deps.map((d) => ({
        id: d.id,
        endeavorId: d.endeavorId,
        blockedTaskId: d.blockedTaskId || undefined,
        blockedStepId: d.blockedStepId || undefined,
        blockingStepId: d.blockingStepId,
        blockingTaskId: d.blockingTaskId,
        isHardBlock: d.isHardBlock,
        notes: d.notes || undefined,
        createdAt: new Date(d.createdAt),
        blockedTaskName: d.blockedTaskName,
        blockedStepName: d.blockedStepName,
        blockingStepName: d.blockingStepName,
        blockingTaskName: d.blockingTaskName,
        blockingStepStatus: d.blockingStepStatus,
        blockingEndeavorId: d.blockingEndeavorId,
        blockingEndeavorName: d.blockingEndeavorName,
      }))
      set((state) => {
        const newDeps = new Map(state.dependencies)
        newDeps.set(endeavorId, transformed)
        return { dependencies: newDeps }
      })
      return transformed
    } catch (error) {
      logger.ui.error('Failed to load dependencies', { endeavorId, error }, 'dependency-load-error')
      return []
    }
  },

  // Selection
  selectEndeavor: (id) => {
    set({ selectedEndeavorId: id })
  },

  // CRUD operations
  createEndeavor: async (data) => {
    const db = getDatabase()
    const endeavor = await db.createEndeavor(data)
    await get().refreshEndeavors()
    logger.ui.info('Endeavor created', { id: endeavor.id, name: endeavor.name }, 'endeavor-create')
    return endeavor
  },

  updateEndeavor: async (id, data) => {
    const db = getDatabase()
    const endeavor = await db.updateEndeavor(id, data)
    await get().refreshEndeavors()
    logger.ui.info('Endeavor updated', { id, updates: Object.keys(data) }, 'endeavor-update')
    return endeavor
  },

  deleteEndeavor: async (id) => {
    const db = getDatabase()
    await db.deleteEndeavor(id)

    // Clear selection if deleted endeavor was selected
    const { selectedEndeavorId } = get()
    if (selectedEndeavorId === id) {
      set({ selectedEndeavorId: null })
    }

    await get().refreshEndeavors()
    logger.ui.info('Endeavor deleted', { id }, 'endeavor-delete')
  },

  // Item management
  addTaskToEndeavor: async (endeavorId, taskId) => {
    const db = getDatabase()
    await db.addEndeavorItem(endeavorId, taskId)
    await get().refreshEndeavors()
    logger.ui.info('Task added to endeavor', { endeavorId, taskId }, 'endeavor-add-task')
  },

  removeTaskFromEndeavor: async (endeavorId, taskId) => {
    const db = getDatabase()
    await db.removeEndeavorItem(endeavorId, taskId)
    await get().refreshEndeavors()
    logger.ui.info('Task removed from endeavor', { endeavorId, taskId }, 'endeavor-remove-task')
  },

  reorderEndeavorItems: async (endeavorId, orderedTaskIds) => {
    const db = getDatabase()
    await db.reorderEndeavorItems(endeavorId, orderedTaskIds)
    await get().refreshEndeavors()
    logger.ui.info('Endeavor items reordered', { endeavorId, count: orderedTaskIds.length }, 'endeavor-reorder')
  },

  // Dependency management
  addDependency: async (input) => {
    const db = getDatabase()
    await db.addEndeavorDependency(input)
    await get().loadDependencies(input.endeavorId)
    logger.ui.info('Dependency added', { endeavorId: input.endeavorId }, 'dependency-add')
  },

  removeDependency: async (id, endeavorId) => {
    const db = getDatabase()
    await db.removeEndeavorDependency(id)
    await get().loadDependencies(endeavorId)
    logger.ui.info('Dependency removed', { id, endeavorId }, 'dependency-remove')
  },

  updateDependency: async (id, endeavorId, updates) => {
    const db = getDatabase()
    await db.updateEndeavorDependency(id, updates)
    await get().loadDependencies(endeavorId)
    logger.ui.info('Dependency updated', { id, endeavorId }, 'dependency-update')
  },
}))
