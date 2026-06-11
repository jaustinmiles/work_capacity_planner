/**
 * Spatial Scene Types (visionOS port)
 *
 * Type definitions for the spatial workspace — a persistent volumetric scene where
 * every placed thing (task node, step node, type panel, workflow volume, note) is a
 * movable entity.
 *
 * Architecture: like DeepWorkNode, a SpatialEntity is a "projection" — it stores only
 * 3D placement + visibility metadata. Canonical task/step/type data lives in
 * Task / TaskStep / UserTaskType. Edges are derived (from TaskStep.dependsOn and
 * EndeavorDependency), never stored as entities. The workflow-morph engine is shared
 * with the Deep Work Board via applyTaskStructureMorph — not duplicated.
 */

import type { SpatialEntityKind } from './enums'
import type { DeepWorkNodeWithData } from './deep-work-board-types'

/**
 * SpatialScene — A session's persistent volumetric workspace.
 */
export interface SpatialScene {
  id: string
  sessionId: string
  name: string
  createdAt: Date
  updatedAt: Date
}

/**
 * SpatialEntity — A placed, movable entity in a scene.
 *
 * `kind` (a {@link SpatialEntityKind}) determines what `refId` references:
 * - taskNode       → Task.id
 * - stepNode       → TaskStep.id
 * - typePanel      → UserTaskType.id
 * - workflowVolume → workflow Task.id
 * - note           → null (content is in `noteText`)
 *
 * Orientation is a quaternion (RealityKit-native) to avoid euler/gimbal ambiguity.
 */
export interface SpatialEntity {
  id: string
  sceneId: string
  kind: SpatialEntityKind
  refId: string | null
  noteText: string | null
  /** Child step nodes inside a workflowVolume reference the volume entity id. */
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

/**
 * A scene loaded with all of its placed entities.
 */
export interface SpatialSceneWithEntities {
  scene: SpatialScene
  entities: SpatialEntity[]
}

/**
 * Result of a connect (merge) operation: the morph engine may swap entity identities
 * (taskNode → stepNode) and the affected node entities are returned re-hydrated so the
 * client can re-render. Non-node entities (panels, notes) are unaffected.
 */
export interface SpatialConnectResult {
  entities: SpatialEntity[]
  /** Hydrated node entities (task/step content) for the entities touched by the morph. */
  nodes: DeepWorkNodeWithData[]
}

/**
 * A cross-workflow link (EndeavorDependency) resolved to the two scene entities it
 * connects, so the client can draw a dashed dependency edge. "Link without combining":
 * the workflows stay separate; this is pure metadata.
 */
export interface SpatialLink {
  sourceEntityId: string
  targetEntityId: string
  isHardBlock: boolean
  /** The endeavor that captures this cross-workflow link (so the client can rename it). */
  endeavorId: string
  /** The endeavor's (auto-generated, user-editable) display name. */
  endeavorName: string
  /** The endeavor's color (hex) — tints the edge + the panel legend; null when unset. */
  endeavorColor: string | null
}
