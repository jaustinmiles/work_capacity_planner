/**
 * Decision State Merger
 *
 * Merges Claude's visual response into the running DecisionState.
 * Ported from Decision Helper's server/index.js handleUserInput().
 * Pure function — no side effects.
 */

import type { DecisionState, ClaudeVisualResponse } from './decision-types'
import { getCurrentTime } from './time-provider'

/**
 * Merge a ClaudeVisualResponse into the current DecisionState.
 * Returns a new state object (does not mutate the input).
 */
export function mergeVisualResponse(
  state: DecisionState,
  visual: ClaudeVisualResponse,
): DecisionState {
  const next: DecisionState = {
    topic: visual.topic ?? state.topic,
    options: [...state.options],
    factors: [...state.factors],
    timeline: [...state.timeline],
    tree: {
      nodes: [...state.tree.nodes],
      edges: [...state.tree.edges],
    },
  }

  // Add new options
  if (visual.newOptions) {
    for (const opt of visual.newOptions) {
      // Deduplicate by ID
      if (!next.options.some(o => o.id === opt.id)) {
        next.options.push(opt)
      }
    }
  }

  // Update existing options (append pros/cons)
  if (visual.updatedOptions) {
    for (const upd of visual.updatedOptions) {
      const existing = next.options.find(o => o.id === upd.id)
      if (existing) {
        const idx = next.options.indexOf(existing)
        next.options[idx] = {
          ...existing,
          pros: [...existing.pros, ...(upd.newPros ?? [])],
          cons: [...existing.cons, ...(upd.newCons ?? [])],
        }
      }
    }
  }

  // Add new factors
  if (visual.newFactors) {
    for (const factor of visual.newFactors) {
      if (!next.factors.some(f => f.id === factor.id)) {
        next.factors.push(factor)
      }
    }
  }

  // Add new tree nodes
  if (visual.newTreeNodes) {
    for (const node of visual.newTreeNodes) {
      if (!next.tree.nodes.some(n => n.id === node.id)) {
        next.tree.nodes.push(node)
      }
    }
  }

  // Add new tree edges
  if (visual.newTreeEdges) {
    for (const edge of visual.newTreeEdges) {
      // Deduplicate by source+target
      const exists = next.tree.edges.some(
        e => e.source === edge.source && e.target === edge.target,
      )
      if (!exists) {
        next.tree.edges.push(edge)
      }
    }
  }

  // Add timeline event
  if (visual.timelineEvent) {
    next.timeline.push({
      ...visual.timelineEvent,
      timestamp: getCurrentTime().toISOString(),
    })
  }

  return next
}
