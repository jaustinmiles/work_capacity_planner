/**
 * Graph Node/Edge ID Construction and Parsing
 *
 * Centralizes the `prefix-rawId` convention used by ReactFlow nodes/edges
 * in the Endeavor Graph View. All graph ID manipulation should use these
 * helpers instead of hand-rolling template literals.
 */

import { GraphNodePrefix, GraphEdgePrefix } from './enums'

const SEPARATOR = '-'

/**
 * Construct a node ID: `${prefix}-${id}`
 */
export function makeNodeId(prefix: GraphNodePrefix, id: string): string {
  return `${prefix}${SEPARATOR}${id}`
}

/**
 * Construct an edge ID: `${prefix}-${part1}-${part2}-...`
 */
export function makeEdgeId(prefix: GraphEdgePrefix, ...parts: string[]): string {
  return [prefix, ...parts].join(SEPARATOR)
}

/**
 * Parse a node ID back into its prefix and raw ID.
 * Returns null if the ID doesn't match any known prefix.
 */
export function parseNodeId(nodeId: string): { prefix: GraphNodePrefix; id: string } | null {
  for (const prefix of Object.values(GraphNodePrefix)) {
    const token = `${prefix}${SEPARATOR}`
    if (nodeId.startsWith(token)) {
      return { prefix, id: nodeId.slice(token.length) }
    }
  }
  return null
}

/**
 * Check whether a node ID belongs to a specific prefix type.
 */
export function isNodeType(nodeId: string, prefix: GraphNodePrefix): boolean {
  return nodeId.startsWith(`${prefix}${SEPARATOR}`)
}
