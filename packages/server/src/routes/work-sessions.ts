import { FastifyInstance } from 'fastify'
import getDb from '../db/index.js'

export async function workSessionRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb()

  // GET /api/work-sessions - List work sessions
  fastify.get('/api/work-sessions', async (request) => {
    const { date, taskId, inProgress } = request.query as {
      date?: string
      taskId?: string
      inProgress?: string
    }

    const where: Record<string, unknown> = {}

    if (taskId) {
      where.taskId = taskId
    }

    if (inProgress === 'true') {
      where.endTime = null
    }

    if (date) {
      // Filter by date (start of day to end of day)
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      where.startTime = {
        gte: startOfDay,
        lte: endOfDay,
      }
    }

    const sessions = await db.workSession.findMany({
      where,
      include: {
        Task: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    })

    return sessions
  })

  // GET /api/work-sessions/active - Get currently active work session
  fastify.get('/api/work-sessions/active', async () => {
    const session = await db.workSession.findFirst({
      where: { endTime: null },
      include: {
        Task: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    })

    return session || null
  })

  // POST /api/work-sessions/start - Start a new work session
  fastify.post('/api/work-sessions/start', async (request, reply) => {
    const { taskId, stepId, plannedMinutes, notes } = request.body as {
      taskId: string
      stepId?: string
      plannedMinutes?: number
      notes?: string
    }

    // Check if there's already an active session
    const activeSession = await db.workSession.findFirst({
      where: { endTime: null },
    })

    if (activeSession) {
      return reply.status(400).send({
        error: 'A work session is already in progress',
        activeSession,
      })
    }

    // Verify task exists
    const task = await db.task.findUnique({
      where: { id: taskId },
    })

    if (!task) {
      return reply.status(404).send({ error: 'Task not found' })
    }

    const session = await db.workSession.create({
      data: {
        id: crypto.randomUUID(),
        taskId,
        stepId: stepId || null,
        startTime: new Date(),
        plannedMinutes: plannedMinutes || task.duration,
        notes: notes || null,
      },
      include: {
        Task: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    })

    return session
  })

  // PUT /api/work-sessions/:id/stop - Stop a work session
  fastify.put('/api/work-sessions/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { notes } = request.body as { notes?: string }

    const session = await db.workSession.findUnique({
      where: { id },
    })

    if (!session) {
      return reply.status(404).send({ error: 'Work session not found' })
    }

    if (session.endTime) {
      return reply.status(400).send({ error: 'Work session already ended' })
    }

    const endTime = new Date()
    const actualMinutes = Math.round(
      (endTime.getTime() - session.startTime.getTime()) / (1000 * 60),
    )

    const updated = await db.workSession.update({
      where: { id },
      data: {
        endTime,
        actualMinutes,
        notes: notes || session.notes,
      },
      include: {
        Task: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    })

    return updated
  })

  // DELETE /api/work-sessions/:id - Delete a work session
  fastify.delete('/api/work-sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await db.workSession.delete({
        where: { id },
      })
      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Work session not found' })
    }
  })

  // GET /api/work-sessions/stats - Get work session statistics
  fastify.get('/api/work-sessions/stats', async (request) => {
    const { date, startDate, endDate } = request.query as {
      date?: string
      startDate?: string
      endDate?: string
    }

    let dateFilter = {}

    if (date) {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)
      dateFilter = {
        startTime: { gte: startOfDay, lte: endOfDay },
      }
    } else if (startDate && endDate) {
      dateFilter = {
        startTime: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }
    }

    const sessions = await db.workSession.findMany({
      where: {
        ...dateFilter,
        endTime: { not: null },
      },
      select: {
        actualMinutes: true,
        plannedMinutes: true,
        Task: {
          select: {
            type: true,
          },
        },
      },
    })

    const totalActual = sessions.reduce((sum, s) => sum + (s.actualMinutes || 0), 0)
    const totalPlanned = sessions.reduce((sum, s) => sum + s.plannedMinutes, 0)

    // Group by type
    const byType: Record<string, { actual: number; planned: number; count: number }> = {}
    for (const session of sessions) {
      const type = session.Task?.type || 'unknown'
      if (!byType[type]) {
        byType[type] = { actual: 0, planned: 0, count: 0 }
      }
      byType[type].actual += session.actualMinutes || 0
      byType[type].planned += session.plannedMinutes
      byType[type].count += 1
    }

    return {
      totalSessions: sessions.length,
      totalActualMinutes: totalActual,
      totalPlannedMinutes: totalPlanned,
      accuracyRatio: totalPlanned > 0 ? totalActual / totalPlanned : 0,
      byType,
    }
  })
}
