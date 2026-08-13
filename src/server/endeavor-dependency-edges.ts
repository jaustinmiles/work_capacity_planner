/**
 * Loads a session's endeavor dependencies in the shape the scheduler consumes
 * (ScheduleContext.endeavorDependencies). Shared by the endeavor router's
 * getAllDependencies and the task router's scheduling procedures — ONE query
 * implementation, not three.
 */

import { PrismaClient } from '@prisma/client'

export interface EndeavorDependencyEdgeRow {
  id: string
  endeavorId: string
  blockedTaskId: string | null
  blockedStepId: string | null
  blockingStepId: string
  blockingTaskId: string
  isHardBlock: boolean
  notes: string | null
  createdAt: Date
  blockingStepName: string
  blockingStepStatus: string
}

export async function loadEndeavorDependencyEdges(
  prisma: PrismaClient,
  sessionId: string,
): Promise<EndeavorDependencyEdgeRow[]> {
  const dependencies = await prisma.endeavorDependency.findMany({
    where: { Endeavor: { sessionId } },
    orderBy: { createdAt: 'asc' },
  })
  if (dependencies.length === 0) {
    return []
  }

  const stepIds = [...new Set(dependencies.map((dep) => dep.blockingStepId))]
  const steps = await prisma.taskStep.findMany({
    where: { id: { in: stepIds } },
    select: { id: true, name: true, status: true },
  })
  const stepById = new Map(steps.map((step) => [step.id, step]))

  return dependencies.map((dep) => ({
    ...dep,
    blockingStepName: stepById.get(dep.blockingStepId)?.name ?? 'Unknown',
    blockingStepStatus: stepById.get(dep.blockingStepId)?.status ?? 'pending',
  }))
}
