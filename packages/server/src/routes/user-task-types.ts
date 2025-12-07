import { FastifyInstance } from 'fastify'
import getDb from '../db/index.js'

export async function userTaskTypeRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb()

  // Helper to get active session ID
  async function getActiveSessionId(): Promise<string | null> {
    const session = await db.session.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    return session?.id || null
  }

  // GET /api/user-task-types - List all user task types for active session
  fastify.get('/api/user-task-types', async () => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) return []

    const types = await db.userTaskType.findMany({
      where: { sessionId },
      orderBy: { sortOrder: 'asc' },
    })

    return types
  })

  // GET /api/user-task-types/has-any - Check if session has any task types
  fastify.get('/api/user-task-types/has-any', async () => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) return { hasTypes: false }

    const count = await db.userTaskType.count({
      where: { sessionId },
    })

    return { hasTypes: count > 0 }
  })

  // GET /api/user-task-types/:id - Get a single task type
  fastify.get('/api/user-task-types/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const type = await db.userTaskType.findUnique({
      where: { id },
    })

    if (!type) {
      return reply.status(404).send({ error: 'Task type not found' })
    }

    return type
  })

  // POST /api/user-task-types - Create a new task type
  fastify.post('/api/user-task-types', async (request, reply) => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const body = request.body as {
      name: string
      emoji: string
      color: string
      sortOrder?: number
    }

    // Get max sortOrder for this session
    const maxOrder = await db.userTaskType.aggregate({
      where: { sessionId },
      _max: { sortOrder: true },
    })

    const type = await db.userTaskType.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        name: body.name,
        emoji: body.emoji,
        color: body.color,
        sortOrder: body.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
        updatedAt: new Date(),
      },
    })

    return type
  })

  // PUT /api/user-task-types/:id - Update a task type
  fastify.put('/api/user-task-types/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Partial<{
      name: string
      emoji: string
      color: string
      sortOrder: number
    }>

    try {
      const type = await db.userTaskType.update({
        where: { id },
        data: {
          ...body,
          updatedAt: new Date(),
        },
      })

      return type
    } catch {
      return reply.status(404).send({ error: 'Task type not found' })
    }
  })

  // DELETE /api/user-task-types/:id - Delete a task type
  fastify.delete('/api/user-task-types/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await db.userTaskType.delete({ where: { id } })
      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Task type not found' })
    }
  })

  // PUT /api/user-task-types/reorder - Reorder task types
  fastify.put('/api/user-task-types/reorder', async (request, reply) => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const { orderedIds } = request.body as { orderedIds: string[] }

    // Update each type's sortOrder based on position in array
    const updates = orderedIds.map((id, index) =>
      db.userTaskType.update({
        where: { id },
        data: { sortOrder: index, updatedAt: new Date() },
      }),
    )

    await Promise.all(updates)

    // Return updated list
    const types = await db.userTaskType.findMany({
      where: { sessionId },
      orderBy: { sortOrder: 'asc' },
    })

    return types
  })
}
