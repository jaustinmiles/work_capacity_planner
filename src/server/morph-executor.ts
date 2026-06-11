/**
 * Morph Executor — shared Task/Step structural mutation
 *
 * Applies the task/step structural part of a {@link MorphResult} produced by the
 * deep-work morph planner (`src/shared/deep-work-morph.ts`). This is the
 * workflow-formation engine: it creates the workflow Task, materializes Steps,
 * updates `dependsOn`, archives morphed tasks, reassigns WorkSessions, and
 * recalculates workflow metrics.
 *
 * It is intentionally **store-agnostic**: it never touches a projection/node
 * table. Each surface that projects this graph spatially (the Deep Work Board's
 * `DeepWorkNode`, the visionOS scene's `SpatialEntity`) applies
 * `morphResult.nodeIdentityUpdates` to its own store within the same
 * transaction. This is what lets both surfaces reuse one morph engine instead
 * of duplicating it.
 */

import type { Prisma } from '@prisma/client'
import { getCurrentTime } from '../shared/time-provider'
import { TaskStatus, StepStatus } from '../shared/enums'
import { recalculateWorkflowMetrics } from '../shared/deep-work-morph'
import type { MorphResult } from '../shared/deep-work-board-types'

/**
 * Apply the Task/TaskStep/WorkSession mutations described by a MorphResult.
 *
 * Must run inside a transaction so callers can atomically apply their own
 * projection-store updates (node identity swaps) alongside it.
 *
 * @param tx - An active Prisma transaction client
 * @param morphResult - The declarative morph plan to apply
 */
export async function applyTaskStructureMorph(
  tx: Prisma.TransactionClient,
  morphResult: MorphResult,
): Promise<void> {
  const now = getCurrentTime()

  // 1. Create new workflow task (CreateWorkflow strategy)
  if (morphResult.newWorkflowTask && morphResult.newWorkflowTask.id) {
    const wf = morphResult.newWorkflowTask
    const workflowId = wf.id // Narrowed by the guard above
    if (!workflowId) return // Satisfy TypeScript
    await tx.task.create({
      data: {
        id: workflowId,
        name: wf.name ?? 'Workflow',
        duration: wf.duration ?? 0,
        importance: wf.importance ?? 5,
        urgency: wf.urgency ?? 5,
        type: wf.type ?? '',
        category: 'work',
        hasSteps: true,
        overallStatus: wf.overallStatus ?? TaskStatus.NotStarted,
        criticalPathDuration: wf.criticalPathDuration ?? 0,
        worstCaseDuration: wf.worstCaseDuration ?? 0,
        archived: false,
        inActiveSprint: wf.inActiveSprint ?? false,
        sessionId: wf.sessionId ?? null,
        dependencies: JSON.stringify(wf.dependencies ?? []),
        asyncWaitTime: wf.asyncWaitTime ?? 0,
        createdAt: now,
        updatedAt: now,
      },
    })
  }

  // 2. Create new steps (from morphed tasks)
  for (const stepData of morphResult.stepCreations) {
    // Check if this is a "revert to task" operation (nodeIdentityUpdates has matching entry with taskId)
    const isRevert = morphResult.nodeIdentityUpdates.some(
      (u) => u.taskId === stepData.id && u.stepId === null,
    )

    if (isRevert) {
      // Create a new standalone Task from step data
      await tx.task.create({
        data: {
          id: stepData.id,
          name: stepData.name,
          duration: stepData.duration,
          importance: stepData.importance,
          urgency: stepData.urgency,
          type: stepData.type,
          category: 'work',
          hasSteps: false,
          overallStatus: TaskStatus.NotStarted,
          asyncWaitTime: stepData.asyncWaitTime,
          cognitiveComplexity: stepData.cognitiveComplexity,
          notes: stepData.notes,
          dependencies: '[]',
          sessionId: null, // Will be set from the parent workflow's session
          createdAt: now,
          updatedAt: now,
        },
      })

      // Copy session ID from the source workflow
      const sourceWorkflow = await tx.task.findUnique({
        where: { id: stepData.taskId },
        select: { sessionId: true },
      })
      if (sourceWorkflow?.sessionId) {
        await tx.task.update({
          where: { id: stepData.id },
          data: { sessionId: sourceWorkflow.sessionId },
        })
      }
    } else {
      // Normal step creation
      await tx.taskStep.create({
        data: {
          id: stepData.id,
          taskId: stepData.taskId,
          name: stepData.name,
          duration: stepData.duration,
          type: stepData.type,
          dependsOn: JSON.stringify(stepData.dependsOn),
          stepIndex: stepData.stepIndex,
          asyncWaitTime: stepData.asyncWaitTime,
          cognitiveComplexity: stepData.cognitiveComplexity,
          notes: stepData.notes,
          importance: stepData.importance,
          urgency: stepData.urgency,
          status: StepStatus.Pending,
          percentComplete: 0,
        },
      })
    }
  }

  // 3. Update steps (add/remove dependsOn entries)
  for (const update of morphResult.stepUpdates) {
    await tx.taskStep.update({
      where: { id: update.id },
      data: {
        dependsOn: JSON.stringify(update.dependsOn),
      },
    })
  }

  // 4. Archive original tasks that became steps
  for (const taskId of morphResult.taskArchiveIds) {
    await tx.task.update({
      where: { id: taskId },
      data: {
        archived: true,
        updatedAt: now,
      },
    })
  }

  // 5. Reassign WorkSessions
  for (const wsUpdate of morphResult.workSessionUpdates) {
    await tx.workSession.updateMany({
      where: {
        taskId: wsUpdate.originalTaskId,
        ...(wsUpdate.newStepId ? { stepId: wsUpdate.newStepId } : {}),
      },
      data: {
        taskId: wsUpdate.newTaskId,
        stepId: wsUpdate.newStepId,
      },
    })
  }

  // 6. Recalculate workflow metrics for affected workflows
  const affectedWorkflowIds = new Set<string>()
  for (const sc of morphResult.stepCreations) {
    affectedWorkflowIds.add(sc.taskId)
  }
  for (const su of morphResult.stepUpdates) {
    const step = await tx.taskStep.findUnique({
      where: { id: su.id },
      select: { taskId: true },
    })
    if (step) affectedWorkflowIds.add(step.taskId)
  }

  for (const workflowId of affectedWorkflowIds) {
    // Skip if the workflow was archived
    if (morphResult.taskArchiveIds.includes(workflowId)) continue

    const steps = await tx.taskStep.findMany({
      where: { taskId: workflowId },
      select: { id: true, duration: true, dependsOn: true },
    })

    const parsedSteps = steps.map((s) => ({
      id: s.id,
      duration: s.duration,
      dependsOn: JSON.parse(s.dependsOn || '[]') as string[],
    }))

    const metrics = recalculateWorkflowMetrics(parsedSteps)

    await tx.task.update({
      where: { id: workflowId },
      data: {
        duration: metrics.totalDuration,
        criticalPathDuration: metrics.criticalPathDuration,
        worstCaseDuration: metrics.totalDuration,
        updatedAt: now,
      },
    })
  }
}
