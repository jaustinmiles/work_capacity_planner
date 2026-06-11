/**
 * Spatial Scene Router (visionOS port)
 *
 * CRUD for the persistent volumetric workspace and its movable entities, plus the
 * spatial "connect → workflow" (merge) and "disconnect" gestures.
 *
 * Reuse, not duplication:
 * - Node hydration and edge derivation are imported from the Deep Work Board router.
 * - The workflow-formation engine is the shared `applyTaskStructureMorph`; this router
 *   applies the resulting `nodeIdentityUpdates` to its own SpatialEntity projection.
 * - "Link without combining" is NOT here — the client calls `endeavor.addDependency`
 *   directly, leaving workflows separate (pure EndeavorDependency metadata).
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, sessionProcedure, protectedProcedure } from '../trpc'
import { assertValidTaskType } from '../task-type-validation'
import { generateUniqueId } from '../../shared/step-id-utils'
import { getCurrentTime } from '../../shared/time-provider'
import { SpatialEntityKind, EndeavorStatus } from '../../shared/enums'
import { parseEnum } from '../../shared/enum-utils'
import type {
  SpatialScene,
  SpatialEntity,
  SpatialSceneWithEntities,
  SpatialConnectResult,
  SpatialLink,
} from '../../shared/spatial-types'
import type { DeepWorkNodeWithData, MorphResult } from '../../shared/deep-work-board-types'
import { formatTaskFromPrisma } from '../../shared/deep-work-formatters'
import { validateEdgeCreation } from '../../shared/deep-work-clustering'
import { buildConnectMorphResult, buildDisconnectMorphResult } from '../../shared/deep-work-morph'
import { hydrateNode, deriveEdgesFromHydratedNodes } from './deepWorkBoard'
import { applyTaskStructureMorph } from '../morph-executor'

// =============================================================================
// Zod Schemas
// =============================================================================

const rotationInput = z.object({
  rotationX: z.number().optional(),
  rotationY: z.number().optional(),
  rotationZ: z.number().optional(),
  rotationW: z.number().optional(),
})

export const createEntityInput = z.object({
  sceneId: z.string(),
  kind: z.nativeEnum(SpatialEntityKind),
  refId: z.string().optional(),
  noteText: z.string().optional(),
  parentId: z.string().optional(),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number().optional(),
  scale: z.number().positive().optional(),
}).merge(rotationInput)

const createTaskEntityInput = z.object({
  sceneId: z.string(),
  name: z.string().min(1),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number().optional(),
  type: z.string().optional(),
  duration: z.number().int().min(0).optional(),
  importance: z.number().int().min(1).max(10).optional(),
  urgency: z.number().int().min(1).max(10).optional(),
})

export const updateEntityTransformInput = z.object({
  id: z.string(),
  positionX: z.number(),
  positionY: z.number(),
  positionZ: z.number(),
  scale: z.number().positive().optional(),
  isRendered: z.boolean().optional(),
}).merge(rotationInput)

const batchUpdateEntityTransformsInput = z.object({
  updates: z.array(updateEntityTransformInput),
})

export const connectInput = z.object({
  sceneId: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
})

const linkWorkflowsInput = z.object({
  sceneId: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
})

const reassignLinkInput = z.object({
  sceneId: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  endeavorId: z.string(),
})

const getLinksInput = z.object({
  sceneId: z.string(),
})

const collapseWorkflowInput = z.object({
  sceneId: z.string(),
  workflowTaskId: z.string(),
})

/**
 * Id prefix marking an endeavor that was AUTO-CREATED to capture a spatial cross-workflow link
 * cluster. The id is stable across renames (unlike the user-editable name), so cluster lookup and
 * empty-cluster pruning recognize these without a schema column — and never touch a user's
 * manually-created endeavors.
 */
const SPATIAL_LINK_ENDEAVOR_PREFIX = 'spatiallink'

/** Palette for auto-coloring endeavors (cycled by the session's endeavor count) so edges differ. */
const ENDEAVOR_COLOR_PALETTE = [
  '#4A90D9', '#E0567B', '#56B881', '#E0A33A', '#9B6DD6', '#3FB7C4', '#E07A3A', '#C44FA0',
]

// =============================================================================
// Helpers
// =============================================================================

/** A Prisma SpatialEntity row, before enum narrowing. */
interface PrismaSpatialEntityRow {
  id: string
  sceneId: string
  kind: string
  refId: string | null
  noteText: string | null
  parentId: string | null
  positionX: number
  positionY: number
  positionZ: number
  rotationX: number
  rotationY: number
  rotationZ: number
  rotationW: number
  scale: number
  isRendered: boolean
  createdAt: Date
  updatedAt: Date
}

