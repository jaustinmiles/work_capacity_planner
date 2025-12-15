import { FastifyInstance } from 'fastify'
import getDb from '../db/index.js'

export async function timeSinkRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb()

  // Helper to get active session ID
  async function getActiveSessionId(): Promise<string | null> {
    const session = await db.session.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    return session?.id || null
  }

  // ========== TIME SINKS (Categories) ==========

  // GET /api/time-sinks - List all time sinks for active session
  fastify.get('/api/time-sinks', async () => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) return []

    const sinks = await db.timeSink.findMany({
      where: { sessionId },
      orderBy: { sortOrder: 'asc' },
    })

    return sinks
  })

  // GET /api/time-sinks/:id - Get a single time sink
  fastify.get('/api/time-sinks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const sink = await db.timeSink.findUnique({
      where: { id },
    })

    if (!sink) {
      return reply.status(404).send({ error: 'Time sink not found' })
    }

    return sink
  })

  // POST /api/time-sinks - Create a new time sink
  fastify.post('/api/time-sinks', async (request, reply) => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const body = request.body as {
      name: string
      emoji: string
      color: string
      typeId?: string
      sortOrder?: number
    }

    // Get max sortOrder for this session
    const maxOrder = await db.timeSink.aggregate({
      where: { sessionId },
      _max: { sortOrder: true },
    })

    const sink = await db.timeSink.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        name: body.name,
        emoji: body.emoji,
        color: body.color,
        typeId: body.typeId || null,
        sortOrder: body.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
        updatedAt: new Date(),
      },
    })

    return sink
  })

  // PUT /api/time-sinks/:id - Update a time sink
  fastify.put('/api/time-sinks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Partial<{
      name: string
      emoji: string
      color: string
      typeId: string
      sortOrder: number
    }>

    try {
      const sink = await db.timeSink.update({
        where: { id },
        data: {
          ...body,
          updatedAt: new Date(),
        },
      })

      return sink
    } catch {
      return reply.status(404).send({ error: 'Time sink not found' })
    }
  })

  // DELETE /api/time-sinks/:id - Delete a time sink
  fastify.delete('/api/time-sinks/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await db.timeSink.delete({ where: { id } })
      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Time sink not found' })
    }
  })

  // PUT /api/time-sinks/reorder - Reorder time sinks
  fastify.put('/api/time-sinks/reorder', async (request, reply) => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const { orderedIds } = request.body as { orderedIds: string[] }

    const updates = orderedIds.map((id, index) =>
      db.timeSink.update({
        where: { id },
        data: { sortOrder: index, updatedAt: new Date() },
      }),
    )

    await Promise.all(updates)

    const sinks = await db.timeSink.findMany({
      where: { sessionId },
      orderBy: { sortOrder: 'asc' },
    })

    return sinks
  })

  // ========== TIME SINK SESSIONS (Time Entries) ==========

  // GET /api/time-sink-sessions - List time sink sessions
  fastify.get('/api/time-sink-sessions', async (request) => {
    const { date, timeSinkId, inProgress } = request.query as {
      date?: string
      timeSinkId?: string
      inProgress?: string
    }

    const where: Record<string, unknown> = {}

    if (timeSinkId) {
      where.timeSinkId = timeSinkId
    }

    if (inProgress === 'true') {
      where.endTime = null
    }

    if (date) {
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      where.startTime = {
        gte: startOfDay,
        lte: endOfDay,
      }
    }

    const sessions = await db.timeSinkSession.findMany({
      where,
      include: {
        TimeSink: {
          select: { id: true, name: true, emoji: true, color: true },
        },
      },
      orderBy: { startTime: 'desc' },
    })

    return sessions
  })

  // GET /api/time-sink-sessions/active - Get active time sink session
  fastify.get('/api/time-sink-sessions/active', async () => {
    const session = await db.timeSinkSession.findFirst({
      where: { endTime: null },
      include: {
        TimeSink: {
          select: { id: true, name: true, emoji: true, color: true },
        },
      },
    })

    return session || null
  })

  // GET /api/time-sink-sessions/accumulated - Get accumulated time by sink
  fastify.get('/api/time-sink-sessions/accumulated', async (request) => {
    const { startDate, endDate } = request.query as {
      startDate?: string
      endDate?: string
    }

    const sessionId = await getActiveSessionId()
    if (!sessionId) return {}

    const where: Record<string, unknown> = {
      endTime: { not: null },
      TimeSink: { sessionId },
    }

    if (startDate && endDate) {
      where.startTime = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const sessions = await db.timeSinkSession.findMany({
      where,
      select: {
        actualMinutes: true,
        TimeSink: {
          select: { id: true, name: true, emoji: true, color: true },
        },
      },
    })

    // Group by time sink
    const accumulated: Record<
      string,
      { timeSink: { id: string; name: string; emoji: string; color: string }; totalMinutes: number }
    > = {}

    for (const session of sessions) {
      const sinkId = session.TimeSink.id
      if (!accumulated[sinkId]) {
        accumulated[sinkId] = {
          timeSink: session.TimeSink,
          totalMinutes: 0,
        }
      }
      accumulated[sinkId].totalMinutes += session.actualMinutes || 0
    }

    return Object.values(accumulated)
  })

  // GET /api/time-sink-sessions/date/:date - Get sessions for specific date
  fastify.get('/api/time-sink-sessions/date/:date', async (request) => {
    const { date } = request.params as { date: string }

    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const sessions = await db.timeSinkSession.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        TimeSink: {
          select: { id: true, name: true, emoji: true, color: true },
        },
      },
      orderBy: { startTime: 'desc' },
    })

    return sessions
  })

  // POST /api/time-sink-sessions - Start a time sink session
  fastify.post('/api/time-sink-sessions', async (request, reply) => {
    const { timeSinkId, notes } = request.body as {
      timeSinkId: string
      notes?: string
    }

    // Check if there's already an active session
    const activeSession = await db.timeSinkSession.findFirst({
      where: { endTime: null },
    })

    if (activeSession) {
      return reply.status(400).send({
        error: 'A time sink session is already in progress',
        activeSession,
      })
    }

    // Verify time sink exists
    const sink = await db.timeSink.findUnique({
      where: { id: timeSinkId },
    })

    if (!sink) {
      return reply.status(404).send({ error: 'Time sink not found' })
    }

    const session = await db.timeSinkSession.create({
      data: {
        id: crypto.randomUUID(),
        timeSinkId,
        startTime: new Date(),
        notes: notes || null,
      },
      include: {
        TimeSink: {
          select: { id: true, name: true, emoji: true, color: true },
        },
      },
    })

    return session
  })

  // PUT /api/time-sink-sessions/:id/end - End a time sink session
  fastify.put('/api/time-sink-sessions/:id/end', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { notes } = request.body as { notes?: string }

    const session = await db.timeSinkSession.findUnique({
      where: { id },
    })

    if (!session) {
      return reply.status(404).send({ error: 'Time sink session not found' })
    }

    if (session.endTime) {
      return reply.status(400).send({ error: 'Time sink session already ended' })
    }

    const endTime = new Date()
    const actualMinutes = Math.round(
      (endTime.getTime() - session.startTime.getTime()) / (1000 * 60),
    )

    const updated = await db.timeSinkSession.update({
      where: { id },
      data: {
        endTime,
        actualMinutes,
        notes: notes || session.notes,
      },
      include: {
        TimeSink: {
          select: { id: true, name: true, emoji: true, color: true },
        },
      },
    })

    return updated
  })

  // DELETE /api/time-sink-sessions/:id - Delete a time sink session
  fastify.delete('/api/time-sink-sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await db.timeSinkSession.delete({ where: { id } })
      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Time sink session not found' })
    }
  })

  // POST /api/time-sink-sessions/:id/split - Split session at a specific time
  fastify.post('/api/time-sink-sessions/:id/split', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { splitTime } = request.body as { splitTime: string }

    const session = await db.timeSinkSession.findUnique({
      where: { id },
    })

    if (!session) {
      return reply.status(404).send({ error: 'Time sink session not found' })
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
    await db.timeSinkSession.update({
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
    const newSession = await db.timeSinkSession.create({
      data: {
        id: crypto.randomUUID(),
        timeSinkId: session.timeSinkId,
        startTime: splitDate,
        endTime: session.endTime,
        actualMinutes: session.endTime ? secondPartMinutes : null,
        notes: session.notes,
      },
      include: {
        TimeSink: {
          select: { id: true, name: true, emoji: true, color: true },
        },
      },
    })

    // Return both sessions
    const updatedOriginal = await db.timeSinkSession.findUnique({
      where: { id },
      include: {
        TimeSink: {
          select: { id: true, name: true, emoji: true, color: true },
        },
      },
    })

    return {
      original: updatedOriginal,
      new: newSession,
    }
  })
}
