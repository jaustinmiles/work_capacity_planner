/**
 * Decision Graph Connectivity
 *
 * Computes a connectivity score (0-1) for a decision graph.
 * The score indicates how well-connected the graph is and whether
 * it has enough coverage for meaningful task extraction.
 *
 * Ported from Decision Helper's server/claude.js computeConnectivity().
 */

import type { DecisionState, ConnectivityScore } from './decision-types'
import { TreeNodeType } from './enums'

/**
 * Compute graph connectivity score.
 *
 * Composite score (weighted):
 *   score = (density * 0.3) + (optionCoverage * 0.4) + (factorCoverage * 0.3)
 *
 * Where:
 *   density = actual edges / max possible edges (N*(N-1)/2)
 *   optionCoverage = options with BOTH pros AND cons / total options
 *   factorCoverage = factor-option edges / (factorNodes * optionNodes)
 *
 * Ready threshold:
 *   coveredOptions >= 2 AND factorCount >= 3 AND score > 0.35
 */
export function computeConnectivity(state: DecisionState | null): ConnectivityScore {
  if (!state) {
    return { score: 0, detail: 'no data', ready: false, nodeCount: 0, edgeCount: 0, optionCount: 0, factorCount: 0, coveredOptions: 0 }
  }

  const nodeCount = state.tree.nodes.length
  const edgeCount = state.tree.edges.length
  const optionCount = state.options.length
  const factorCount = state.factors.length

  if (nodeCount < 2) {
    return { score: 0, detail: `${nodeCount} nodes, need more`, ready: false, nodeCount, edgeCount, optionCount, factorCount, coveredOptions: 0 }
  }

  // Edge density: actual edges / max possible edges
  const maxEdges = (nodeCount * (nodeCount - 1)) / 2
  const density = maxEdges > 0 ? edgeCount / maxEdges : 0

  // Option coverage: do options have both pros and cons?
  let coveredOptions = 0
  for (const opt of state.options) {
    if (opt.pros.length > 0 && opt.cons.length > 0) {
      coveredOptions++
    }
  }
  const optionCoverage = optionCount > 0 ? coveredOptions / optionCount : 0

  // Factor connection: are factors connected to options in the graph?
  const factorNodeIds = new Set(
    state.tree.nodes.filter(n => n.type === TreeNodeType.Factor).map(n => n.id),
  )
  const optionNodeIds = new Set(
    state.tree.nodes.filter(n => n.type === TreeNodeType.Option).map(n => n.id),
  )

  let factorOptionEdges = 0
  for (const edge of state.tree.edges) {
    if (
      (factorNodeIds.has(edge.source) && optionNodeIds.has(edge.target)) ||
      (optionNodeIds.has(edge.source) && factorNodeIds.has(edge.target))
    ) {
      factorOptionEdges++
    }
  }

  const maxFactorOptionEdges = factorNodeIds.size * optionNodeIds.size
  const factorCoverage = maxFactorOptionEdges > 0 ? factorOptionEdges / maxFactorOptionEdges : 0

  // Composite score
  const score = (density * 0.3) + (optionCoverage * 0.4) + (factorCoverage * 0.3)

  // Ready threshold
  const ready = coveredOptions >= 2 && factorCount >= 3 && score > 0.35

  const detail = `${nodeCount} nodes, ${edgeCount} edges, density=${(density * 100).toFixed(0)}%, optCoverage=${(optionCoverage * 100).toFixed(0)}%, factorLink=${(factorCoverage * 100).toFixed(0)}%`

  return { score, detail, ready, nodeCount, edgeCount, optionCount, factorCount, coveredOptions }
}
