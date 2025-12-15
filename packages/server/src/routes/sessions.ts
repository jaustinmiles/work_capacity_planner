import { FastifyInstance } from 'fastify'
import getDb from '../db/index.js'

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb()

  // GET /api/sessions - List all sessions
  fastify.get('/api/sessions', async () => {
    const sessions = await db.session.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return sessions
  })

  // GET /api/sessions/active - Get active session
  fastify.get('/api/sessions/active', async (request, reply) => {
    const session = await db.session.findFirst({
      where: { isActive: true },
    })

    if (!session) {
      return reply.status(404).send({ error: 'No active session' })
    }

    return session
  })

  // POST /api/sessions - Create new session
  fastify.post('/api/sessions', async (request) => {
    const { name, description } = request.body as { name: string; description?: string }

    const session = await db.session.create({
      data: {
        id: crypto.randomUUID(),
        name,
        description: description || null,
        isActive: false,
        updatedAt: new Date(),
      },
    })

    return session
  })

  // PUT /api/sessions/:id - Update session details
  fastify.put('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name, description } = request.body as {
      name?: string
      description?: string
    }

    try {
      const session = await db.session.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          updatedAt: new Date(),
        },
      })

      return session
    } catch {
      return reply.status(404).send({ error: 'Session not found' })
    }
  })

  // PUT /api/sessions/:id/activate - Activate a session
  fastify.put('/api/sessions/:id/activate', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Deactivate all other sessions
    await db.session.updateMany({
      where: { isActive: true },
      data: { isActive: false, updatedAt: new Date() },
    })

    // Activate the requested session
    const session = await db.session.update({
      where: { id },
      data: { isActive: true, updatedAt: new Date() },
    })

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' })
    }

    return session
  })

  // DELETE /api/sessions/:id - Delete a session
  fastify.delete('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await db.session.delete({
        where: { id },
      })
      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Session not found' })
    }
  })
}