/** Map a Prisma row to the shared SpatialEntity type, narrowing `kind` to the enum. */
function formatEntity(row: PrismaSpatialEntityRow): SpatialEntity {
  return {
    ...row,
    kind: parseEnum(SpatialEntityKind, row.kind, SpatialEntityKind.Note),
  }
}

/** The kinds that project a Task/TaskStep and can participate in connect/disconnect. */
function isNodeKind(kind: SpatialEntityKind): boolean {
  return kind === SpatialEntityKind.TaskNode || kind === SpatialEntityKind.StepNode
}

/**
 * Translate a morph `nodeIdentityUpdate` into the SpatialEntity projection: a node that
 * gained a stepId is now a workflow step; one that gained a taskId reverted to a task.
 */
export function resolveEntityIdentity(
  taskId: string | null,
  stepId: string | null,
): { kind: SpatialEntityKind; refId: string | null } {
  if (stepId !== null) {
    return { kind: SpatialEntityKind.StepNode, refId: stepId }
  }
  return { kind: SpatialEntityKind.TaskNode, refId: taskId }
}

type PrismaCtx = Parameters<Parameters<typeof protectedProcedure['query']>[0]>['0']['ctx']['prisma']

/**
 * Hydrate a node-kind SpatialEntity into a DeepWorkNodeWithData so it can flow through
 * the shared morph planner. The entity id IS the node id, so `nodeIdentityUpdates`
 * come back keyed by SpatialEntity id.
 */
async function hydrateEntityAsNode(
  prisma: PrismaCtx,
  entity: SpatialEntity,
): Promise<DeepWorkNodeWithData> {
  return hydrateNode(prisma, {
    id: entity.id,
    boardId: '', // Unused by morph logic; SpatialEntity is not board-scoped.
    taskId: entity.kind === SpatialEntityKind.TaskNode ? entity.refId : null,
    stepId: entity.kind === SpatialEntityKind.StepNode ? entity.refId : null,
    positionX: entity.positionX,
    positionY: entity.positionY,
    width: 0,
    height: 0,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  })
}

// =============================================================================
// Router
// =============================================================================

