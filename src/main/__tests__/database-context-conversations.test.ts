import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseService } from '../database'
import { ChatMessageRole } from '../../shared/enums'
import { ScheduleSnapshotData } from '../../shared/schedule-snapshot-types'

// Mock PrismaClient with the models exercised by this file's method groups
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    session: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    schedulingPreferences: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    jobContext: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    contextEntry: {
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    jargonEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    scheduleSnapshot: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    chatMessage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  }
})

// Mock logger to avoid log output during tests
vi.mock('../../logger/scope-helper', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('Database context, jargon, conversation and snapshot methods', () => {
  let db: DatabaseService
  let mockPrisma: any

  beforeEach(() => {
    vi.clearAllMocks()
    db = DatabaseService.getInstance()
    mockPrisma = (db as any).client
    // Force a fresh session resolution against the mock for every test
    ;(db as any).activeSessionId = null
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 'session-1',
      isActive: true,
      name: 'Test Session',
      createdAt: new Date('2026-06-01T00:00:00Z'),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // ==========================================================================
  // Scheduling preferences
  // ==========================================================================
  describe('updateSchedulingPreferences', () => {
    it('updates existing preferences when a record exists', async () => {
      mockPrisma.schedulingPreferences.findUnique.mockResolvedValue({ id: 'pref-1', sessionId: 'session-1' })
      mockPrisma.schedulingPreferences.update.mockResolvedValue({ id: 'pref-1', allowSplitting: true })

      const result = await db.updateSchedulingPreferences('session-1', { allowSplitting: true })

      expect(result.allowSplitting).toBe(true)
      expect(mockPrisma.schedulingPreferences.update).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
        data: { allowSplitting: true },
      })
      expect(mockPrisma.schedulingPreferences.create).not.toHaveBeenCalled()
    })

    it('creates preferences with a generated id when none exist', async () => {
      mockPrisma.schedulingPreferences.findUnique.mockResolvedValue(null)
      mockPrisma.schedulingPreferences.create.mockResolvedValue({ id: 'pref-123', sessionId: 'session-1' })

      await db.updateSchedulingPreferences('session-1', { allowSplitting: false })

      expect(mockPrisma.schedulingPreferences.update).not.toHaveBeenCalled()
      const createArg = mockPrisma.schedulingPreferences.create.mock.calls[0][0]
      expect(createArg.data.sessionId).toBe('session-1')
      expect(createArg.data.allowSplitting).toBe(false)
      expect(createArg.data.id).toMatch(/^pref-/)
    })
  })

  // ==========================================================================
  // Job contexts
  // ==========================================================================
  describe('Job context operations', () => {
    const dbContextRow = {
      id: 'ctx-1',
      sessionId: 'session-1',
      name: 'Day Job',
      description: 'desc',
      context: 'ctx',
      isActive: true,
      asyncPatterns: JSON.stringify({ ci: 30 }),
      reviewCycles: JSON.stringify({ pr: 2 }),
      tools: JSON.stringify(['git', 'jira']),
      ContextEntry: [{ id: 'ce-1', key: 'team', value: 'platform' }],
    }

    it('getJobContexts parses JSON fields and exposes context entries', async () => {
      mockPrisma.jobContext.findMany.mockResolvedValue([dbContextRow])

      const result = await db.getJobContexts()

      expect(result).toHaveLength(1)
      expect(result[0].asyncPatterns).toEqual({ ci: 30 })
      expect(result[0].reviewCycles).toEqual({ pr: 2 })
      expect(result[0].tools).toEqual(['git', 'jira'])
      expect(result[0].contextEntries).toEqual(dbContextRow.ContextEntry)
      // Session isolation
      expect(mockPrisma.jobContext.findMany.mock.calls[0][0].where).toEqual({ sessionId: 'session-1' })
    })

    it('getActiveJobContext returns null when no active context exists', async () => {
      mockPrisma.jobContext.findFirst.mockResolvedValue(null)

      const result = await db.getActiveJobContext()

      expect(result).toBeNull()
    })

    it('getActiveJobContext parses the active context', async () => {
      mockPrisma.jobContext.findFirst.mockResolvedValue(dbContextRow)

      const result = await db.getActiveJobContext()

      expect(result.tools).toEqual(['git', 'jira'])
      expect(mockPrisma.jobContext.findFirst.mock.calls[0][0].where).toEqual({
        sessionId: 'session-1',
        isActive: true,
      })
    })

    it('createJobContext deactivates other contexts when created as active', async () => {
      mockPrisma.jobContext.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.jobContext.create.mockResolvedValue(dbContextRow)

      await db.createJobContext({
        name: 'Day Job',
        description: 'desc',
        context: 'ctx',
        isActive: true,
      })

      expect(mockPrisma.jobContext.updateMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1', isActive: true },
        data: { isActive: false },
      })
    })

    it('createJobContext defaults JSON fields and skips deactivation when not active', async () => {
      mockPrisma.jobContext.create.mockResolvedValue({
        ...dbContextRow,
        isActive: false,
        asyncPatterns: '{}',
        reviewCycles: '{}',
        tools: '[]',
        ContextEntry: [],
      })

      const result = await db.createJobContext({
        name: 'Side Gig',
        description: 'd',
        context: 'c',
      })

      expect(mockPrisma.jobContext.updateMany).not.toHaveBeenCalled()
      const createArg = mockPrisma.jobContext.create.mock.calls[0][0]
      expect(createArg.data.asyncPatterns).toBe('{}')
      expect(createArg.data.reviewCycles).toBe('{}')
      expect(createArg.data.tools).toBe('[]')
      expect(createArg.data.sessionId).toBe('session-1')
      // Output round-trips back to parsed structures
      expect(result.asyncPatterns).toEqual({})
      expect(result.tools).toEqual([])
      expect(result.contextEntries).toEqual([])
    })

    it('updateJobContext stringifies provided JSON fields and deactivates siblings when set active', async () => {
      mockPrisma.jobContext.updateMany.mockResolvedValue({ count: 0 })
      mockPrisma.jobContext.update.mockResolvedValue(dbContextRow)

      await db.updateJobContext('ctx-1', {
        tools: ['slack'],
        asyncPatterns: { deploy: 10 },
        isActive: true,
      })

      expect(mockPrisma.jobContext.updateMany).toHaveBeenCalledTimes(1)
      const updateArg = mockPrisma.jobContext.update.mock.calls[0][0]
      expect(updateArg.where).toEqual({ id: 'ctx-1' })
      expect(updateArg.data.tools).toBe(JSON.stringify(['slack']))
      expect(updateArg.data.asyncPatterns).toBe(JSON.stringify({ deploy: 10 }))
      expect(updateArg.data.updatedAt).toBeInstanceOf(Date)
    })

    it('updateJobContext leaves JSON fields untouched when not provided', async () => {
      mockPrisma.jobContext.update.mockResolvedValue(dbContextRow)

      await db.updateJobContext('ctx-1', { name: 'Renamed' })

      expect(mockPrisma.jobContext.updateMany).not.toHaveBeenCalled()
      const updateArg = mockPrisma.jobContext.update.mock.calls[0][0]
      expect(updateArg.data.name).toBe('Renamed')
      expect(updateArg.data.tools).toBeUndefined()
      expect(updateArg.data.asyncPatterns).toBeUndefined()
      expect(updateArg.data.reviewCycles).toBeUndefined()
    })

    it('deleteJobContext deletes by id', async () => {
      mockPrisma.jobContext.delete.mockResolvedValue(dbContextRow)

      await db.deleteJobContext('ctx-1')

      expect(mockPrisma.jobContext.delete).toHaveBeenCalledWith({ where: { id: 'ctx-1' } })
    })
  })

  describe('Context entry operations', () => {
    it('upsertContextEntry uses the composite key and defaults notes to null', async () => {
      mockPrisma.contextEntry.upsert.mockResolvedValue({ id: 'ce-1' })

      await db.upsertContextEntry({
        jobContextId: 'ctx-1',
        key: 'team',
        value: 'platform',
        category: 'org',
      })

      const arg = mockPrisma.contextEntry.upsert.mock.calls[0][0]
      expect(arg.where).toEqual({ jobContextId_key: { jobContextId: 'ctx-1', key: 'team' } })
      expect(arg.update).toEqual({ value: 'platform', category: 'org', notes: null })
      expect(arg.create.notes).toBeNull()
      expect(arg.create.jobContextId).toBe('ctx-1')
    })

    it('addContextEntry delegates to upsert with the merged jobContextId', async () => {
      mockPrisma.contextEntry.upsert.mockResolvedValue({ id: 'ce-2' })

      await db.addContextEntry('ctx-9', { key: 'k', value: 'v', category: 'c', notes: 'n' })

      const arg = mockPrisma.contextEntry.upsert.mock.calls[0][0]
      expect(arg.where.jobContextId_key.jobContextId).toBe('ctx-9')
      expect(arg.update.notes).toBe('n')
    })

    it('deleteContextEntry deletes by the composite key', async () => {
      mockPrisma.contextEntry.delete.mockResolvedValue({})

      await db.deleteContextEntry('ctx-1', 'team')

      expect(mockPrisma.contextEntry.delete).toHaveBeenCalledWith({
        where: { jobContextId_key: { jobContextId: 'ctx-1', key: 'team' } },
      })
    })
  })

  // ==========================================================================
  // Jargon entries
  // ==========================================================================
  describe('Jargon entry operations', () => {
    it('createJargonEntry fills defaults for optional fields', async () => {
      mockPrisma.jargonEntry.create.mockResolvedValue({ id: 'j-1', term: 'LGTM' })

      await db.createJargonEntry({ term: 'LGTM', definition: 'Looks good to me' })

      const arg = mockPrisma.jargonEntry.create.mock.calls[0][0]
      expect(arg.data.sessionId).toBe('session-1')
      expect(arg.data.category).toBeNull()
      expect(arg.data.examples).toBe('')
      expect(arg.data.relatedTerms).toBe('')
    })

    it('getJargonEntries scopes to session with no filters', async () => {
      mockPrisma.jargonEntry.findMany.mockResolvedValue([{ id: 'j-1' }])

      const result = await db.getJargonEntries()

      expect(result).toHaveLength(1)
      expect(mockPrisma.jargonEntry.findMany.mock.calls[0][0].where).toEqual({ sessionId: 'session-1' })
    })

    it('getJargonEntries applies category and search filters', async () => {
      mockPrisma.jargonEntry.findMany.mockResolvedValue([])

      await db.getJargonEntries({ category: 'eng', searchTerm: 'api' })

      const where = mockPrisma.jargonEntry.findMany.mock.calls[0][0].where
      expect(where.category).toBe('eng')
      expect(where.OR).toEqual([
        { term: { contains: 'api', mode: 'insensitive' } },
        { definition: { contains: 'api', mode: 'insensitive' } },
      ])
    })

    it('updateJargonEntry stamps updatedAt with the provided updates', async () => {
      mockPrisma.jargonEntry.update.mockResolvedValue({ id: 'j-1' })

      await db.updateJargonEntry('j-1', { definition: 'new def' })

      const arg = mockPrisma.jargonEntry.update.mock.calls[0][0]
      expect(arg.where).toEqual({ id: 'j-1' })
      expect(arg.data.definition).toBe('new def')
      expect(arg.data.updatedAt).toBeInstanceOf(Date)
    })

    it('deleteJargonEntry deletes by id', async () => {
      mockPrisma.jargonEntry.delete.mockResolvedValue({})

      await db.deleteJargonEntry('j-1')

      expect(mockPrisma.jargonEntry.delete).toHaveBeenCalledWith({ where: { id: 'j-1' } })
    })
  })

  // ==========================================================================
  // Schedule snapshots
  // ==========================================================================
  describe('Schedule snapshot operations', () => {
    const snapshotData: ScheduleSnapshotData = {
      capturedAt: '2026-06-10T08:00:00.000Z',
      scheduledItems: [
        { id: 't1', name: 'Task 1', type: 'type-1', duration: 60, priority: 10, startTime: '09:00' },
      ],
      unscheduledItems: [],
      blockUtilization: [],
      metrics: null,
      warnings: ['low capacity'],
      totalScheduled: 1,
      totalUnscheduled: 0,
      scheduleEfficiency: 90,
    }

    it('createScheduleSnapshot serializes data and returns a deserialized snapshot', async () => {
      mockPrisma.scheduleSnapshot.create.mockResolvedValue({
        id: 'snap-1',
        sessionId: 'session-1',
        createdAt: new Date('2026-06-10T08:00:00Z'),
        label: 'Morning Plan',
        snapshotData: JSON.stringify(snapshotData),
      })

      const result = await db.createScheduleSnapshot(snapshotData, 'Morning Plan')

      const createArg = mockPrisma.scheduleSnapshot.create.mock.calls[0][0]
      expect(typeof createArg.data.snapshotData).toBe('string')
      expect(createArg.data.sessionId).toBe('session-1')
      expect(result.label).toBe('Morning Plan')
      expect(result.data.scheduledItems).toHaveLength(1)
      expect(result.data.warnings).toEqual(['low capacity'])
    })

    it('createScheduleSnapshot stores null label when omitted', async () => {
      mockPrisma.scheduleSnapshot.create.mockResolvedValue({
        id: 'snap-2',
        sessionId: 'session-1',
        createdAt: new Date(),
        label: null,
        snapshotData: JSON.stringify(snapshotData),
      })

      const result = await db.createScheduleSnapshot(snapshotData)

      expect(mockPrisma.scheduleSnapshot.create.mock.calls[0][0].data.label).toBeNull()
      expect(result.label).toBeNull()
    })

    it('getScheduleSnapshots skips records with corrupt JSON instead of failing', async () => {
      mockPrisma.scheduleSnapshot.findMany.mockResolvedValue([
        {
          id: 'snap-good',
          sessionId: 'session-1',
          createdAt: new Date(),
          label: null,
          snapshotData: JSON.stringify(snapshotData),
        },
        {
          id: 'snap-corrupt',
          sessionId: 'session-1',
          createdAt: new Date(),
          label: null,
          snapshotData: '{not valid json',
        },
      ])

      const result = await db.getScheduleSnapshots()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('snap-good')
      expect(result[0].data.totalScheduled).toBe(1)
    })

    it('getScheduleSnapshots uses an explicit sessionId when provided', async () => {
      mockPrisma.scheduleSnapshot.findMany.mockResolvedValue([])

      await db.getScheduleSnapshots('other-session')

      expect(mockPrisma.scheduleSnapshot.findMany.mock.calls[0][0].where).toEqual({
        sessionId: 'other-session',
      })
    })

    it('getScheduleSnapshotById returns null when missing and the snapshot when found', async () => {
      mockPrisma.scheduleSnapshot.findUnique.mockResolvedValueOnce(null)
      expect(await db.getScheduleSnapshotById('nope')).toBeNull()

      mockPrisma.scheduleSnapshot.findUnique.mockResolvedValueOnce({
        id: 'snap-1',
        sessionId: 'session-1',
        createdAt: new Date(),
        label: 'L',
        snapshotData: JSON.stringify(snapshotData),
      })
      const found = await db.getScheduleSnapshotById('snap-1')
      expect(found?.data.scheduleEfficiency).toBe(90)
    })

    it('getTodayScheduleSnapshot queries the local-day range around the current time', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 5, 10, 14, 30, 0))

      mockPrisma.scheduleSnapshot.findFirst.mockResolvedValue({
        id: 'snap-today',
        sessionId: 'session-1',
        createdAt: new Date(2026, 5, 10, 9, 0, 0),
        label: null,
        snapshotData: JSON.stringify(snapshotData),
      })

      const result = await db.getTodayScheduleSnapshot()

      const where = mockPrisma.scheduleSnapshot.findFirst.mock.calls[0][0].where
      expect(where.createdAt.gte).toEqual(new Date(2026, 5, 10, 0, 0, 0, 0))
      expect(where.createdAt.lte).toEqual(new Date(2026, 5, 10, 23, 59, 59, 999))
      expect(result?.id).toBe('snap-today')
    })

    it('getTodayScheduleSnapshot returns null when no snapshot exists today', async () => {
      mockPrisma.scheduleSnapshot.findFirst.mockResolvedValue(null)

      expect(await db.getTodayScheduleSnapshot()).toBeNull()
    })

    it('deleteScheduleSnapshot deletes by id', async () => {
      mockPrisma.scheduleSnapshot.delete.mockResolvedValue({})

      await db.deleteScheduleSnapshot('snap-1')

      expect(mockPrisma.scheduleSnapshot.delete).toHaveBeenCalledWith({ where: { id: 'snap-1' } })
    })
  })

  // ==========================================================================
  // Conversations
  // ==========================================================================
  describe('Conversation operations', () => {
    const dbConversation = {
      id: 'conv_1',
      sessionId: 'session-1',
      jobContextId: null,
      title: 'Planning chat',
      createdAt: new Date('2026-06-09T10:00:00Z'),
      updatedAt: new Date('2026-06-09T11:00:00Z'),
      isArchived: false,
      _count: { ChatMessage: 4 },
    }

    it('getConversations maps message counts and excludes archived conversations', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([dbConversation])

      const result = await db.getConversations()

      expect(result).toHaveLength(1)
      expect(result[0].messageCount).toBe(4)
      expect(result[0].title).toBe('Planning chat')
      const where = mockPrisma.conversation.findMany.mock.calls[0][0].where
      expect(where).toEqual({ sessionId: 'session-1', isArchived: false })
    })

    it('getConversationById returns null for missing conversations', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null)

      expect(await db.getConversationById('conv_missing')).toBeNull()
    })

    it('getConversationById maps a found conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(dbConversation)

      const result = await db.getConversationById('conv_1')

      expect(result?.id).toBe('conv_1')
      expect(result?.messageCount).toBe(4)
    })

    it('createConversation generates a default title when none provided', async () => {
      mockPrisma.conversation.create.mockImplementation(async ({ data }: any) => ({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      const result = await db.createConversation({})

      const createArg = mockPrisma.conversation.create.mock.calls[0][0]
      expect(createArg.data.title).toMatch(/^Chat /)
      expect(createArg.data.jobContextId).toBeNull()
      expect(createArg.data.isArchived).toBe(false)
      expect(createArg.data.id).toMatch(/^conv_/)
      expect(result.messageCount).toBe(0)
    })

    it('createConversation honors a provided title and job context', async () => {
      mockPrisma.conversation.create.mockImplementation(async ({ data }: any) => ({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      const result = await db.createConversation({ title: 'Sprint planning', jobContextId: 'ctx-1' })

      expect(result.title).toBe('Sprint planning')
      expect(result.jobContextId).toBe('ctx-1')
    })

    it('updateConversation returns the mapped record with message count', async () => {
      mockPrisma.conversation.update.mockResolvedValue({
        ...dbConversation,
        title: 'Renamed',
        isArchived: true,
      })

      const result = await db.updateConversation('conv_1', { title: 'Renamed', isArchived: true })

      expect(result.title).toBe('Renamed')
      expect(result.isArchived).toBe(true)
      expect(result.messageCount).toBe(4)
    })

    it('deleteConversation deletes by id', async () => {
      mockPrisma.conversation.delete.mockResolvedValue({})

      await db.deleteConversation('conv_1')

      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({ where: { id: 'conv_1' } })
    })
  })

  // ==========================================================================
  // Chat messages
  // ==========================================================================
  describe('Chat message operations', () => {
    const amendments = [
      { id: 'card-1', amendment: {}, status: 'pending', preview: {} },
      { id: 'card-2', amendment: {}, status: 'pending', preview: {} },
    ]

    it('getChatMessages parses amendments JSON and passes through null', async () => {
      mockPrisma.chatMessage.findMany.mockResolvedValue([
        {
          id: 'msg_1',
          conversationId: 'conv_1',
          role: 'assistant',
          content: 'Here is a plan',
          amendments: JSON.stringify(amendments),
          createdAt: new Date(),
        },
        {
          id: 'msg_2',
          conversationId: 'conv_1',
          role: 'user',
          content: 'Thanks',
          amendments: null,
          createdAt: new Date(),
        },
      ])

      const result = await db.getChatMessages('conv_1')

      expect(result).toHaveLength(2)
      expect(result[0].amendments).toHaveLength(2)
      expect(result[0].amendments?.[0].id).toBe('card-1')
      expect(result[1].amendments).toBeNull()
      expect(result[1].role).toBe(ChatMessageRole.User)
    })

    it('createChatMessage stringifies amendments and bumps the conversation timestamp', async () => {
      mockPrisma.chatMessage.create.mockImplementation(async ({ data }: any) => ({
        ...data,
        createdAt: new Date(),
      }))
      mockPrisma.conversation.update.mockResolvedValue({})

      const result = await db.createChatMessage({
        conversationId: 'conv_1',
        role: ChatMessageRole.Assistant,
        content: 'Proposal',
        amendments: amendments as any,
      })

      const createArg = mockPrisma.chatMessage.create.mock.calls[0][0]
      expect(typeof createArg.data.amendments).toBe('string')
      expect(createArg.data.id).toMatch(/^msg_/)
      expect(result.amendments).toHaveLength(2)
      // Conversation updatedAt is bumped so it sorts to the top
      const convUpdate = mockPrisma.conversation.update.mock.calls[0][0]
      expect(convUpdate.where).toEqual({ id: 'conv_1' })
      expect(convUpdate.data.updatedAt).toBeInstanceOf(Date)
    })

    it('createChatMessage stores null amendments when none provided', async () => {
      mockPrisma.chatMessage.create.mockImplementation(async ({ data }: any) => ({
        ...data,
        createdAt: new Date(),
      }))
      mockPrisma.conversation.update.mockResolvedValue({})

      const result = await db.createChatMessage({
        conversationId: 'conv_1',
        role: ChatMessageRole.User,
        content: 'Hello',
      })

      expect(mockPrisma.chatMessage.create.mock.calls[0][0].data.amendments).toBeNull()
      expect(result.amendments).toBeNull()
    })

    it('updateMessageAmendmentStatus throws when the message is missing', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue(null)

      await expect(db.updateMessageAmendmentStatus('msg_x', 'card-1', 'applied')).rejects.toThrow(
        'not found or has no amendments',
      )
    })

    it('updateMessageAmendmentStatus throws when the message has no amendments', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue({ id: 'msg_1', amendments: null })

      await expect(db.updateMessageAmendmentStatus('msg_1', 'card-1', 'applied')).rejects.toThrow(
        'not found or has no amendments',
      )
    })

    it('updateMessageAmendmentStatus throws when the card id is not present', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue({
        id: 'msg_1',
        amendments: JSON.stringify(amendments),
      })

      await expect(db.updateMessageAmendmentStatus('msg_1', 'card-99', 'applied')).rejects.toThrow(
        'Amendment card card-99 not found',
      )
    })

    it('updateMessageAmendmentStatus updates only the targeted card', async () => {
      mockPrisma.chatMessage.findUnique.mockResolvedValue({
        id: 'msg_1',
        amendments: JSON.stringify(amendments),
      })
      mockPrisma.chatMessage.update.mockResolvedValue({})

      await db.updateMessageAmendmentStatus('msg_1', 'card-2', 'applied')

      const updateArg = mockPrisma.chatMessage.update.mock.calls[0][0]
      const stored = JSON.parse(updateArg.data.amendments)
      expect(stored.find((c: any) => c.id === 'card-2').status).toBe('applied')
      expect(stored.find((c: any) => c.id === 'card-1').status).toBe('pending')
    })

    it('deleteChatMessage deletes by id', async () => {
      mockPrisma.chatMessage.delete.mockResolvedValue({})

      await db.deleteChatMessage('msg_1')

      expect(mockPrisma.chatMessage.delete).toHaveBeenCalledWith({ where: { id: 'msg_1' } })
    })
  })
})
