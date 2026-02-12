/**
 * useGraphDependencies - Hook for managing dependency edges in the endeavor graph
 *
 * Handles three connection scenarios:
 * 1. Same workflow → update step's dependsOn[] array
 * 2. Same endeavor, different workflow → create EndeavorDependency
 * 3. Cross-endeavor → create EndeavorDependency
 *
 * Validates connections for cycles before persisting.
 */

import { useCallback, useMemo } from 'react'
import type { Edge, Connection } from 'reactflow'
import { MarkerType } from 'reactflow'
import type { EndeavorWithTasks, EndeavorDependencyWithNames } from '@shared/types'
import { detectDependencyCycles } from '@shared/graph-utils'
import { useEndeavorStore } from '../../../store/useEndeavorStore'
import { useTaskStore } from '../../../store/useTaskStore'
import { Message } from '../../common/Message'

interface NodeIdInfo {
  type: 'step' | 'task'
  id: string
  endeavorId: string
  taskId: string
}

/**
 * Parse a graph node ID to extract step/task/endeavor info
 * Node IDs are formatted as:
 *   step-{stepId}  → workflow step
 *   task-{taskId}  → simple task
 */
function parseNodeId(
  nodeId: string,
  endeavors: EndeavorWithTasks[],
): NodeIdInfo | null {
  const isStep = nodeId.startsWith('step-')
  const isTask = nodeId.startsWith('task-')
  const rawId = nodeId.replace(/^(step-|task-)/, '')

  for (const endeavor of endeavors) {
    for (const item of endeavor.items) {
      if (isTask && item.task.id === rawId) {
        return { type: 'task', id: rawId, endeavorId: endeavor.id, taskId: item.task.id }
      }
      if (isStep && item.task.steps) {
        const step = item.task.steps.find(s => s.id === rawId)
        if (step) {
          return { type: 'step', id: rawId, endeavorId: endeavor.id, taskId: item.task.id }
        }
      }
    }
  }
  return null
}

/**
 * Check if adding a dependency would create a cycle
 */
function wouldCreateCycle(
  sourceStepId: string,
  targetStepId: string,
  endeavors: EndeavorWithTasks[],
  existingDeps: Map<string, EndeavorDependencyWithNames[]>,
): boolean {
  // Build a unified graph of all step dependencies
  const graph = new Map<string, string[]>()

  for (const endeavor of endeavors) {
    for (const item of endeavor.items) {
      if (item.task.steps) {
        for (const step of item.task.steps) {
          const deps = [...step.dependsOn]
          graph.set(step.id, deps)
        }
      } else {
        graph.set(item.task.id, [...item.task.dependencies])
      }
    }
  }

  // Add cross-endeavor dependencies
  for (const [, deps] of existingDeps) {
    for (const dep of deps) {
      if (dep.blockedStepId) {
        const existing = graph.get(dep.blockedStepId) ?? []
        existing.push(dep.blockingStepId)
        graph.set(dep.blockedStepId, existing)
      }
    }
  }

  // Add the proposed new dependency
  const existingTargetDeps = graph.get(targetStepId) ?? []
  graph.set(targetStepId, [...existingTargetDeps, sourceStepId])

  const result = detectDependencyCycles(graph)
  return result.hasCycle
}

interface UseGraphDependenciesResult {
  dependencyEdges: Edge[]
  onConnect: (connection: Connection) => Promise<void>
  onDeleteDependency: (dependencyId: string) => Promise<void>
}

export function useGraphDependencies(
  endeavors: EndeavorWithTasks[],
  isEditable: boolean,
): UseGraphDependenciesResult {
  const { addDependency, removeDependency, dependencies } = useEndeavorStore()
  const { updateSequencedTask, sequencedTasks } = useTaskStore()

  // Convert EndeavorDependency[] to ReactFlow Edge[]
  const dependencyEdges = useMemo(() => {
    const edges: Edge[] = []

    for (const [endeavorId, deps] of dependencies) {
      for (const dep of deps) {
        const sourceNodeId = `step-${dep.blockingStepId}`
        const targetNodeId = dep.blockedStepId
          ? `step-${dep.blockedStepId}`
          : dep.blockedTaskId
            ? `task-${dep.blockedTaskId}`
            : null

        if (!targetNodeId) continue

        edges.push({
          id: `dep-${dep.id}`,
          source: sourceNodeId,
          target: targetNodeId,
          type: 'dependency',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color: dep.isHardBlock ? '#F77234' : '#F7BA1E' },
          data: {
            isHardBlock: dep.isHardBlock,
            notes: dep.notes,
            dependencyId: dep.id,
            isEditable,
            endeavorId,
          },
        })
      }
    }

    return edges
  }, [dependencies, isEditable])

  // Handle new connection from drag
  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return

    const source = parseNodeId(connection.source, endeavors)
    const target = parseNodeId(connection.target, endeavors)

    if (!source || !target) {
      Message.warning('Cannot connect these nodes')
      return
    }

    // Prevent self-connection
    if (source.id === target.id) return

    // Check for cycles
    if (wouldCreateCycle(source.id, target.id, endeavors, dependencies)) {
      Message.error('Cannot create dependency: would create a circular dependency')
      return
    }

    const sameWorkflow = source.taskId === target.taskId
    const sameEndeavor = source.endeavorId === target.endeavorId

    if (sameWorkflow && source.type === 'step' && target.type === 'step') {
      // Case 1: Same workflow — update step dependsOn[]
      const workflow = sequencedTasks.find(t => t.id === source.taskId)
      if (!workflow) return

      const targetStep = workflow.steps.find(s => s.id === target.id)
      if (!targetStep) return

      if (targetStep.dependsOn.includes(source.id)) {
        Message.info('Dependency already exists')
        return
      }

      const updatedSteps = workflow.steps.map(step =>
        step.id === target.id
          ? { ...step, dependsOn: [...step.dependsOn, source.id] }
          : step,
      )

      await updateSequencedTask(workflow.id, { steps: updatedSteps })
      Message.success('Step dependency added')
    } else {
      // Case 2 & 3: Cross-workflow or cross-endeavor — create EndeavorDependency
      // The dependency is on the target's endeavor (the one being blocked)
      await addDependency({
        endeavorId: target.endeavorId,
        blockedStepId: target.type === 'step' ? target.id : undefined,
        blockedTaskId: target.type === 'task' ? target.id : undefined,
        blockingStepId: source.id,
        isHardBlock: true,
      })
      Message.success(
        sameEndeavor
          ? 'Cross-workflow dependency added'
          : 'Cross-endeavor dependency added',
      )
    }
  }, [endeavors, dependencies, sequencedTasks, addDependency, updateSequencedTask])

  // Handle dependency deletion (for EndeavorDependency edges only)
  const onDeleteDependency = useCallback(async (dependencyId: string) => {
    // Find which endeavor owns this dependency
    for (const [endeavorId, deps] of dependencies) {
      const dep = deps.find(d => d.id === dependencyId)
      if (dep) {
        await removeDependency(dependencyId, endeavorId)
        Message.success('Dependency removed')
        return
      }
    }
  }, [dependencies, removeDependency])

  return { dependencyEdges, onConnect, onDeleteDependency }
}