export const spatialSceneRouter = router({
  /**
   * Get the active session's spatial scene with all entities, or null if none exists.
   */
  getScene: sessionProcedure.query(
    async ({ ctx }): Promise<SpatialSceneWithEntities | null> => {
      const scene = await ctx.prisma.spatialScene.findFirst({
        where: { sessionId: ctx.sessionId },
        orderBy: { createdAt: 'asc' },
      })
      if (!scene) return null

      const entities = await ctx.prisma.spatialEntity.findMany({
        where: { sceneId: scene.id },
      })
      return { scene, entities: entities.map(formatEntity) }
    },
  ),

  /**
   * Idempotently ensure a spatial scene exists for the session, returning it with
   * its entities. Called when the visionOS client opens the volume.
   */
  ensureScene: sessionProcedure.mutation(
    async ({ ctx }): Promise<SpatialSceneWithEntities> => {
      const existing = await ctx.prisma.spatialScene.findFirst({
        where: { sessionId: ctx.sessionId },
        orderBy: { createdAt: 'asc' },
      })
      if (existing) {
        const entities = await ctx.prisma.spatialEntity.findMany({
          where: { sceneId: existing.id },
        })
        return { scene: existing, entities: entities.map(formatEntity) }
      }

      const now = getCurrentTime()
      const scene: SpatialScene = await ctx.prisma.spatialScene.create({
        data: {
          id: generateUniqueId('scene'),
          sessionId: ctx.sessionId,
          createdAt: now,
          updatedAt: now,
        },
      })
      return { scene, entities: [] }
    },
  ),

  /**
   * Create a placed entity (type panel, workflow volume, note, or an existing node).
   */
  createEntity: protectedProcedure
    .input(createEntityInput)
    .mutation(async ({ ctx, input }): Promise<SpatialEntity> => {
      const now = getCurrentTime()
      const entity = await ctx.prisma.spatialEntity.create({
        data: {
          id: generateUniqueId('sent'),
          sceneId: input.sceneId,
          kind: input.kind,
          refId: input.refId ?? null,
          noteText: input.noteText ?? null,
          parentId: input.parentId ?? null,
          positionX: input.positionX,
          positionY: input.positionY,
          positionZ: input.positionZ ?? 0,
          rotationX: input.rotationX ?? 0,
          rotationY: input.rotationY ?? 0,
          rotationZ: input.rotationZ ?? 0,
          rotationW: input.rotationW ?? 1,
          scale: input.scale ?? 1,
          createdAt: now,
          updatedAt: now,
        },
      })
      return formatEntity(entity)
    }),

  /**
   * Create a new standalone task and place it as a taskNode entity.
   * The spatial analog of "double-pinch on empty space to create".
   */
  createTaskEntity: sessionProcedure
    .input(createTaskEntityInput)
    .mutation(async ({ ctx, input }): Promise<{ entity: SpatialEntity; node: DeepWorkNodeWithData }> => {
      const now = getCurrentTime()
      const taskId = generateUniqueId('task')

      // Default to the session's first task type when none is specified.
      // A provided type is validated at the trust boundary — it must exist in this session.
      let taskType = input.type
      if (!taskType) {
        const firstType = await ctx.prisma.userTaskType.findFirst({
          where: { sessionId: ctx.sessionId },
          orderBy: { sortOrder: 'asc' },
        })
        taskType = firstType?.id ?? ''
      } else {
        await assertValidTaskType(ctx.prisma, ctx.sessionId, taskType, 'type')
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
          data: {
            id: taskId,
            name: input.name,
            duration: input.duration ?? 30,
            importance: input.importance ?? 5,
            urgency: input.urgency ?? 5,
            type: taskType,
            category: 'work',
            hasSteps: false,
            // A task created in the spatial workspace is, by intent, part of the active sprint —
            // so it populates its type tray and participates in scheduling (and a workflow formed
            // by connecting such tasks inherits sprint membership via the morph).
            inActiveSprint: true,
            sessionId: ctx.sessionId,
            createdAt: now,
            updatedAt: now,
          },
          include: { TaskStep: { orderBy: { stepIndex: 'asc' } } },
        })

        const entity = await tx.spatialEntity.create({
          data: {
            id: generateUniqueId('sent'),
            sceneId: input.sceneId,
            kind: SpatialEntityKind.TaskNode,
            refId: task.id,
            positionX: input.positionX,
            positionY: input.positionY,
            positionZ: input.positionZ ?? 0,
            createdAt: now,
            updatedAt: now,
          },
        })

        return { task, entity }
      })

      const node: DeepWorkNodeWithData = {
        id: result.entity.id,
        boardId: '',
        taskId: result.task.id,
        stepId: null,
        positionX: result.entity.positionX,
        positionY: result.entity.positionY,
        width: 0,
        height: 0,
        createdAt: result.entity.createdAt,
        updatedAt: result.entity.updatedAt,
        task: formatTaskFromPrisma(result.task),
        step: null,
        parentTask: null,
      }

      return { entity: formatEntity(result.entity), node }
    }),

  /**
   * Update a single entity's 3D transform (and optionally render state).
   * Called on drag-end.
   */
  updateEntityTransform: protectedProcedure
    .input(updateEntityTransformInput)
    .mutation(async ({ ctx, input }): Promise<SpatialEntity> => {
      const entity = await ctx.prisma.spatialEntity.update({
        where: { id: input.id },
        data: {
          positionX: input.positionX,
          positionY: input.positionY,
          positionZ: input.positionZ,
          ...(input.rotationX !== undefined ? { rotationX: input.rotationX } : {}),
          ...(input.rotationY !== undefined ? { rotationY: input.rotationY } : {}),
          ...(input.rotationZ !== undefined ? { rotationZ: input.rotationZ } : {}),
          ...(input.rotationW !== undefined ? { rotationW: input.rotationW } : {}),
          ...(input.scale !== undefined ? { scale: input.scale } : {}),
          ...(input.isRendered !== undefined ? { isRendered: input.isRendered } : {}),
          updatedAt: getCurrentTime(),
        },
      })
      return formatEntity(entity)
    }),

  /**
   * Batch transform update — used when moving a workflow volume drags its children.
   */
  batchUpdateEntityTransforms: protectedProcedure
    .input(batchUpdateEntityTransformsInput)
    .mutation(async ({ ctx, input }): Promise<{ count: number }> => {
      const now = getCurrentTime()
      await ctx.prisma.$transaction(
        input.updates.map((u) =>
          ctx.prisma.spatialEntity.update({
            where: { id: u.id },
            data: {
              positionX: u.positionX,
              positionY: u.positionY,
              positionZ: u.positionZ,
              ...(u.rotationX !== undefined ? { rotationX: u.rotationX } : {}),
              ...(u.rotationY !== undefined ? { rotationY: u.rotationY } : {}),
              ...(u.rotationZ !== undefined ? { rotationZ: u.rotationZ } : {}),
              ...(u.rotationW !== undefined ? { rotationW: u.rotationW } : {}),
              ...(u.scale !== undefined ? { scale: u.scale } : {}),
              ...(u.isRendered !== undefined ? { isRendered: u.isRendered } : {}),
              updatedAt: now,
            },
          }),
        ),
      )
      return { count: input.updates.length }
    }),

  /**
   * Update a note entity's text.
   */
  updateNoteText: protectedProcedure
    .input(z.object({ id: z.string(), noteText: z.string() }))
    .mutation(async ({ ctx, input }): Promise<SpatialEntity> => {
      const entity = await ctx.prisma.spatialEntity.update({
        where: { id: input.id },
        data: { noteText: input.noteText, updatedAt: getCurrentTime() },
      })
      return formatEntity(entity)
    }),

  /**
   * Toggle whether an entity is currently rendered in the volume.
   */
  setRendered: protectedProcedure
    .input(z.object({ id: z.string(), isRendered: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<SpatialEntity> => {
      const entity = await ctx.prisma.spatialEntity.update({
        where: { id: input.id },
        data: { isRendered: input.isRendered, updatedAt: getCurrentTime() },
      })
      return formatEntity(entity)
    }),

  /**
   * Remove an entity from the scene. Does NOT delete the underlying task/step.
   */
  removeEntity: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      await ctx.prisma.spatialEntity.delete({ where: { id: input.id } })
      return { success: true }
    }),

  /**
   * Connect two node entities — the "merge into a workflow" gesture.
   * Reuses the shared morph planner + engine; applies the identity swaps to
   * SpatialEntity rows (a taskNode becomes a stepNode when it joins a workflow).
   */
  connect: protectedProcedure
    .input(connectInput)
    .mutation(async ({ ctx, input }): Promise<SpatialConnectResult> => {
      const result = await runMorph(ctx.prisma, input, 'connect')
      return result
    }),

  /**
   * Remove a connection between two node entities — may revert isolated steps to
   * standalone tasks (un-morph).
   */
  disconnect: protectedProcedure
    .input(connectInput)
    .mutation(async ({ ctx, input }): Promise<SpatialConnectResult> => {
      const result = await runMorph(ctx.prisma, input, 'disconnect')
      return result
    }),

  /**
   * Link two workflows WITHOUT combining them — creates an EndeavorDependency.
   * The workflows stay separate; the dependency is pure metadata, hosted in a
   * per-session "Spatial Links" endeavor (created on demand). The blocking side must
   * resolve to a step (a workflow's last step, or a tapped step node).
   */
  linkWorkflows: sessionProcedure
    .input(linkWorkflowsInput)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const rows = await ctx.prisma.spatialEntity.findMany({ where: { sceneId: input.sceneId } })
      const entities = rows.map(formatEntity)
      const source = entities.find((e) => e.id === input.sourceEntityId)
      const target = entities.find((e) => e.id === input.targetEntityId)
      if (!source || !target || !isNodeKind(source.kind) || !isNodeKind(target.kind)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source or target node entity not found' })
      }

      const blocking = await resolveBlockingStep(ctx.prisma, source)
      const blocked = await resolveBlockedEndpoint(ctx.prisma, target)

      // Per connected-cluster endeavor (union-find over the link graph): reuse/merge the cluster(s)
      // that already contain either workflow, else auto-create one named "Source → Target".
      const endeavor = await ensureClusterEndeavor(
        ctx.prisma,
        ctx.sessionId,
        blocking.blockingTaskId,
        blocked.parentTaskId,
      )
      await ensureEndeavorItem(ctx.prisma, endeavor.id, blocking.blockingTaskId)
      await ensureEndeavorItem(ctx.prisma, endeavor.id, blocked.parentTaskId)

      const existing = await ctx.prisma.endeavorDependency.findFirst({
        where: {
          endeavorId: endeavor.id,
          blockingStepId: blocking.blockingStepId,
          blockedTaskId: blocked.blockedTaskId ?? null,
          blockedStepId: blocked.blockedStepId ?? null,
        },
      })
      if (!existing) {
        await ctx.prisma.endeavorDependency.create({
          data: {
            id: generateUniqueId('enddep'),
            endeavorId: endeavor.id,
            blockingStepId: blocking.blockingStepId,
            blockingTaskId: blocking.blockingTaskId,
            blockedTaskId: blocked.blockedTaskId ?? null,
            blockedStepId: blocked.blockedStepId ?? null,
            isHardBlock: true,
            createdAt: getCurrentTime(),
          },
        })
      }
      return { success: true }
    }),

  /**
   * Remove a cross-workflow link — the inverse of `linkWorkflows`. Resolves the same
   * blocking/blocked endpoints and deletes the matching EndeavorDependency (no-op if absent).
   * The workflows are untouched; only the dependency metadata is removed.
   */
  unlinkWorkflows: sessionProcedure
    .input(linkWorkflowsInput)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const rows = await ctx.prisma.spatialEntity.findMany({ where: { sceneId: input.sceneId } })
      const entities = rows.map(formatEntity)
      const source = entities.find((e) => e.id === input.sourceEntityId)
      const target = entities.find((e) => e.id === input.targetEntityId)
      if (!source || !target || !isNodeKind(source.kind) || !isNodeKind(target.kind)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source or target node entity not found' })
      }

      const blocking = await resolveBlockingStep(ctx.prisma, source)
      const blocked = await resolveBlockedEndpoint(ctx.prisma, target)

      // Find the dependency across ALL of the session's endeavors (it may live in any cluster).
      const endeavorIds = (
        await ctx.prisma.endeavor.findMany({
          where: { sessionId: ctx.sessionId },
          select: { id: true },
        })
      ).map((e) => e.id)
      const dep = await ctx.prisma.endeavorDependency.findFirst({
        where: {
          endeavorId: { in: endeavorIds },
          blockingStepId: blocking.blockingStepId,
          blockedTaskId: blocked.blockedTaskId ?? null,
          blockedStepId: blocked.blockedStepId ?? null,
        },
      })
      if (!dep) return { success: true }
      await ctx.prisma.endeavorDependency.delete({ where: { id: dep.id } })

      // Prune an auto-created cluster endeavor once its last link is gone (leave manual endeavors).
      if (dep.endeavorId.startsWith(SPATIAL_LINK_ENDEAVOR_PREFIX)) {
        const remaining = await ctx.prisma.endeavorDependency.count({
          where: { endeavorId: dep.endeavorId },
        })
        if (remaining === 0) {
          await ctx.prisma.endeavorItem.deleteMany({ where: { endeavorId: dep.endeavorId } })
          await ctx.prisma.endeavor.delete({ where: { id: dep.endeavorId } })
        }
      }
      return { success: true }
    }),

  /**
   * Reassign a cross-workflow link to a different endeavor (from the edge's "Assign to endeavor"
   * picker). Resolves the same endpoints as link/unlink, moves the EndeavorDependency to the chosen
   * endeavor, ensures both workflows are items of it, and prunes an emptied auto-created cluster.
   */
  reassignLink: sessionProcedure
    .input(reassignLinkInput)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const rows = await ctx.prisma.spatialEntity.findMany({ where: { sceneId: input.sceneId } })
      const entities = rows.map(formatEntity)
      const source = entities.find((e) => e.id === input.sourceEntityId)
      const target = entities.find((e) => e.id === input.targetEntityId)
      if (!source || !target || !isNodeKind(source.kind) || !isNodeKind(target.kind)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source or target node entity not found' })
      }

      const blocking = await resolveBlockingStep(ctx.prisma, source)
      const blocked = await resolveBlockedEndpoint(ctx.prisma, target)

      // The target endeavor MUST belong to this session — the server is the trust boundary, not the
      // client picker — so a request can never relocate a dependency into another session's endeavor.
      const targetEndeavor = await ctx.prisma.endeavor.findFirst({
        where: { id: input.endeavorId, sessionId: ctx.sessionId },
        select: { id: true },
      })
      if (!targetEndeavor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Target endeavor not found in this session' })
      }

      const endeavorIds = (
        await ctx.prisma.endeavor.findMany({ where: { sessionId: ctx.sessionId }, select: { id: true } })
      ).map((e) => e.id)
      const dep = await ctx.prisma.endeavorDependency.findFirst({
        where: {
          endeavorId: { in: endeavorIds },
          blockingStepId: blocking.blockingStepId,
          blockedTaskId: blocked.blockedTaskId ?? null,
          blockedStepId: blocked.blockedStepId ?? null,
        },
      })
      if (!dep || dep.endeavorId === input.endeavorId) return { success: true }
      const previousEndeavorId = dep.endeavorId

      // One transaction so a partial failure rolls back cleanly (mirrors mergeEndeavors).
      await ctx.prisma.$transaction(async (tx) => {
        // If the target endeavor already holds this exact dependency, de-dupe into it (delete the
        // source) rather than letting the @@unique([endeavorId, blocked*, blockingStep]) throw.
        const duplicate = await tx.endeavorDependency.findFirst({
          where: {
            endeavorId: input.endeavorId,
            blockingStepId: blocking.blockingStepId,
            blockedTaskId: blocked.blockedTaskId ?? null,
            blockedStepId: blocked.blockedStepId ?? null,
          },
        })
        if (duplicate) {
          await tx.endeavorDependency.delete({ where: { id: dep.id } })
        } else {
          await tx.endeavorDependency.update({
            where: { id: dep.id },
            data: { endeavorId: input.endeavorId },
          })
        }
        await ensureEndeavorItem(tx, input.endeavorId, blocking.blockingTaskId)
        await ensureEndeavorItem(tx, input.endeavorId, blocked.parentTaskId)

        // Prune the previous auto-created cluster if this emptied it (leave manual endeavors).
        if (previousEndeavorId.startsWith(SPATIAL_LINK_ENDEAVOR_PREFIX)) {
          const remaining = await tx.endeavorDependency.count({ where: { endeavorId: previousEndeavorId } })
          if (remaining === 0) {
            await tx.endeavorItem.deleteMany({ where: { endeavorId: previousEndeavorId } })
            await tx.endeavor.delete({ where: { id: previousEndeavorId } })
          }
        }
      })
      return { success: true }
    }),

  /**
   * Resolve the session's cross-workflow links to scene-entity pairs so the client can
   * draw dashed dependency edges.
   */
  getLinks: sessionProcedure
    .input(getLinksInput)
    .query(async ({ ctx, input }): Promise<SpatialLink[]> => {
      // Derive cross-workflow links from EVERY dependency in the session (across all cluster
      // endeavors), drawn between the scene entities that show their endpoints. Derived, never
      // stored (per the spatial doctrine) — and decoupled from any endeavor name.
      const endeavors = await ctx.prisma.endeavor.findMany({
        where: { sessionId: ctx.sessionId },
        select: { id: true, name: true, color: true },
      })
      if (endeavors.length === 0) return []
      const endeavorById = new Map(endeavors.map((e) => [e.id, e]))

      const deps = await ctx.prisma.endeavorDependency.findMany({
        where: { endeavorId: { in: endeavors.map((e) => e.id) } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], // stable winner when an entity-pair collides
      })
      const rows = await ctx.prisma.spatialEntity.findMany({ where: { sceneId: input.sceneId } })

      // Map a referenced task/step id to the entity that shows it.
      const byRef = new Map<string, string>()
      for (const r of rows) {
        if (r.refId) byRef.set(r.refId, r.id)
      }

      const links: SpatialLink[] = []
      const seen = new Set<string>()
      for (const dep of deps) {
        const sourceEntityId = byRef.get(dep.blockingStepId) ?? byRef.get(dep.blockingTaskId)
        const blockedRef = dep.blockedStepId ?? dep.blockedTaskId
        const targetEntityId = blockedRef ? byRef.get(blockedRef) : undefined
        if (!sourceEntityId || !targetEntityId) continue
        const key = `${sourceEntityId}|${targetEntityId}`
        if (seen.has(key)) continue
        seen.add(key)
        const endeavor = endeavorById.get(dep.endeavorId)
        links.push({
          sourceEntityId,
          targetEntityId,
          isHardBlock: dep.isHardBlock,
          endeavorId: dep.endeavorId,
          endeavorName: endeavor?.name ?? '',
          endeavorColor: endeavor?.color ?? null,
        })
      }
      return links
    }),

  /**
   * Collapse a workflow into a single movable volume entity: its step nodes become
   * hidden children (parentId = volume). The client expands/collapses by toggling the
   * children's render state. Idempotent — reuses an existing volume for the workflow.
   */
  collapseWorkflow: protectedProcedure
    .input(collapseWorkflowInput)
    .mutation(async ({ ctx, input }): Promise<SpatialSceneWithEntities> => {
      const steps = await ctx.prisma.taskStep.findMany({
        where: { taskId: input.workflowTaskId },
        select: { id: true },
      })
      const stepIds = new Set(steps.map((s) => s.id))

      const rows = await ctx.prisma.spatialEntity.findMany({ where: { sceneId: input.sceneId } })
      const memberNodes = rows.filter(
        (r) => r.kind === SpatialEntityKind.StepNode && r.refId !== null && stepIds.has(r.refId),
      )

      const now = getCurrentTime()

      // Centroid of the member step nodes (volume placement).
      const count = Math.max(memberNodes.length, 1)
      const cx = memberNodes.reduce((s, n) => s + n.positionX, 0) / count
      const cy = memberNodes.reduce((s, n) => s + n.positionY, 0) / count
      const cz = memberNodes.reduce((s, n) => s + n.positionZ, 0) / count

      // Find or create the workflow volume.
      let volume = rows.find(
        (r) => r.kind === SpatialEntityKind.WorkflowVolume && r.refId === input.workflowTaskId,
      )
      if (!volume) {
        volume = await ctx.prisma.spatialEntity.create({
          data: {
            id: generateUniqueId('sent'),
            sceneId: input.sceneId,
            kind: SpatialEntityKind.WorkflowVolume,
            refId: input.workflowTaskId,
            positionX: cx,
            positionY: cy,
            positionZ: cz,
            createdAt: now,
            updatedAt: now,
          },
        })
      }

      // Reparent + hide the member step nodes (collapsed).
      const volumeId = volume.id
      await ctx.prisma.$transaction(
        memberNodes.map((n) =>
          ctx.prisma.spatialEntity.update({
            where: { id: n.id },
            data: { parentId: volumeId, isRendered: false, updatedAt: now },
          }),
        ),
      )

      const refreshed = await ctx.prisma.spatialEntity.findMany({ where: { sceneId: input.sceneId } })
      const scene = await ctx.prisma.spatialScene.findFirstOrThrow({ where: { id: input.sceneId } })
      return { scene, entities: refreshed.map(formatEntity) }
    }),
})

