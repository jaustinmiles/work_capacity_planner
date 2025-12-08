/**
 * Graph algorithms and utilities for dependency management
 *
 * This module provides generic graph algorithms used for:
 * - Dependency resolution
 * - Cycle detection
 * - Topological sorting
 * - Critical path analysis
 */

import { logger } from '../logger'

export interface GraphNode {
  id: string
  dependencies?: string[]
  duration?: number
}

/**
 * Build a dependency graph from items with dependencies
 */
export function buildDependencyGraph<T extends GraphNode>(items: T[]): Map<string, string[]> {
  const graph = new Map<string, string[]>()

  items.forEach(item => {
    const dependencies = item.dependencies || []
    graph.set(item.id, dependencies)
  })

  return graph
}

/**
 * Perform topological sort on items with dependencies
 * Returns sorted items where dependencies come before dependents
 */
export function topologicalSort<T extends GraphNode>(items: T[]): T[] {
  const inDegree = new Map<string, number>()
  const adjacencyList = new Map<string, string[]>()
  const itemMap = new Map<string, T>()

  // Initialize
  items.forEach(item => {
    itemMap.set(item.id, item)
    inDegree.set(item.id, 0)
    adjacencyList.set(item.id, [])
  })

  // Build adjacency list and calculate in-degree
  // Track missing dependencies for error reporting
  const missingDependencies: Array<{ itemId: string; itemName?: string; missingDepId: string }> = []

  items.forEach(item => {
    const dependencies = item.dependencies || []
    dependencies.forEach(depId => {
      // Only count dependencies that are in our items list
      if (itemMap.has(depId)) {
        const dependents = adjacencyList.get(depId) || []
        dependents.push(item.id)
        adjacencyList.set(depId, dependents)
        inDegree.set(item.id, (inDegree.get(item.id) || 0) + 1)
      } else {
        // Track missing dependency for error reporting
        missingDependencies.push({
          itemId: item.id,
          itemName: 'name' in item ? String(item.name) : undefined,
          missingDepId: depId,
        })
      }
    })
  })

  // Log warning if there are missing dependencies
  if (missingDependencies.length > 0) {
    logger.system.warn('Topological sort encountered missing dependencies', {
      missingCount: missingDependencies.length,
      missingDependencies: missingDependencies.slice(0, 10), // Limit to first 10 for logging
    }, 'missing-dependencies')
  }

  // Start with items that have no dependencies
  const queue: string[] = []
  inDegree.forEach((degree, itemId) => {
    if (degree === 0) {
      queue.push(itemId)
    }
  })

  const sorted: T[] = []
  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentItem = itemMap.get(currentId)
    if (currentItem) {
      sorted.push(currentItem)

      // Process dependents
      const dependents = adjacencyList.get(currentId) || []
      dependents.forEach(dependentId => {
        const newDegree = (inDegree.get(dependentId) || 0) - 1
        inDegree.set(dependentId, newDegree)
        if (newDegree === 0) {
          queue.push(dependentId)
        }
      })
    }
  }

  // Check for cycles - if sorted doesn't include all items, there's a cycle
  if (sorted.length !== items.length) {
    // Return items in original order if there's a cycle
    // The caller should use detectDependencyCycles to handle this properly
    return items
  }

  return sorted
}

/**
 * Detect cycles in a dependency graph
 */
export function detectDependencyCycles(graph: Map<string, string[]>): {
  hasCycle: boolean
  cycles: string[][]
} {
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const cycles: string[][] = []
  const path: string[] = []

  function dfs(node: string): boolean {
    visited.add(node)
    recursionStack.add(node)
    path.push(node)

    const dependencies = graph.get(node) || []
    for (const dep of dependencies) {
      if (!visited.has(dep)) {
        if (dfs(dep)) {
          return true
        }
      } else if (recursionStack.has(dep)) {
        // Found a cycle - extract it from the path
        const cycleStart = path.indexOf(dep)
        const cycle = path.slice(cycleStart)
        cycle.push(dep) // Add the starting node to complete the cycle
        cycles.push(cycle)
        return true
      }
    }

    path.pop()
    recursionStack.delete(node)
    return false
  }

  // Check all nodes (Array.from needed for ES5 target compatibility)
  for (const node of Array.from(graph.keys())) {
    if (!visited.has(node)) {
      dfs(node)
    }
  }

  return {
    hasCycle: cycles.length > 0,
    cycles,
  }
}

