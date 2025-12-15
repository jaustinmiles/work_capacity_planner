import { FastifyInstance } from 'fastify'
import getDb from '../db/index.js'

export async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb()

  // Helper to get active session ID
  async function getActiveSessionId(): Promise<string | null> {
    const session = await db.session.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    return session?.id || null
  }

  // GET /api/tasks - List tasks for active session
  fastify.get('/api/tasks', async (request) => {
    const { archived, type, status, completed } = request.query as {
      archived?: string
      type?: string
      status?: string
      completed?: string
    }

    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return []
    }

    const tasks = await db.task.findMany({
      where: {
        sessionId,
        archived: archived === 'true' ? true : archived === 'false' ? false : undefined,
        type: type || undefined,
        overallStatus: status || undefined,
        completed: completed === 'true' ? true : completed === 'false' ? false : undefined,
      },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
      orderBy: [{ importance: 'desc' }, { urgency: 'desc' }, { createdAt: 'desc' }],
    })

    return tasks
  })

  // GET /api/tasks/:id - Get single task
  fastify.get('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const task = await db.task.findUnique({
      where: { id },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
        WorkSession: {
          orderBy: { startTime: 'desc' },
        },
      },
    })

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    return task
  })

  // POST /api/tasks - Create task
  fastify.post('/api/tasks', async (request, reply) => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const body = request.body as {
      name: string
      duration: number
      importance: number
      urgency: number
      type: string
      category?: string
      notes?: string
      deadline?: string
      deadlineType?: string
      cognitiveComplexity?: number
      hasSteps?: boolean
    }

    const task = await db.task.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        name: body.name,
        duration: body.duration,
        importance: body.importance,
        urgency: body.urgency,
        type: body.type,
        category: body.category || 'work',
        notes: body.notes || null,
        deadline: body.deadline ? new Date(body.deadline) : null,
        deadlineType: body.deadlineType || null,
        cognitiveComplexity: body.cognitiveComplexity || null,
        hasSteps: body.hasSteps || false,
        updatedAt: new Date(),
      },
    })

    return task
  })

  // PUT /api/tasks/:id - Update task
  fastify.put('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Partial<{
      name: string
      duration: number
      importance: number
      urgency: number
      type: string
      category: string
      notes: string
      completed: boolean
      archived: boolean
      deadline: string
      deadlineType: string
      cognitiveComplexity: number
      isLocked: boolean
      lockedStartTime: string
      overallStatus: string
    }>

    try {
      const task = await db.task.update({
        where: { id },
        data: {
          ...body,
          deadline: body.deadline ? new Date(body.deadline) : undefined,
          lockedStartTime: body.lockedStartTime ? new Date(body.lockedStartTime) : undefined,
          completedAt: body.completed ? new Date() : undefined,
          updatedAt: new Date(),
        },
      })

      return task
    } catch {
      return reply.status(404).send({ error: 'Task not found' })
    }
  })

  // DELETE /api/tasks/:id - Delete task
  fastify.delete('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await db.task.delete({
        where: { id },
      })
      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Task not found' })
    }
  })

  // POST /api/tasks/:id/complete - Mark task as complete
  fastify.post('/api/tasks/:id/complete', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { actualDuration } = request.body as { actualDuration?: number }

    try {
      const task = await db.task.update({
        where: { id },
        data: {
          completed: true,
          completedAt: new Date(),
          actualDuration: actualDuration || undefined,
          overallStatus: 'completed',
          updatedAt: new Date(),
        },
      })

      return task
    } catch {
      return reply.status(404).send({ error: 'Task not found' })
    }
  })

  // POST /api/tasks/:id/archive - Archive task
  fastify.post('/api/tasks/:id/archive', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const task = await db.task.update({
        where: { id },
        data: {
          archived: true,
          updatedAt: new Date(),
        },
      })

      return task
    } catch {
      return reply.status(404).send({ error: 'Task not found' })
    }
  })

  // === Task Steps (for workflows) ===

  // GET /api/tasks/:id/steps - Get task steps
  fastify.get('/api/tasks/:id/steps', async (request, reply) => {
    const { id } = request.params as { id: string }

    const task = await db.task.findUnique({
      where: { id },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    return task.TaskStep
  })

  // POST /api/tasks/:id/steps - Add step to task
  fastify.post('/api/tasks/:id/steps', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      name: string
      duration: number
      type: string
      dependsOn?: string[]
      asyncWaitTime?: number
      cognitiveComplexity?: number
    }

    // Get current step count for stepIndex
    const existingSteps = await db.taskStep.count({
      where: { taskId: id },
    })

    try {
      const step = await db.taskStep.create({
        data: {
          id: crypto.randomUUID(),
          taskId: id,
          name: body.name,
          duration: body.duration,
          type: body.type,
          stepIndex: existingSteps,
          dependsOn: JSON.stringify(body.dependsOn || []),
          asyncWaitTime: body.asyncWaitTime || 0,
          cognitiveComplexity: body.cognitiveComplexity || null,
        },
      })

      // Update task hasSteps flag and recalculate duration
      await db.task.update({
        where: { id },
        data: {
          hasSteps: true,
          updatedAt: new Date(),
        },
      })

      return step
    } catch {
      return reply.status(404).send({ error: 'Task not found' })
    }
  })

  // PUT /api/tasks/:taskId/steps/:stepId - Update step
  fastify.put('/api/tasks/:taskId/steps/:stepId', async (request, reply) => {
    const { stepId } = request.params as { taskId: string; stepId: string }
    const body = request.body as Partial<{
      name: string
      duration: number
      type: string
      status: string
      percentComplete: number
      notes: string
    }>

    try {
      const step = await db.taskStep.update({
        where: { id: stepId },
        data: {
          ...body,
          completedAt: body.status === 'completed' ? new Date() : undefined,
          startedAt: body.status === 'in_progress' ? new Date() : undefined,
        },
      })

      return step
    } catch {
      return reply.status(404).send({ error: 'Step not found' })
    }
  })

  // DELETE /api/tasks/:taskId/steps/:stepId - Delete step
  fastify.delete('/api/tasks/:taskId/steps/:stepId', async (request, reply) => {
    const { stepId } = request.params as { taskId: string; stepId: string }

    try {
      await db.taskStep.delete({
        where: { id: stepId },
      })
      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Step not found' })
    }
  })

  // === Workflows (tasks with steps) ===

  // GET /api/workflows - Get all workflows for active session
  fastify.get('/api/workflows', async () => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return []
    }

    const workflows = await db.task.findMany({
      where: {
        sessionId,
        hasSteps: true,
        archived: false,
      },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
      orderBy: [{ importance: 'desc' }, { urgency: 'desc' }, { createdAt: 'desc' }],
    })

    return workflows
  })

  // POST /api/workflows - Create workflow with steps
  fastify.post('/api/workflows', async (request, reply) => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const body = request.body as {
      name: string
      duration: number
      importance: number
      urgency: number
      type: string
      category?: string
      notes?: string
      deadline?: string
      deadlineType?: string
      cognitiveComplexity?: number
      steps: Array<{
        name: string
        duration: number
        type: string
        dependsOn?: string[]
        asyncWaitTime?: number
        cognitiveComplexity?: number
      }>
    }

    const taskId = crypto.randomUUID()

    // Create the workflow task
    const workflow = await db.task.create({
      data: {
        id: taskId,
        sessionId,
        name: body.name,
        duration: body.duration,
        importance: body.importance,
        urgency: body.urgency,
        type: body.type,
        category: body.category || 'work',
        notes: body.notes || null,
        deadline: body.deadline ? new Date(body.deadline) : null,
        deadlineType: body.deadlineType || null,
        cognitiveComplexity: body.cognitiveComplexity || null,
        hasSteps: true,
        updatedAt: new Date(),
      },
    })

    // Create all steps
    if (body.steps && body.steps.length > 0) {
      await db.taskStep.createMany({
        data: body.steps.map((step, index) => ({
          id: crypto.randomUUID(),
          taskId,
          name: step.name,
          duration: step.duration,
          type: step.type,
          stepIndex: index,
          dependsOn: JSON.stringify(step.dependsOn || []),
          asyncWaitTime: step.asyncWaitTime || 0,
          cognitiveComplexity: step.cognitiveComplexity || null,
        })),
      })
    }

    // Return workflow with steps
    const result = await db.task.findUnique({
      where: { id: taskId },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    return result
  })

  // DELETE /api/workflows/:id - Delete workflow and all its steps
  fastify.delete('/api/workflows/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      // Delete steps first (cascade should handle this, but be explicit)
      await db.taskStep.deleteMany({
        where: { taskId: id },
      })

      // Delete the workflow task
      await db.task.delete({
        where: { id },
      })

      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Workflow not found' })
    }
  })

  // POST /api/tasks/:id/promote - Promote task to workflow
  fastify.post('/api/tasks/:id/promote', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      const task = await db.task.update({
        where: { id },
        data: {
          hasSteps: true,
          updatedAt: new Date(),
        },
      })

      return task
    } catch {
      return reply.status(404).send({ error: 'Task not found' })
    }
  })
}