// =============================================================================
// Connect / Disconnect implementation
// =============================================================================

/**
 * Shared connect/disconnect flow: load node entities, plan the morph, apply the
 * shared structural engine, then swap SpatialEntity identities in the same
 * transaction. Returns the full entity set plus re-hydrated node entities.
 */
async function runMorph(
  prisma: PrismaCtx,
  input: { sceneId: string; sourceEntityId: string; targetEntityId: string },
  mode: 'connect' | 'disconnect',
): Promise<SpatialConnectResult> {
  // 1. Load all node-kind entities in the scene (panels/notes/volumes can't connect).
  const allRows = await prisma.spatialEntity.findMany({ where: { sceneId: input.sceneId } })
  const allEntities = allRows.map(formatEntity)
  const nodeEntities = allEntities.filter((e) => isNodeKind(e.kind))

  const hydrated = await Promise.all(nodeEntities.map((e) => hydrateEntityAsNode(prisma, e)))
  const nodeMap = new Map<string, DeepWorkNodeWithData>()
  for (const n of hydrated) nodeMap.set(n.id, n)

  const sourceNode = nodeMap.get(input.sourceEntityId)
  const targetNode = nodeMap.get(input.targetEntityId)
  if (!sourceNode || !targetNode) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Source or target node entity not found' })
  }

  const currentEdges = deriveEdgesFromHydratedNodes(hydrated)

  // 2. Plan the morph.
  let morphResult: MorphResult
  if (mode === 'connect') {
    const validationError = validateEdgeCreation(
      input.sourceEntityId,
      input.targetEntityId,
      nodeMap,
      currentEdges,
    )
    if (validationError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: validationError })
    }
    morphResult = buildConnectMorphResult(sourceNode, targetNode, currentEdges)
  } else {
    const removedEdge = currentEdges.find(
      (e) => e.sourceNodeId === input.sourceEntityId && e.targetNodeId === input.targetEntityId,
    )
    if (!removedEdge) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No connection found between these entities' })
    }
    morphResult = buildDisconnectMorphResult(sourceNode, targetNode, currentEdges, nodeMap, removedEdge)
  }

  // 3. Apply the shared engine + this surface's projection swaps atomically.
  const now = getCurrentTime()
  await prisma.$transaction(async (tx) => {
    await applyTaskStructureMorph(tx, morphResult)
    for (const u of morphResult.nodeIdentityUpdates) {
      const identity = resolveEntityIdentity(u.taskId, u.stepId)
      await tx.spatialEntity.update({
        where: { id: u.nodeId },
        data: {
          kind: identity.kind,
          refId: identity.refId,
          updatedAt: now,
        },
      })
    }
  })

  // 4. Return refreshed scene state.
  const refreshedRows = await prisma.spatialEntity.findMany({ where: { sceneId: input.sceneId } })
  const refreshed = refreshedRows.map(formatEntity)
  const refreshedNodeEntities = refreshed.filter((e) => isNodeKind(e.kind))
  const nodes = await Promise.all(refreshedNodeEntities.map((e) => hydrateEntityAsNode(prisma, e)))

  return { entities: refreshed, nodes }
}

