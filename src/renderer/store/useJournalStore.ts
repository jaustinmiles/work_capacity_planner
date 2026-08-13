/**
 * Journal Store
 *
 * Drives the Journal tab: rich-text journal entries (tied to calendar days) and
 * the single AI-processed mind map per session. Talks to the `mindmap` tRPC
 * router via the shared typed client (getApiClient) — no business logic here; the
 * extraction/validation lives server-side (the trust boundary).
 *
 * Follows the established store conventions (useEndeavorStore / useDeepWorkBoardStore).
 */

import { create } from 'zustand'
import { getDatabase } from '../services/database'
import { logger } from '@/logger'
import { JournalViewMode, MindMapRelationshipType } from '@shared/enums'
import { getCurrentTime } from '@shared/time-provider'
import type { ApiClient } from '@shared/trpc-client'

export enum JournalLoadStatus {
  Idle = 'idle',
  Loading = 'loading',
  Loaded = 'loaded',
  Error = 'error',
}

// Row types inferred from the router so Date/enum serialization stays exact —
// avoids re-declaring shapes that could drift from the server contract.
type SceneGraph = Awaited<ReturnType<ApiClient['mindmap']['getScene']['query']>>
export type JournalEntryRow = Awaited<
  ReturnType<ApiClient['mindmap']['listEntries']['query']>
>[number]
export type MindMapSceneRow = NonNullable<SceneGraph['scene']>
export type MindMapNodeRow = SceneGraph['nodes'][number]
export type MindMapEdgeRow = SceneGraph['edges'][number]

/** Summary of a processing run, surfaced to the UI as a toast. */
export interface ProcessResult {
  summary: string
  created: { nodes: number; edges: number }
  rejected: { nodes: number; edges: number }
}

export interface CreateJournalEntryInput {
  entryDate: Date
  title: string
  content: string
  plainText: string
}

export interface UpdateJournalEntryInput {
  title?: string
  content?: string
  plainText?: string
  entryDate?: Date
}

interface JournalStore {
  // ---- Entry state ----
  entries: JournalEntryRow[]
  selectedEntryId: string | null
  status: JournalLoadStatus
  error: string | null

  // ---- Mind-map scene state ----
  scene: MindMapSceneRow | null
  nodes: MindMapNodeRow[]
  edges: MindMapEdgeRow[]
  sceneStatus: JournalLoadStatus
  processing: boolean

  // ---- View ----
  viewMode: JournalViewMode
  setViewMode: (mode: JournalViewMode) => void

  // ---- Selection ----
  selectEntry: (id: string | null) => void
  getSelectedEntry: () => JournalEntryRow | null

  // ---- Entry CRUD ----
  loadEntries: (range?: { startDate?: Date; endDate?: Date }) => Promise<void>
  createEntry: (input: CreateJournalEntryInput) => Promise<JournalEntryRow>
  updateEntry: (id: string, updates: UpdateJournalEntryInput) => Promise<void>
  deleteEntry: (id: string) => Promise<void>

  // ---- Mind map ----
  loadScene: () => Promise<void>
  processEntry: (entryId: string) => Promise<ProcessResult>
  moveNode: (nodeId: string, positionX: number, positionY: number) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  createEdge: (input: {
    sourceNodeId: string
    targetNodeId: string
    relationshipType: MindMapRelationshipType
    label?: string | null
  }) => Promise<void>
  deleteEdge: (edgeId: string) => Promise<void>
  saveViewport: (zoom: number, panX: number, panY: number) => Promise<void>
}

const mindmap = (): ApiClient['mindmap'] => getDatabase().getApiClient().mindmap

