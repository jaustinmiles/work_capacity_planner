import { describe, it, expect } from 'vitest'
import { GraphNodePrefix, GraphEdgePrefix } from '../enums'
import { makeNodeId, makeEdgeId, parseNodeId, isNodeType } from '../graph-node-ids'

describe('makeNodeId', () => {
  it('should create step node ID', () => {
    expect(makeNodeId(GraphNodePrefix.Step, 'abc123')).toBe('step-abc123')
  })

  it('should create task node ID', () => {
    expect(makeNodeId(GraphNodePrefix.Task, 'xyz')).toBe('task-xyz')
  })

  it('should create endeavor node ID', () => {
    expect(makeNodeId(GraphNodePrefix.Endeavor, 'e1')).toBe('endeavor-e1')
  })

  it('should create goal node ID', () => {
    expect(makeNodeId(GraphNodePrefix.Goal, 'g1')).toBe('goal-g1')
  })
})

describe('makeEdgeId', () => {
  it('should create internal edge ID with two parts', () => {
    expect(makeEdgeId(GraphEdgePrefix.Internal, 's1', 's2')).toBe('edge-s1-s2')
  })

  it('should create dependency edge ID with one part', () => {
    expect(makeEdgeId(GraphEdgePrefix.Dependency, 'dep-uuid')).toBe('dep-dep-uuid')
  })

  it('should create edge ID with multiple parts', () => {
    expect(makeEdgeId(GraphEdgePrefix.Internal, 's1', 'goal', 'e1')).toBe('edge-s1-goal-e1')
  })
})

describe('parseNodeId', () => {
  it('should parse step node ID', () => {
    const result = parseNodeId('step-abc123')
    expect(result).toEqual({ prefix: GraphNodePrefix.Step, id: 'abc123' })
  })

  it('should parse task node ID', () => {
    const result = parseNodeId('task-xyz')
    expect(result).toEqual({ prefix: GraphNodePrefix.Task, id: 'xyz' })
  })

  it('should parse endeavor node ID', () => {
    const result = parseNodeId('endeavor-e1')
    expect(result).toEqual({ prefix: GraphNodePrefix.Endeavor, id: 'e1' })
  })

  it('should parse goal node ID', () => {
    const result = parseNodeId('goal-g1')
    expect(result).toEqual({ prefix: GraphNodePrefix.Goal, id: 'g1' })
  })

  it('should return null for unknown prefix', () => {
    expect(parseNodeId('unknown-abc')).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(parseNodeId('')).toBeNull()
  })

  it('should handle IDs containing dashes', () => {
    const result = parseNodeId('step-my-step-id')
    expect(result).toEqual({ prefix: GraphNodePrefix.Step, id: 'my-step-id' })
  })

  it('should round-trip through make and parse', () => {
    for (const prefix of Object.values(GraphNodePrefix)) {
      const id = 'test-id-123'
      const nodeId = makeNodeId(prefix, id)
      const parsed = parseNodeId(nodeId)
      expect(parsed).toEqual({ prefix, id })
    }
  })
})

describe('isNodeType', () => {
  it('should return true for matching prefix', () => {
    expect(isNodeType('step-abc', GraphNodePrefix.Step)).toBe(true)
    expect(isNodeType('task-abc', GraphNodePrefix.Task)).toBe(true)
    expect(isNodeType('endeavor-abc', GraphNodePrefix.Endeavor)).toBe(true)
    expect(isNodeType('goal-abc', GraphNodePrefix.Goal)).toBe(true)
  })

  it('should return false for non-matching prefix', () => {
    expect(isNodeType('step-abc', GraphNodePrefix.Task)).toBe(false)
    expect(isNodeType('task-abc', GraphNodePrefix.Step)).toBe(false)
  })

  it('should return false for unknown prefix', () => {
    expect(isNodeType('unknown-abc', GraphNodePrefix.Step)).toBe(false)
  })

  it('should return false for empty string', () => {
    expect(isNodeType('', GraphNodePrefix.Step)).toBe(false)
  })

  it('should not match partial prefixes', () => {
    // "step" without the dash should not match
    expect(isNodeType('stepabc', GraphNodePrefix.Step)).toBe(false)
  })
})