// =============================================================================
// Link resolution (link without combining)
// =============================================================================

interface BlockingEndpoint {
  blockingStepId: string
  blockingTaskId: string
}

interface BlockedEndpoint {
  blockedTaskId?: string
  blockedStepId?: string
  /** The parent task to add as an endeavor item. */
  parentTaskId: string
}

/**
 * Resolve a node entity to the STEP that does the blocking. A step node blocks with its
 * own step; a workflow task node blocks with its last step; a standalone task can't block.
 */
export async function resolveBlockingStep(prisma: PrismaCtx, source: SpatialEntity): Promise<BlockingEndpoint> {
  if (!source.refId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Source entity has no referenced task/step' })
  }

  if (source.kind === SpatialEntityKind.StepNode) {
    const step = await prisma.taskStep.findUnique({ where: { id: source.refId } })
    if (!step) throw new TRPCError({ code: 'NOT_FOUND', message: 'Blocking step not found' })
    return { blockingStepId: step.id, blockingTaskId: step.taskId }
  }

  // Task node: must be a workflow (have steps) to provide a blocking step.
  const task = await prisma.task.findUnique({
    where: { id: source.refId },
    include: { TaskStep: { orderBy: { stepIndex: 'desc' }, take: 1 } },
  })
  const lastStep = task?.TaskStep[0]
  if (!task || !task.hasSteps || !lastStep) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The blocking side must be a workflow (a standalone task has no step to block with).',
    })
  }
  return { blockingStepId: lastStep.id, blockingTaskId: task.id }
}

