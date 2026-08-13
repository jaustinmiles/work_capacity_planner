/**
 * Mind Map / Journal Router
 *
 * Backs the journal feature: rich-text journal entries tied to calendar days, and a
 * single persistent, AI-processed mind map per session. Processing a journal entry
 * runs a one-shot AI extraction whose output is validated by the pure
 * sanitizeMindMapExtraction trust boundary BEFORE any write — the AI cannot persist
 * a node kind, relationship type, or connection outside the codified taxonomy.
 *
 * The mind map is a placement projection (like DeepWorkNode/SpatialEntity): node
 * positions + the viewport persist separately from the extracted meaning, so
 * re-processing a revisited day merges by normalized label and never moves a pinned
 * node. See .claude/decisions/2026-06-28-journal-mindmap-feature.md.
 */

import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, sessionProcedure } from '../trpc'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { MindMapRelationshipType } from '../../shared/enums'
import { getAIService } from '../../shared/ai-service'
import { MIND_MAP_NODE_DEFAULTS } from '../../shared/mindmap-types'
import {
  isRelationshipAllowed,
  isValidNodeKind,
  placeNewNodes,
  sanitizeMindMapExtraction,
  type ExistingNodeRef,
} from '../../shared/mindmap-extraction'

// ============================================================================
// Input Schemas
// ============================================================================

const listEntriesInput = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
})

const createEntryInput = z.object({
  entryDate: z.date(),
  title: z.string().default(''),
  content: z.string().default(''),
  plainText: z.string().default(''),
})

const updateEntryInput = z.object({
  id: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  plainText: z.string().optional(),
  entryDate: z.date().optional(),
})

const updateViewportInput = z.object({
  zoom: z.number().min(0.05).max(20),
  panX: z.number(),
  panY: z.number(),
})

const moveNodeInput = z.object({
  nodeId: z.string(),
  positionX: z.number(),
  positionY: z.number(),
})

const createEdgeInput = z.object({
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  relationshipType: z.nativeEnum(MindMapRelationshipType),
  label: z.string().nullable().optional(),
})

// ============================================================================
// Helpers
// ============================================================================

/** Strip HTML tags to plain text as a fallback when plainText wasn't provided. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Get (creating if missing) the session's single mind-map scene. */
async function ensureScene(
  client: Prisma.TransactionClient,
  sessionId: string,
): Promise<{ id: string; sessionId: string; zoom: number; panX: number; panY: number }> {
  const now = getCurrentTime()
  return client.mindMapScene.upsert({
    where: { sessionId },
    create: {
      id: generateUniqueId('mmscene'),
      sessionId,
      createdAt: now,
      updatedAt: now,
    },
    update: {},
  })
}

/** Load the full scene graph (scene + nodes + edges) for a session. */
async function loadSceneGraph(client: Prisma.TransactionClient, sessionId: string) {
  const scene = await client.mindMapScene.findUnique({ where: { sessionId } })
  if (scene === null) {
    return { scene: null, nodes: [], edges: [] }
  }
  const [nodes, edges] = await Promise.all([
    client.mindMapNode.findMany({ where: { sceneId: scene.id }, orderBy: { createdAt: 'asc' } }),
    client.mindMapEdge.findMany({ where: { sceneId: scene.id }, orderBy: { createdAt: 'asc' } }),
  ])
  return { scene, nodes, edges }
}

// ============================================================================
// Router
// ============================================================================

