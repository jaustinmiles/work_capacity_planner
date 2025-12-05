import { describe, it, expect } from 'vitest'
import {
  findDependents,
  getTransitiveDependencies,
  validateWorkflowDependencies,
  buildDependencyGraph,
  GraphNode,
  StepDefinition,
} from '../graph-utils'

describe('graph-utils', () => {
  describe('findDependents', () => {
    it('should find all items that depend on target', () => {
      const items: GraphNode[] = [
        { id: 'A', dependencies: [] },
        { id: 'B', dependencies: ['A'] },
        { id: 'C', dependencies: ['A'] },
        { id: 'D', dependencies: ['B'] },
      ]

      const dependents = findDependents('A', items)

      expect(dependents.size).toBe(2)
      expect(dependents.has('B')).toBe(true)
      expect(dependents.has('C')).toBe(true)
    })

    it('should return empty set when no dependents', () => {
      const items: GraphNode[] = [
        { id: 'A', dependencies: [] },
        { id: 'B', dependencies: [] },
      ]

      const dependents = findDependents('A', items)

      expect(dependents.size).toBe(0)
    })

    it('should handle items without dependencies array', () => {
      const items: GraphNode[] = [
        { id: 'A' },
        { id: 'B', dependencies: ['A'] },
      ]

      const dependents = findDependents('A', items)

      expect(dependents.size).toBe(1)
      expect(dependents.has('B')).toBe(true)
    })
  })

  describe('getTransitiveDependencies', () => {
    it('should get all transitive dependencies', () => {
      const graph = new Map<string, string[]>([
        ['A', []],
        ['B', ['A']],
        ['C', ['B']],       // C depends on B, which depends on A
        ['D', ['A', 'C']],  // D depends on A and C
      ])

      const deps = getTransitiveDependencies('D', graph)

      expect(deps.size).toBe(3)
      expect(deps.has('A')).toBe(true)
      expect(deps.has('B')).toBe(true)
      expect(deps.has('C')).toBe(true)
    })

    it('should return empty set for item with no dependencies', () => {
      const graph = new Map<string, string[]>([
        ['A', []],
        ['B', ['A']],
      ])

      const deps = getTransitiveDependencies('A', graph)

      expect(deps.size).toBe(0)
    })

    it('should handle circular references without infinite loop', () => {
      const graph = new Map<string, string[]>([
        ['A', ['B']],
        ['B', ['A']],  // Circular: A -> B -> A
      ])

      // Should not infinite loop
      const deps = getTransitiveDependencies('A', graph)

      expect(deps.has('B')).toBe(true)
      expect(deps.has('A')).toBe(true) // Will include self due to cycle
    })

    it('should handle item not in graph', () => {
      const graph = new Map<string, string[]>([
        ['A', []],
      ])

      const deps = getTransitiveDependencies('NonExistent', graph)

      expect(deps.size).toBe(0)
    })
  })

  describe('validateWorkflowDependencies', () => {
    it('should return valid for correct dependencies', () => {
      const steps: StepDefinition[] = [
        { id: 'step-1', name: 'Step 1', dependsOn: [] },
        { id: 'step-2', name: 'Step 2', dependsOn: ['step-1'] },
        { id: 'step-3', name: 'Step 3', dependsOn: ['step-2'] },
      ]

      const result = validateWorkflowDependencies(steps)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect orphan/missing dependencies', () => {
      const steps: StepDefinition[] = [
        { id: 'step-1', name: 'Step 1', dependsOn: [] },
        { id: 'step-2', name: 'Step 2', dependsOn: ['non-existent'] },
      ]

      const result = validateWorkflowDependencies(steps)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('non-existent')
    })

    it('should detect circular dependencies', () => {
      const steps: StepDefinition[] = [
        { id: 'step-1', name: 'Step 1', dependsOn: ['step-2'] },
        { id: 'step-2', name: 'Step 2', dependsOn: ['step-1'] },
      ]

      const result = validateWorkflowDependencies(steps)

      expect(result.isValid).toBe(false)
      expect(result.errors.some(e => e.includes('Circular'))).toBe(true)
    })

    it('should handle empty steps array', () => {
      const result = validateWorkflowDependencies([])

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle single step with no dependencies', () => {
      const steps: StepDefinition[] = [
        { id: 'step-1', name: 'Only Step', dependsOn: [] },
      ]

      const result = validateWorkflowDependencies(steps)

      expect(result.isValid).toBe(true)
    })
  })

  describe('buildDependencyGraph', () => {
    it('should build graph from nodes', () => {
      const nodes: GraphNode[] = [
        { id: 'A', dependencies: [] },
        { id: 'B', dependencies: ['A'] },
        { id: 'C', dependencies: ['A', 'B'] },
      ]

      const graph = buildDependencyGraph(nodes)

      expect(graph.get('A')).toEqual([])
      expect(graph.get('B')).toEqual(['A'])
      expect(graph.get('C')).toEqual(['A', 'B'])
    })

    it('should handle nodes without dependencies', () => {
      const nodes: GraphNode[] = [
        { id: 'A' },
        { id: 'B' },
      ]

      const graph = buildDependencyGraph(nodes)

      expect(graph.get('A')).toEqual([])
      expect(graph.get('B')).toEqual([])
    })
  })
})