/** Resolve a node entity to the blocked task or step. */
export async function resolveBlockedEndpoint(prisma: PrismaCtx, target: SpatialEntity): Promise<BlockedEndpoint> {
  if (!target.refId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Target entity has no referenced task/step' })
  }

  if (target.kind === SpatialEntityKind.StepNode) {
    const step = await prisma.taskStep.findUnique({ where: { id: target.refId } })
    if (!step) throw new TRPCError({ code: 'NOT_FOUND', message: 'Blocked step not found' })
    return { blockedStepId: step.id, parentTaskId: step.taskId }
  }
  return { blockedTaskId: target.refId, parentTaskId: target.refId }
}

/**
 * Find the auto-created spatial-link CLUSTER endeavor that already contains `taskId` as an item
 * (recognized by the stable id prefix, so renames don't break clustering and manual endeavors are
 * never matched). Returns null when the workflow isn't in any cluster yet.
 */
async function findClusterEndeavor(
  prisma: PrismaCtx,
  sessionId: string,
  taskId: string,
): Promise<{ id: string } | null> {
  return prisma.endeavor.findFirst({
    where: {
      sessionId,
      id: { startsWith: SPATIAL_LINK_ENDEAVOR_PREFIX },
      EndeavorItem: { some: { taskId } },
    },
    select: { id: true },
  })
}

