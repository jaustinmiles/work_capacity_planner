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

  // GET /api/work-sessions/task/:taskId - Get sessions for specific task
  fastify.get('/api/work-sessions/task/:taskId', async (request) => {
    const { taskId } = request.params as { taskId: string }

    const sessions = await db.workSession.findMany({
      where: { taskId },
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

  // GET /api/work-sessions/task/:taskId/total - Get total logged time for task
  fastify.get('/api/work-sessions/task/:taskId/total', async (request) => {
    const { taskId } = request.params as { taskId: string }

    const sessions = await db.workSession.findMany({
      where: {
        taskId,
        endTime: { not: null },
      },
      select: {
        actualMinutes: true,
        plannedMinutes: true,
      },
    })

    const totalActual = sessions.reduce((sum, s) => sum + (s.actualMinutes || 0), 0)
    const totalPlanned = sessions.reduce((sum, s) => sum + s.plannedMinutes, 0)

    return {
      taskId,
      totalActualMinutes: totalActual,
      totalPlannedMinutes: totalPlanned,
      sessionCount: sessions.length,
    }
  })

  // GET /api/work-sessions/accumulated - Get accumulated work time for a date
  fastify.get('/api/work-sessions/accumulated', async (request) => {
    const { date } = request.query as { date?: string }

    const targetDate = date ? new Date(date) : new Date()
    const startOfDay = new Date(targetDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(targetDate)
    endOfDay.setHours(23, 59, 59, 999)

    const sessions = await db.workSession.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        actualMinutes: true,
        startTime: true,
        endTime: true,
      },
    })

    // Calculate total, including in-progress sessions
    let totalMinutes = 0
    for (const session of sessions) {
      if (session.actualMinutes) {
        totalMinutes += session.actualMinutes
      } else if (!session.endTime) {
        // In-progress session - calculate current duration
        const now = new Date()
        totalMinutes += Math.round((now.getTime() - session.startTime.getTime()) / (1000 * 60))
      }
    }

    return {
      date: targetDate.toISOString().split('T')[0],
      totalMinutes,
      sessionCount: sessions.length,
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

  // POST /api/work-sessions/:id/split - Split session at a specific time
  fastify.post('/api/work-sessions/:id/split', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { splitTime } = request.body as { splitTime: string }

    const session = await db.workSession.findUnique({
      where: { id },
    })

    if (!session) {
      return reply.status(404).send({ error: 'Work session not found' })
    }

    const splitDate = new Date(splitTime)

    // Validate split time is within session bounds
    if (splitDate <= session.startTime) {
      return reply.status(400).send({ error: 'Split time must be after session start' })
    }

    if (session.endTime && splitDate >= session.endTime) {
      return reply.status(400).send({ error: 'Split time must be before session end' })
    }

    // Calculate minutes for first part
    const firstPartMinutes = Math.round(
      (splitDate.getTime() - session.startTime.getTime()) / (1000 * 60),
    )

    // Update original session to end at split point
    await db.workSession.update({
      where: { id },
      data: {
        endTime: splitDate,
        actualMinutes: firstPartMinutes,
      },
    })

    // Calculate minutes for second part
    const secondPartEnd = session.endTime || new Date()
    const secondPartMinutes = Math.round(
      (secondPartEnd.getTime() - splitDate.getTime()) / (1000 * 60),
    )

    // Create new session starting at split point
    const newSession = await db.workSession.create({
      data: {
        id: crypto.randomUUID(),
        taskId: session.taskId,
        stepId: session.stepId,
        startTime: splitDate,
        endTime: session.endTime,
        plannedMinutes: session.plannedMinutes - firstPartMinutes,
        actualMinutes: session.endTime ? secondPartMinutes : null,
        notes: session.notes,
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

    // Return both sessions
    const updatedOriginal = await db.workSession.findUnique({
      where: { id },
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

    return {
      original: updatedOriginal,
      new: newSession,
    }
  })
}