export const useJournalStore = create<JournalStore>((set, get) => ({
  // Initial state
  entries: [],
  selectedEntryId: null,
  status: JournalLoadStatus.Idle,
  error: null,
  scene: null,
  nodes: [],
  edges: [],
  sceneStatus: JournalLoadStatus.Idle,
  processing: false,
  viewMode: JournalViewMode.Calendar,

  setViewMode: (mode) => set({ viewMode: mode }),

  selectEntry: (id) => set({ selectedEntryId: id }),

  getSelectedEntry: () => {
    const { entries, selectedEntryId } = get()
    if (selectedEntryId === null) return null
    return entries.find((e) => e.id === selectedEntryId) ?? null
  },

  // ---- Entry CRUD ----
  loadEntries: async (range) => {
    set({ status: JournalLoadStatus.Loading, error: null })
    try {
      const entries = await mindmap().listEntries.query({
        startDate: range?.startDate,
        endDate: range?.endDate,
      })
      set({ entries, status: JournalLoadStatus.Loaded })
      logger.ui.info('Journal entries loaded', { count: entries.length }, 'journal-load')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load journal entries'
      set({ status: JournalLoadStatus.Error, error: message })
      logger.ui.error('Failed to load journal entries', { error: message }, 'journal-load-error')
    }
  },

  createEntry: async (input) => {
    const entry = await mindmap().createEntry.mutate(input)
    set((state) => ({ entries: [entry, ...state.entries], selectedEntryId: entry.id }))
    logger.ui.info('Journal entry created', { id: entry.id }, 'journal-create')
    return entry
  },

  updateEntry: async (id, updates) => {
    const updated = await mindmap().updateEntry.mutate({ id, ...updates })
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? updated : e)),
    }))
    logger.ui.info('Journal entry updated', { id }, 'journal-update')
  },

  deleteEntry: async (id) => {
    await mindmap().deleteEntry.mutate({ id })
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      selectedEntryId: state.selectedEntryId === id ? null : state.selectedEntryId,
    }))
    logger.ui.info('Journal entry deleted', { id }, 'journal-delete')
  },

  // ---- Mind map ----
  loadScene: async () => {
    set({ sceneStatus: JournalLoadStatus.Loading })
    try {
      const graph = await mindmap().getScene.query()
      set({
        scene: graph.scene,
        nodes: graph.nodes,
        edges: graph.edges,
        sceneStatus: JournalLoadStatus.Loaded,
      })
      logger.ui.info(
        'Mind map scene loaded',
        { nodes: graph.nodes.length, edges: graph.edges.length },
        'journal-scene-load',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load mind map'
      set({ sceneStatus: JournalLoadStatus.Error, error: message })
      logger.ui.error('Failed to load mind map scene', { error: message }, 'journal-scene-error')
    }
  },

  processEntry: async (entryId) => {
    set({ processing: true })
    try {
      const result = await mindmap().processEntry.mutate({ entryId })
      set((state) => ({
        scene: result.scene,
        nodes: result.nodes,
        edges: result.edges,
        // reflect processedAt locally so the entry shows as synced
        entries: state.entries.map((e) =>
          e.id === entryId ? { ...e, processedAt: getCurrentTime() } : e,
        ),
      }))
      logger.ui.info(
        'Journal entry processed into mind map',
        { entryId, created: result.created, rejected: result.rejected },
        'journal-process',
      )
      return { summary: result.summary, created: result.created, rejected: result.rejected }
    } finally {
      set({ processing: false })
    }
  },

  moveNode: async (nodeId, positionX, positionY) => {
    // Optimistic: reflect the drop immediately, persist + pin in the background.
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, positionX, positionY, pinned: true } : n,
      ),
    }))
    await mindmap().moveNode.mutate({ nodeId, positionX, positionY })
  },

  deleteNode: async (nodeId) => {
    await mindmap().deleteNode.mutate({ nodeId })
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId),
    }))
  },

  createEdge: async (input) => {
    await mindmap().createEdge.mutate({
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      relationshipType: input.relationshipType,
      label: input.label ?? null,
    })
    await get().loadScene()
  },

  deleteEdge: async (edgeId) => {
    await mindmap().deleteEdge.mutate({ edgeId })
    set((state) => ({ edges: state.edges.filter((e) => e.id !== edgeId) }))
  },

  saveViewport: async (zoom, panX, panY) => {
    await mindmap().updateViewport.mutate({ zoom, panX, panY })
  },
}))
