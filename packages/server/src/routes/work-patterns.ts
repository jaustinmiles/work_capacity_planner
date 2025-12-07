import { FastifyInstance } from 'fastify'
import getDb from '../db/index.js'

export async function workPatternRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDb()

  // Helper to get active session ID
  async function getActiveSessionId(): Promise<string | null> {
    const session = await db.session.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    return session?.id || null
  }

  // GET /api/work-patterns - List all work patterns for active session
  fastify.get('/api/work-patterns', async () => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) return []

    const patterns = await db.workPattern.findMany({
      where: { sessionId },
      include: {
        WorkBlock: { orderBy: { startTime: 'asc' } },
        WorkMeeting: { orderBy: { startTime: 'asc' } },
      },
      orderBy: { date: 'desc' },
    })

    return patterns
  })

  // GET /api/work-patterns/date/:date - Get work pattern for a specific date
  fastify.get('/api/work-patterns/date/:date', async (request, reply) => {
    const { date } = request.params as { date: string }
    const sessionId = await getActiveSessionId()

    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const pattern = await db.workPattern.findUnique({
      where: {
        sessionId_date: { sessionId, date },
      },
      include: {
        WorkBlock: { orderBy: { startTime: 'asc' } },
        WorkMeeting: { orderBy: { startTime: 'asc' } },
      },
    })

    return pattern || null
  })

  // GET /api/work-patterns/templates - Get all templates
  fastify.get('/api/work-patterns/templates', async () => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) return []

    const templates = await db.workPattern.findMany({
      where: { sessionId, isTemplate: true },
      include: {
        WorkBlock: { orderBy: { startTime: 'asc' } },
        WorkMeeting: { orderBy: { startTime: 'asc' } },
      },
    })

    return templates
  })

  // POST /api/work-patterns - Create work pattern
  fastify.post('/api/work-patterns', async (request, reply) => {
    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const body = request.body as {
      date: string
      isTemplate?: boolean
      templateName?: string
      blocks?: Array<{
        startTime: string
        endTime: string
        typeConfig?: string
        totalCapacity?: number
      }>
      meetings?: Array<{
        name: string
        startTime: string
        endTime: string
        type: string
        recurring?: string
        daysOfWeek?: string
      }>
    }

    // Check if pattern already exists for this date
    const existing = await db.workPattern.findUnique({
      where: { sessionId_date: { sessionId, date: body.date } },
    })

    if (existing) {
      return reply.status(409).send({ error: 'Work pattern already exists for this date' })
    }

    const pattern = await db.workPattern.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        date: body.date,
        isTemplate: body.isTemplate || false,
        templateName: body.templateName || null,
        updatedAt: new Date(),
        WorkBlock: {
          create: (body.blocks || []).map((block) => ({
            id: crypto.randomUUID(),
            startTime: block.startTime,
            endTime: block.endTime,
            typeConfig: block.typeConfig || '{"kind":"system","systemType":"blocked"}',
            totalCapacity: block.totalCapacity || 0,
          })),
        },
        WorkMeeting: {
          create: (body.meetings || []).map((meeting) => ({
            id: crypto.randomUUID(),
            name: meeting.name,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            type: meeting.type,
            recurring: meeting.recurring || 'none',
            daysOfWeek: meeting.daysOfWeek || null,
          })),
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    return pattern
  })

  // PUT /api/work-patterns/:id - Update work pattern
  fastify.put('/api/work-patterns/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      date?: string
      isTemplate?: boolean
      templateName?: string
      blocks?: Array<{
        id?: string
        startTime: string
        endTime: string
        typeConfig?: string
        totalCapacity?: number
      }>
      meetings?: Array<{
        id?: string
        name: string
        startTime: string
        endTime: string
        type: string
        recurring?: string
        daysOfWeek?: string
      }>
    }

    try {
      // If blocks or meetings are provided, delete existing and recreate
      if (body.blocks) {
        await db.workBlock.deleteMany({ where: { patternId: id } })
      }
      if (body.meetings) {
        await db.workMeeting.deleteMany({ where: { patternId: id } })
      }

      const pattern = await db.workPattern.update({
        where: { id },
        data: {
          date: body.date,
          isTemplate: body.isTemplate,
          templateName: body.templateName,
          updatedAt: new Date(),
          WorkBlock: body.blocks
            ? {
                create: body.blocks.map((block) => ({
                  id: block.id || crypto.randomUUID(),
                  startTime: block.startTime,
                  endTime: block.endTime,
                  typeConfig: block.typeConfig || '{"kind":"system","systemType":"blocked"}',
                  totalCapacity: block.totalCapacity || 0,
                })),
              }
            : undefined,
          WorkMeeting: body.meetings
            ? {
                create: body.meetings.map((meeting) => ({
                  id: meeting.id || crypto.randomUUID(),
                  name: meeting.name,
                  startTime: meeting.startTime,
                  endTime: meeting.endTime,
                  type: meeting.type,
                  recurring: meeting.recurring || 'none',
                  daysOfWeek: meeting.daysOfWeek || null,
                })),
              }
            : undefined,
        },
        include: {
          WorkBlock: true,
          WorkMeeting: true,
        },
      })

      return pattern
    } catch {
      return reply.status(404).send({ error: 'Work pattern not found' })
    }
  })

  // DELETE /api/work-patterns/:id - Delete work pattern
  fastify.delete('/api/work-patterns/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    try {
      await db.workPattern.delete({ where: { id } })
      return { success: true }
    } catch {
      return reply.status(404).send({ error: 'Work pattern not found' })
    }
  })

  // POST /api/work-patterns/:id/save-as-template - Save pattern as template
  fastify.post('/api/work-patterns/:id/save-as-template', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { templateName } = request.body as { templateName: string }

    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const source = await db.workPattern.findUnique({
      where: { id },
      include: { WorkBlock: true, WorkMeeting: true },
    })

    if (!source) {
      return reply.status(404).send({ error: 'Work pattern not found' })
    }

    // Create template copy
    const template = await db.workPattern.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        date: `template-${Date.now()}`, // Templates need unique dates
        isTemplate: true,
        templateName,
        updatedAt: new Date(),
        WorkBlock: {
          create: source.WorkBlock.map((block) => ({
            id: crypto.randomUUID(),
            startTime: block.startTime,
            endTime: block.endTime,
            typeConfig: block.typeConfig,
            totalCapacity: block.totalCapacity,
          })),
        },
        WorkMeeting: {
          create: source.WorkMeeting.map((meeting) => ({
            id: crypto.randomUUID(),
            name: meeting.name,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            type: meeting.type,
            recurring: meeting.recurring,
            daysOfWeek: meeting.daysOfWeek,
          })),
        },
      },
      include: { WorkBlock: true, WorkMeeting: true },
    })

    return template
  })

  // POST /api/work-patterns/apply-template - Apply template to a date
  fastify.post('/api/work-patterns/apply-template', async (request, reply) => {
    const { templateId, date } = request.body as { templateId: string; date: string }

    const sessionId = await getActiveSessionId()
    if (!sessionId) {
      return reply.status(400).send({ error: 'No active session' })
    }

    const template = await db.workPattern.findUnique({
      where: { id: templateId },
      include: { WorkBlock: true, WorkMeeting: true },
    })

    if (!template || !template.isTemplate) {
      return reply.status(404).send({ error: 'Template not found' })
    }

    // Delete existing pattern for this date if exists
    await db.workPattern.deleteMany({
      where: { sessionId, date },
    })

    // Create new pattern from template
    const pattern = await db.workPattern.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        date,
        isTemplate: false,
        updatedAt: new Date(),
        WorkBlock: {
          create: template.WorkBlock.map((block) => ({
            id: crypto.randomUUID(),
            startTime: block.startTime,
            endTime: block.endTime,
            typeConfig: block.typeConfig,
            totalCapacity: block.totalCapacity,
          })),
        },
        WorkMeeting: {
          create: template.WorkMeeting.map((meeting) => ({
            id: crypto.randomUUID(),
            name: meeting.name,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            type: meeting.type,
            recurring: meeting.recurring,
            daysOfWeek: meeting.daysOfWeek,
          })),
        },
      },
      include: { WorkBlock: true, WorkMeeting: true },
    })

    return pattern
  })
}