/**
 * Merge one cluster endeavor into another: move items (skipping dupes) + dependencies, then delete the
 * emptied one. Runs in a single transaction so a partial failure (e.g. a unique-constraint collision
 * relocating a dependency) rolls back cleanly instead of leaving a half-merged, inconsistent state.
 */
async function mergeEndeavors(prisma: PrismaCtx, fromId: string, intoId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const items = await tx.endeavorItem.findMany({ where: { endeavorId: fromId } })
    for (const item of items) {
      const dup = await tx.endeavorItem.findUnique({
        where: { endeavorId_taskId: { endeavorId: intoId, taskId: item.taskId } },
      })
      if (dup) {
        await tx.endeavorItem.delete({ where: { id: item.id } })
      } else {
        await tx.endeavorItem.update({ where: { id: item.id }, data: { endeavorId: intoId } })
      }
    }
    await tx.endeavorDependency.updateMany({
      where: { endeavorId: fromId },
      data: { endeavorId: intoId },
    })
    await tx.endeavor.delete({ where: { id: fromId } })
  })
}

/**
 * Find-or-create the connected-cluster endeavor that captures a spatial cross-workflow link.
 * Union-find over the link graph: reuse the cluster that already holds either workflow; if BOTH are
 * in different clusters, merge them; otherwise auto-create one named "Source → Target" (the same
 * arrow convention used for auto-named workflows), which the user can rename.
 */