/**
 * Calculate the critical path through a dependency graph
 * Returns the longest path duration from start to finish
 */
export function calculateCriticalPath<T extends GraphNode>(items: T[]): number {
  const graph = buildDependencyGraph(items)
  const itemMap = new Map<string, T>()
  items.forEach(item => itemMap.set(item.id, item))

  // Memoization for path calculations
  const memo = new Map<string, number>()

  function longestPathFrom(itemId: string): number {
    if (memo.has(itemId)) {
      return memo.get(itemId)!
    }

    const item = itemMap.get(itemId)
    if (!item) return 0

    const itemDuration = item.duration || 0
    const dependencies = graph.get(itemId) || []

    if (dependencies.length === 0) {
      memo.set(itemId, itemDuration)
      return itemDuration
    }

    const maxDependencyPath = Math.max(
      ...dependencies.map(depId => longestPathFrom(depId)),
    )

    const totalPath = itemDuration + maxDependencyPath
    memo.set(itemId, totalPath)
    return totalPath
  }

  // Find the maximum path from any starting node
  let maxPath = 0
  for (const item of items) {
    const pathLength = longestPathFrom(item.id)
    maxPath = Math.max(maxPath, pathLength)
  }

  return maxPath
}

/**
 * Calculate the dependency chain length for a specific item
 * Returns the number of items in the longest chain of dependencies
 */
export function calculateDependencyChainLength(
  itemId: string,
  graph: Map<string, string[]>,
): number {
  const visited = new Set<string>()

  function getChainLength(id: string): number {
    if (visited.has(id)) {
      return 0 // Cycle detected, stop
    }

    visited.add(id)
    const dependencies = graph.get(id) || []

    if (dependencies.length === 0) {
      return 1
    }

    const maxDepLength = Math.max(
      ...dependencies.map(depId => getChainLength(depId)),
    )

    visited.delete(id) // Remove from visited for other paths
    return 1 + maxDepLength
  }

  return getChainLength(itemId)
}

/**
 * Find all items that depend on a given item
 * Returns the set of item IDs that have the target as a dependency
 */
export function findDependents(
  targetId: string,
  items: GraphNode[],
): Set<string> {
  const dependents = new Set<string>()

  items.forEach(item => {
    if (item.dependencies?.includes(targetId)) {
      dependents.add(item.id)
    }
  })

  return dependents
}

/**
 * Get all transitive dependencies of an item
 * Returns all items that must be completed before this item
 */
export function getTransitiveDependencies(
  itemId: string,
  graph: Map<string, string[]>,
): Set<string> {
  const dependencies = new Set<string>()
  const visited = new Set<string>()

  function collectDependencies(id: string) {
    if (visited.has(id)) return
    visited.add(id)

    const directDeps = graph.get(id) || []
    directDeps.forEach(depId => {
      dependencies.add(depId)
      collectDependencies(depId)
    })
  }

  collectDependencies(itemId)
  return dependencies
}

/**
 * Type for workflow step used in dependency validation
 */
export interface StepDefinition {
  id: string
  name: string
  dependsOn: string[]
}

/**
 * Validate workflow step dependencies
 * Checks for both orphan dependencies and circular dependencies
 *
 * @param steps - Array of workflow steps with id, name, and dependsOn
 * @returns Validation result with isValid flag and detailed errors
 */
export function validateWorkflowDependencies(
  steps: StepDefinition[],
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  const stepIds = new Set(steps.map(s => s.id))
  const stepIdToName = new Map(steps.map(s => [s.id, s.name]))

  // Check 1: Missing/orphan dependencies
  for (const step of steps) {
    for (const depId of step.dependsOn) {
      if (!stepIds.has(depId)) {
        errors.push(`Step "${step.name}" depends on non-existent step`)
      }
    }
  }

  // Check 2: Circular dependencies using graph algorithms
  // Convert steps to GraphNode format for buildDependencyGraph
  const graphNodes = steps.map(s => ({
    id: s.id,
    dependencies: s.dependsOn,
  }))

  const graph = buildDependencyGraph(graphNodes)
  const cycleResult = detectDependencyCycles(graph)

  if (cycleResult.hasCycle) {
    // Get step names for the cycle for a readable error message
    for (const cycle of cycleResult.cycles) {
      const cycleNames = cycle
        .map(id => stepIdToName.get(id) || id)
        .join(' → ')
      errors.push(`Circular dependency detected: ${cycleNames}`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