export const mindmapRouter = router({
  // --------------------------------------------------------------------------
  // Journal entries
  // --------------------------------------------------------------------------

  /**
   * List journal entries for the session, optionally within a date range
   * (e.g. one calendar day). Newest first.
   */
  listEntries: sessionProcedure.input(listEntriesInput).query(async ({ ctx, input }) => {
    const dateFilter: Prisma.JournalEntryWhereInput = {}
    if (input.startDate !== undefined || input.endDate !== undefined) {
      dateFilter.entryDate = {}
      if (input.startDate !== undefined) dateFilter.entryDate.gte = input.startDate
      if (input.endDate !== undefined) dateFilter.entryDate.lte = input.endDate
    }
    return ctx.prisma.journalEntry.findMany({
      where: { sessionId: ctx.sessionId, ...dateFilter },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    })
  }),

  /** Get a single journal entry (session-scoped). */
  getEntry: sessionProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const entry = await ctx.prisma.journalEntry.findFirst({
      where: { id: input.id, sessionId: ctx.sessionId },
    })
    if (entry === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Journal entry not found' })
    }
    return entry
  }),

  /** Create a journal entry for a given day. */
  createEntry: sessionProcedure.input(createEntryInput).mutation(async ({ ctx, input }) => {
    const now = getCurrentTime()
    return ctx.prisma.journalEntry.create({
      data: {
        id: generateUniqueId('journal'),
        sessionId: ctx.sessionId,
        entryDate: input.entryDate,
        title: input.title,
        content: input.content,
        plainText: input.plainText,
        createdAt: now,
        updatedAt: now,
      },
    })
  }),

  /** Update a journal entry's content/title/day (session-scoped). */
  updateEntry: sessionProcedure.input(updateEntryInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.journalEntry.findFirst({
      where: { id: input.id, sessionId: ctx.sessionId },
    })
    if (existing === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Journal entry not found' })
    }
    return ctx.prisma.journalEntry.update({
      where: { id: input.id },
      data: {
        title: input.title ?? existing.title,
        content: input.content ?? existing.content,
        plainText: input.plainText ?? existing.plainText,
        entryDate: input.entryDate ?? existing.entryDate,
        updatedAt: getCurrentTime(),
      },
    })
  }),

  /** Delete a journal entry. Its extracted nodes/edges stay (sourceEntryId nulled). */
  deleteEntry: sessionProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const existing = await ctx.prisma.journalEntry.findFirst({
        where: { id: input.id, sessionId: ctx.sessionId },
      })
      if (existing === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Journal entry not found' })
      }
      await ctx.prisma.journalEntry.delete({ where: { id: input.id } })
      return { success: true }
    }),

  // --------------------------------------------------------------------------
  // Mind map scene
  // --------------------------------------------------------------------------

  /** Get the session's mind-map scene graph (scene may be null until first write). */
  getScene: sessionProcedure.query(async ({ ctx }) => {
    return loadSceneGraph(ctx.prisma, ctx.sessionId)
  }),

  /** Persist the canvas viewport (zoom/pan) — creates the scene if needed. */
  updateViewport: sessionProcedure
    .input(updateViewportInput)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const now = getCurrentTime()
      await ctx.prisma.mindMapScene.upsert({
        where: { sessionId: ctx.sessionId },
        create: {
          id: generateUniqueId('mmscene'),
          sessionId: ctx.sessionId,
          zoom: input.zoom,
          panX: input.panX,
          panY: input.panY,
          createdAt: now,
          updatedAt: now,
        },
        update: { zoom: input.zoom, panX: input.panX, panY: input.panY, updatedAt: now },
      })
      return { success: true }
    }),

  /** Persist a node's position (drag) and mark it pinned so re-sync won't move it. */
  moveNode: sessionProcedure
    .input(moveNodeInput)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const scene = await ctx.prisma.mindMapScene.findUnique({
        where: { sessionId: ctx.sessionId },
      })
      const node =
        scene === null
          ? null
          : await ctx.prisma.mindMapNode.findFirst({
              where: { id: input.nodeId, sceneId: scene.id },
            })
      if (node === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Mind map node not found' })
      }
      await ctx.prisma.mindMapNode.update({
        where: { id: node.id },
        data: {
          positionX: input.positionX,
          positionY: input.positionY,
          pinned: true,
          updatedAt: getCurrentTime(),
        },
      })
      return { success: true }
    }),

  /** Delete a node (and its edges cascade). */
  deleteNode: sessionProcedure
    .input(z.object({ nodeId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const scene = await ctx.prisma.mindMapScene.findUnique({
        where: { sessionId: ctx.sessionId },
      })
      const node =
        scene === null
          ? null
          : await ctx.prisma.mindMapNode.findFirst({
              where: { id: input.nodeId, sceneId: scene.id },
            })
      if (node === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Mind map node not found' })
      }
      await ctx.prisma.mindMapNode.delete({ where: { id: node.id } })
      return { success: true }
    }),

  /** Delete a single relationship edge. */
  deleteEdge: sessionProcedure
    .input(z.object({ edgeId: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const scene = await ctx.prisma.mindMapScene.findUnique({
        where: { sessionId: ctx.sessionId },
      })
      const edge =
        scene === null
          ? null
          : await ctx.prisma.mindMapEdge.findFirst({
              where: { id: input.edgeId, sceneId: scene.id },
            })
      if (edge === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Mind map edge not found' })
      }
      await ctx.prisma.mindMapEdge.delete({ where: { id: edge.id } })
      return { success: true }
    }),

  /**
   * Manually create a relationship edge between two existing nodes. Validated
   * against the SAME codified relationship matrix the AI is held to — a manual
   * edge can't break the rules either.
   */
  createEdge: sessionProcedure.input(createEdgeInput).mutation(async ({ ctx, input }) => {
    if (input.sourceNodeId === input.targetNodeId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'A node cannot connect to itself' })
    }
    const scene = await ctx.prisma.mindMapScene.findUnique({
      where: { sessionId: ctx.sessionId },
    })
    if (scene === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Mind map scene not found' })
    }
    const [source, target] = await Promise.all([
      ctx.prisma.mindMapNode.findFirst({ where: { id: input.sourceNodeId, sceneId: scene.id } }),
      ctx.prisma.mindMapNode.findFirst({ where: { id: input.targetNodeId, sceneId: scene.id } }),
    ])
    if (source === null || target === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Source or target node not found' })
    }
    if (!isValidNodeKind(source.kind) || !isValidNodeKind(target.kind)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Node has an invalid kind' })
    }
    if (!isRelationshipAllowed(input.relationshipType, source.kind, target.kind)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `A "${input.relationshipType}" relationship is not allowed from a ${source.kind} to a ${target.kind}`,
      })
    }
    const now = getCurrentTime()
    return ctx.prisma.mindMapEdge.upsert({
      where: {
        sceneId_sourceNodeId_targetNodeId_relationshipType: {
          sceneId: scene.id,
          sourceNodeId: source.id,
          targetNodeId: target.id,
          relationshipType: input.relationshipType,
        },
      },
      create: {
        id: generateUniqueId('mmedge'),
        sceneId: scene.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        relationshipType: input.relationshipType,
        label: input.label ?? null,
        createdAt: now,
        updatedAt: now,
      },
      update: { label: input.label ?? null, updatedAt: now },
    })
  }),

  // --------------------------------------------------------------------------
  // AI processing — the journal → mind map transform
  // --------------------------------------------------------------------------

  /**
   * Process a journal entry into the mind map. Runs the one-shot AI extraction,
   * sanitizes it against the codified taxonomy + relationship matrix (the trust
   * boundary), then merges the result into the scene transactionally: existing
   * concepts (matched by normalized label) keep their position + pinned state and
   * only refresh their summary; genuinely new concepts are auto-placed in open
   * space. Returns the updated scene graph plus a count of what was rejected.
   */
  processEntry: sessionProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Load + validate the entry.
      const entry = await ctx.prisma.journalEntry.findFirst({
        where: { id: input.entryId, sessionId: ctx.sessionId },
      })
      if (entry === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Journal entry not found' })
      }
      const text =
        entry.plainText.trim().length > 0 ? entry.plainText : htmlToPlainText(entry.content)
      if (text.trim().length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Journal entry is empty — nothing to process' })
      }

      // 2. Ensure the scene exists and read its current nodes (for re-sync context).
      const scene = await ensureScene(ctx.prisma, ctx.sessionId)
      const existingNodes = await ctx.prisma.mindMapNode.findMany({
        where: { sceneId: scene.id },
      })
      const existingRefs: ExistingNodeRef[] = []
      for (const n of existingNodes) {
        if (isValidNodeKind(n.kind)) {
          existingRefs.push({ normalizedLabel: n.normalizedLabel, kind: n.kind })
        }
      }
      const aiContext = existingNodes.map((n) => ({ label: n.label, kind: n.kind }))

      // 3. AI extraction (network — OUTSIDE the transaction).
      const raw = await getAIService().extractMindMapFromJournal(text, aiContext)

      // 4. Sanitize — the trust boundary. Nothing past here can be hallucinated.
      const sanitized = sanitizeMindMapExtraction(raw, existingRefs)

      // 5. Compute placements for genuinely-new nodes (deterministic, off-DB).
      const existingByLabel = new Map(existingNodes.map((n) => [n.normalizedLabel, n]))
      const newNodes = sanitized.nodes.filter((n) => !existingByLabel.has(n.normalizedLabel))
      const positions = placeNewNodes(
        existingNodes.map((n) => ({ x: n.positionX, y: n.positionY })),
        newNodes.length,
      )

      // 6. Merge transactionally.
      const now = getCurrentTime()
      await ctx.prisma.$transaction(async (tx) => {
        const labelToId = new Map<string, string>()
        for (const n of existingNodes) {
          labelToId.set(n.normalizedLabel, n.id)
        }

        let posIdx = 0
        for (const sn of sanitized.nodes) {
          const existingNode = existingByLabel.get(sn.normalizedLabel)
          if (existingNode !== undefined) {
            // Merge: refresh summary + provenance; NEVER touch position/pinned/kind.
            await tx.mindMapNode.update({
              where: { id: existingNode.id },
              data: {
                summary: sn.summary ?? existingNode.summary,
                sourceEntryId: entry.id,
                updatedAt: now,
              },
            })
          } else {
            const pos = positions[posIdx] ?? { x: 0, y: 0 }
            posIdx++
            const nodeId = generateUniqueId('mmnode')
            await tx.mindMapNode.create({
              data: {
                id: nodeId,
                sceneId: scene.id,
                kind: sn.kind,
                label: sn.label,
                normalizedLabel: sn.normalizedLabel,
                summary: sn.summary,
                emoji: sn.emoji,
                color: sn.color,
                refId: null,
                sourceEntryId: entry.id,
                positionX: pos.x,
                positionY: pos.y,
                width: MIND_MAP_NODE_DEFAULTS.WIDTH,
                height: MIND_MAP_NODE_DEFAULTS.HEIGHT,
                pinned: false,
                createdAt: now,
                updatedAt: now,
              },
            })
            labelToId.set(sn.normalizedLabel, nodeId)
          }
        }

        for (const se of sanitized.edges) {
          const sourceId = labelToId.get(se.sourceNormalizedLabel)
          const targetId = labelToId.get(se.targetNormalizedLabel)
          if (sourceId === undefined || targetId === undefined) {
            continue
          }
          await tx.mindMapEdge.upsert({
            where: {
              sceneId_sourceNodeId_targetNodeId_relationshipType: {
                sceneId: scene.id,
                sourceNodeId: sourceId,
                targetNodeId: targetId,
                relationshipType: se.relationshipType,
              },
            },
            create: {
              id: generateUniqueId('mmedge'),
              sceneId: scene.id,
              sourceNodeId: sourceId,
              targetNodeId: targetId,
              relationshipType: se.relationshipType,
              label: se.label,
              sourceEntryId: entry.id,
              createdAt: now,
              updatedAt: now,
            },
            update: { label: se.label, sourceEntryId: entry.id, updatedAt: now },
          })
        }

        await tx.journalEntry.update({
          where: { id: entry.id },
          data: { processedAt: now, updatedAt: now },
        })
      })

      // 7. Return the updated graph + what the trust boundary rejected.
      const graph = await loadSceneGraph(ctx.prisma, ctx.sessionId)
      return {
        ...graph,
        summary: sanitized.nodes.length > 0 ? raw.summary : '',
        rejected: sanitized.rejected,
        created: { nodes: newNodes.length, edges: sanitized.edges.length },
      }
    }),
})