export async function ensureClusterEndeavor(
  prisma: PrismaCtx,
  sessionId: string,
  sourceTaskId: string,
  targetTaskId: string,
): Promise<{ id: string }> {
  const sourceCluster = await findClusterEndeavor(prisma, sessionId, sourceTaskId)
  const targetCluster = await findClusterEndeavor(prisma, sessionId, targetTaskId)

  if (sourceCluster && targetCluster) {
    if (sourceCluster.id !== targetCluster.id) {
      await mergeEndeavors(prisma, targetCluster.id, sourceCluster.id)
    }
    return { id: sourceCluster.id }
  }
  if (sourceCluster) return sourceCluster
  if (targetCluster) return targetCluster

  const [source, target] = await Promise.all([
    prisma.task.findUnique({ where: { id: sourceTaskId }, select: { name: true } }),
    prisma.task.findUnique({ where: { id: targetTaskId }, select: { name: true } }),
  ])
  const now = getCurrentTime()
  const endeavorCount = await prisma.endeavor.count({ where: { sessionId } })
  const created = await prisma.endeavor.create({
    data: {
      id: generateUniqueId(SPATIAL_LINK_ENDEAVOR_PREFIX),
      sessionId,
      name: `${source?.name ?? 'Workflow'} → ${target?.name ?? 'Workflow'}`,
      status: EndeavorStatus.Active,
      importance: 5,
      urgency: 5,
      color: ENDEAVOR_COLOR_PALETTE[endeavorCount % ENDEAVOR_COLOR_PALETTE.length],
      createdAt: now,
      updatedAt: now,
    },
  })
  return { id: created.id }
}

/** Idempotently add a task to an endeavor (mirrors endeavor.addItem). Accepts a tx client too. */
async function ensureEndeavorItem(
  prisma: Pick<PrismaCtx, 'endeavorItem'>,
  endeavorId: string,
  taskId: string,
): Promise<void> {
  const existing = await prisma.endeavorItem.findUnique({
    where: { endeavorId_taskId: { endeavorId, taskId } },
  })
  if (existing) return

  const maxItem = await prisma.endeavorItem.findFirst({
    where: { endeavorId },
    orderBy: { sortOrder: 'desc' },
  })
  await prisma.endeavorItem.create({
    data: {
      id: generateUniqueId('enditem'),
      endeavorId,
      taskId,
      sortOrder: (maxItem?.sortOrder ?? -1) + 1,
      addedAt: getCurrentTime(),
    },
  })
}
