/**
 * Tests for step dependency resolution
 *
 * Brute force tests for resolveStepDependencies and
 * resolveDependenciesAgainstExisting — the two functions
 * that ensure dependsOn ALWAYS contains valid step IDs,
 * never step names.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  resolveStepDependencies,
  resolveDependenciesAgainstExisting,
} from '../step-id-utils'

// Suppress logger warnings during tests
vi.mock('../../logger', () => ({
  logger: {
    system: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    ui: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  },
}))

describe('resolveStepDependencies', () => {
  it('should resolve name-based dependencies to step IDs', () => {
    const steps = [
      { id: 'step-001', name: 'Create calendar', dependsOn: [] },
      { id: 'step-002', name: 'Research open mics', dependsOn: ['Create calendar'] },
      { id: 'step-003', name: 'Attend first event', dependsOn: ['Research open mics'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[0].dependsOn).toEqual([])
    expect(resolved[1].dependsOn).toEqual(['step-001'])
    expect(resolved[2].dependsOn).toEqual(['step-002'])
  })

  it('should pass through ID-based dependencies unchanged', () => {
    const steps = [
      { id: 'step-aaa', name: 'Step A', dependsOn: [] },
      { id: 'step-bbb', name: 'Step B', dependsOn: ['step-aaa'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[1].dependsOn).toEqual(['step-aaa'])
  })

  it('should handle mixed name and ID dependencies', () => {
    const steps = [
      { id: 'step-001', name: 'First step', dependsOn: [] },
      { id: 'step-002', name: 'Second step', dependsOn: [] },
      { id: 'step-003', name: 'Third step', dependsOn: ['step-001', 'Second step'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[2].dependsOn).toEqual(['step-001', 'step-002'])
  })

  it('should drop invalid/unresolvable dependencies', () => {
    const steps = [
      { id: 'step-001', name: 'Real step', dependsOn: [] },
      { id: 'step-002', name: 'Depends on ghost', dependsOn: ['Nonexistent step', 'step-999'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[1].dependsOn).toEqual([])
  })

  it('should handle case-insensitive name matching', () => {
    const steps = [
      { id: 'step-001', name: 'Create Google Calendar', dependsOn: [] },
      { id: 'step-002', name: 'Research events', dependsOn: ['create google calendar'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[1].dependsOn).toEqual(['step-001'])
  })

  it('should handle "step N" numeric references', () => {
    const steps = [
      { id: 'step-001', name: 'First', dependsOn: [] },
      { id: 'step-002', name: 'Second', dependsOn: [] },
      { id: 'step-003', name: 'Third', dependsOn: ['Step 1', 'step 2'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[2].dependsOn).toEqual(['step-001', 'step-002'])
  })

  it('should handle empty dependsOn arrays', () => {
    const steps = [
      { id: 'step-001', name: 'Solo step', dependsOn: [] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[0].dependsOn).toEqual([])
  })

  it('should handle multiple steps depending on the same step', () => {
    const steps = [
      { id: 'step-001', name: 'Setup', dependsOn: [] },
      { id: 'step-002', name: 'Branch A', dependsOn: ['Setup'] },
      { id: 'step-003', name: 'Branch B', dependsOn: ['Setup'] },
      { id: 'step-004', name: 'Branch C', dependsOn: ['Setup'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[1].dependsOn).toEqual(['step-001'])
    expect(resolved[2].dependsOn).toEqual(['step-001'])
    expect(resolved[3].dependsOn).toEqual(['step-001'])
  })

  it('should handle a step with multiple dependencies', () => {
    const steps = [
      { id: 'step-001', name: 'Research', dependsOn: [] },
      { id: 'step-002', name: 'Design', dependsOn: [] },
      { id: 'step-003', name: 'Build', dependsOn: ['Research', 'Design'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[2].dependsOn).toEqual(['step-001', 'step-002'])
  })

  it('should preserve all other step fields', () => {
    const steps = [
      { id: 'step-001', name: 'A', dependsOn: [], duration: 30, type: 'dev' },
      { id: 'step-002', name: 'B', dependsOn: ['A'], duration: 60, type: 'review' },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[0].duration).toBe(30)
    expect(resolved[0].type).toBe('dev')
    expect(resolved[1].duration).toBe(60)
    expect(resolved[1].type).toBe('review')
    expect(resolved[1].dependsOn).toEqual(['step-001'])
  })

  it('should handle the exact Fremont community workflow pattern that was broken', () => {
    const steps = [
      { id: 'step-001', name: 'Create Google Calendar called \'Third Places / Events\'', dependsOn: [] },
      { id: 'step-002', name: 'Research and add songwriting open mics in Fremont area', dependsOn: ['Create Google Calendar called \'Third Places / Events\''] },
      { id: 'step-003', name: 'Research and add poetry open mics in Fremont area', dependsOn: ['Create Google Calendar called \'Third Places / Events\''] },
      { id: 'step-004', name: 'Research and add yoga on the beach / community wellness events', dependsOn: ['Create Google Calendar called \'Third Places / Events\''] },
      { id: 'step-005', name: 'Attend first open mic or event from the calendar', dependsOn: ['Research and add songwriting open mics in Fremont area', 'Research and add poetry open mics in Fremont area'] },
    ]

    const resolved = resolveStepDependencies(steps)

    expect(resolved[0].dependsOn).toEqual([])
    expect(resolved[1].dependsOn).toEqual(['step-001'])
    expect(resolved[2].dependsOn).toEqual(['step-001'])
    expect(resolved[3].dependsOn).toEqual(['step-001'])
    expect(resolved[4].dependsOn).toEqual(['step-002', 'step-003'])
  })
})

describe('resolveDependenciesAgainstExisting', () => {
  const existingSteps = [
    { id: 'step-aaa', name: 'Setup environment' },
    { id: 'step-bbb', name: 'Write code' },
    { id: 'step-ccc', name: 'Run tests' },
  ]

  it('should resolve name-based deps against existing steps', () => {
    const deps = ['Setup environment', 'Write code']
    const resolved = resolveDependenciesAgainstExisting(deps, existingSteps)

    expect(resolved).toEqual(['step-aaa', 'step-bbb'])
  })

  it('should pass through ID-based deps', () => {
    const deps = ['step-aaa', 'step-ccc']
    const resolved = resolveDependenciesAgainstExisting(deps, existingSteps)

    expect(resolved).toEqual(['step-aaa', 'step-ccc'])
  })

  it('should handle mixed name and ID deps', () => {
    const deps = ['step-aaa', 'Write code']
    const resolved = resolveDependenciesAgainstExisting(deps, existingSteps)

    expect(resolved).toEqual(['step-aaa', 'step-bbb'])
  })

  it('should drop unresolvable deps', () => {
    const deps = ['Setup environment', 'Nonexistent step']
    const resolved = resolveDependenciesAgainstExisting(deps, existingSteps)

    expect(resolved).toEqual(['step-aaa'])
  })

  it('should handle case-insensitive matching', () => {
    const deps = ['setup environment', 'WRITE CODE']
    const resolved = resolveDependenciesAgainstExisting(deps, existingSteps)

    expect(resolved).toEqual(['step-aaa', 'step-bbb'])
  })

  it('should handle empty deps array', () => {
    const resolved = resolveDependenciesAgainstExisting([], existingSteps)
    expect(resolved).toEqual([])
  })

  it('should handle empty existing steps', () => {
    const resolved = resolveDependenciesAgainstExisting(['Some step'], [])
    expect(resolved).toEqual([])
  })
})
