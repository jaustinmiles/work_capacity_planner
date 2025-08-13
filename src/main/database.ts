import { PrismaClient } from '@prisma/client'
import { Task } from '../shared/types'
import { SequencedTask } from '../shared/sequencing-types'

// Create Prisma client instance
const prisma = new PrismaClient()

// Database service for managing tasks and sequenced tasks
export class DatabaseService {
  private static instance: DatabaseService
  private client: PrismaClient

  private constructor() {
    this.client = prisma
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  // Session management
  private activeSessionId: string | null = null

  async getActiveSession(): Promise<string> {
    if (!this.activeSessionId) {
      console.log('DB: Looking for active session...')
      // Find the active session or create one if none exists
      let session = await this.client.session.findFirst({
        where: { isActive: true },
      })

      if (!session) {
        console.log('DB: No active session found, creating default session...')
        // Create a default session if none exists
        session = await this.client.session.create({
          data: {
            id: crypto.randomUUID(),
            name: 'Default Session',
            description: 'Initial work session',
            isActive: true,
          },
        })
        console.log('DB: Created new session with ID:', session.id)
      } else {
        console.log('DB: Found existing active session:', JSON.stringify(session))
      }

      this.activeSessionId = session.id
    }

    console.log('DB: Returning session ID:', this.activeSessionId)
    return this.activeSessionId
  }

  async getSessions(): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }[]> {
    return await this.client.session.findMany({
      orderBy: { updatedAt: 'desc' },
    })
  }

  async createSession(name: string, description?: string): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }> {
    // Deactivate all other sessions
    await this.client.session.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Create and activate new session
    const session = await this.client.session.create({
      data: {
        id: crypto.randomUUID(),
        name,
        description: description ?? null,
        isActive: true,
      },
    })

    this.activeSessionId = session.id
    return session
  }

  async switchSession(sessionId: string): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }> {
    // Deactivate all sessions
    await this.client.session.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Activate the selected session
    const session = await this.client.session.update({
      where: { id: sessionId },
      data: { isActive: true },
    })

    this.activeSessionId = session.id
    return session
  }

  async updateSession(id: string, updates: { name?: string; description?: string }): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }> {
    const updateData: any = {
      updatedAt: new Date(),
    }
    if (updates.name !== undefined) {
      updateData.name = updates.name
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description
    }
    return await this.client.session.update({
      where: { id },
      data: updateData,
    })
  }

  async deleteSession(id: string): Promise<void> {
    const session = await this.client.session.findUnique({
      where: { id },
    })

    if (session?.isActive) {
      throw new Error('Cannot delete the active session')
    }

    await this.client.session.delete({
      where: { id },
    })
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    console.log('DB: Getting active session...')
    const sessionId = await this.getActiveSession()
    console.log('DB: Active session ID:', sessionId)

    console.log('DB: Querying tasks with sessionId:', sessionId)
    const tasks = await this.client.task.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    })

    console.log(`DB: Found ${tasks.length} raw tasks`)
    const formattedTasks = tasks.map(task => this.formatTask(task))
    console.log(`DB: Returning ${formattedTasks.length} formatted tasks`)
    return formattedTasks
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<Task> {
    const sessionId = await this.getActiveSession()
    const { steps, ...coreTaskData } = taskData as any

    // Create the task
    const task = await this.client.task.create({
      data: {
        id: crypto.randomUUID(),
        ...coreTaskData,
        sessionId,
        dependencies: JSON.stringify(taskData.dependencies || []),
        overallStatus: taskData.overallStatus || 'not_started',
        hasSteps: taskData.hasSteps || false,
        criticalPathDuration: taskData.criticalPathDuration || taskData.duration,
        worstCaseDuration: taskData.worstCaseDuration || taskData.duration,
      },
    })

    return this.formatTask(task)
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'sessionId'>>): Promise<Task> {
    const { steps, ...coreUpdates } = updates as any

    // Clean update data - remove undefined values
    const cleanUpdateData = Object.entries(coreUpdates).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        if (key === 'dependencies') {
          acc[key] = JSON.stringify(value)
        } else {
          acc[key] = value
        }
      }
      return acc
    }, {} as any)

    const task = await this.client.task.update({
      where: { id },
      data: cleanUpdateData,
    })

    return this.formatTask(task)
  }

  async deleteTask(id: string): Promise<void> {
    await this.client.task.delete({
      where: { id },
    })
  }

  async completeTask(id: string, actualDuration?: number): Promise<Task> {
    const task = await this.client.task.update({
      where: { id },
      data: {
        completed: true,
        completedAt: new Date(),
        actualDuration: actualDuration ?? null,
        overallStatus: 'completed',
      },
    })

    // Record time estimate accuracy
    if (actualDuration !== undefined) {
      const sessionId = await this.getActiveSession()
      await this.recordTimeEstimateAccuracy(sessionId, {
        taskType: task.type,
        estimatedMinutes: task.duration,
        actualMinutes: actualDuration,
      })
    }

    return this.formatTask(task)
  }

  async updateTaskStep(taskId: string, stepId: string, updates: { status: string; actualDuration?: number }): Promise<void> {
    await this.client.taskStep.update({
      where: { id: stepId },
      data: updates,
    })

    // Update task's current step if completed
    if (updates.status === 'completed') {
      const steps = await this.client.taskStep.findMany({
        where: { taskId },
        orderBy: { stepIndex: 'asc' },
      })

      const nextStep = steps.find((s: any) => s.status === 'pending')
      if (nextStep) {
        await this.client.task.update({
          where: { id: taskId },
          data: { currentStepId: nextStep.id },
        })
      } else {
        // All steps completed
        await this.client.task.update({
          where: { id: taskId },
          data: {
            currentStepId: null,
            overallStatus: 'completed',
            completed: true,
            completedAt: new Date(),
          },
        })
      }
    }
  }

  // Helper to format task from DB
  private formatTask(task: any): Task {
    return {
      ...task,
      dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
      completedAt: task.completedAt ?? null,
      actualDuration: task.actualDuration ?? null,
      deadline: task.deadline ?? null,
      currentStepId: task.currentStepId ?? null,
      steps: undefined, // Steps are only for SequencedTask
    }
  }

  async getTaskById(id: string): Promise<Task | null> {
    const task = await this.client.task.findUnique({
      where: { id },
    })

    return task ? this.formatTask(task) : null
  }

  // Job Context methods
  async getJobContexts(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const contexts = await this.client.jobContext.findMany({
      where: { sessionId },
      include: {
        ContextEntry: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return contexts.map(context => ({
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
      contextEntries: context.ContextEntry,
    }))
  }

  async getActiveJobContext(): Promise<any | null> {
    const sessionId = await this.getActiveSession()
    const context = await this.client.jobContext.findFirst({
      where: {
        sessionId,
        isActive: true,
      },
      include: {
        ContextEntry: true,
      },
    })

    if (!context) return null

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
      contextEntries: context.ContextEntry,
    }
  }

  async createJobContext(data: {
    name: string
    description: string
    context: string
    asyncPatterns?: any
    reviewCycles?: any
    tools?: string[]
    isActive?: boolean
  }): Promise<any> {
    // Deactivate other contexts if this one is being set as active
    if (data.isActive) {
      const sessionId = await this.getActiveSession()
      await this.client.jobContext.updateMany({
        where: { sessionId, isActive: true },
        data: { isActive: false },
      })
    }

    const sessionId = await this.getActiveSession()
    const context = await this.client.jobContext.create({
      data: {
        id: crypto.randomUUID(),
        ...data,
        sessionId,
        asyncPatterns: JSON.stringify(data.asyncPatterns || {}),
        reviewCycles: JSON.stringify(data.reviewCycles || {}),
        tools: JSON.stringify(data.tools || []),
      },
      include: {
        ContextEntry: true,
      },
    })

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
      contextEntries: context.ContextEntry,
    }
  }

  async updateJobContext(id: string, data: {
    name?: string
    description?: string
    context?: string
    asyncPatterns?: any
    reviewCycles?: any
    tools?: string[]
    isActive?: boolean
  }): Promise<any> {
    // Deactivate other contexts if this one is being set as active
    if (data.isActive) {
      const sessionId = await this.getActiveSession()
      await this.client.jobContext.updateMany({
        where: { sessionId, isActive: true },
        data: { isActive: false },
      })
    }

    const updateData: any = {
      ...data,
      updatedAt: new Date(),
    }

    if (data.asyncPatterns !== undefined) {
      updateData.asyncPatterns = JSON.stringify(data.asyncPatterns)
    }
    if (data.reviewCycles !== undefined) {
      updateData.reviewCycles = JSON.stringify(data.reviewCycles)
    }
    if (data.tools !== undefined) {
      updateData.tools = JSON.stringify(data.tools)
    }

    const context = await this.client.jobContext.update({
      where: { id },
      data: updateData,
      include: {
        ContextEntry: true,
      },
    })

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
      contextEntries: context.ContextEntry,
    }
  }

  async deleteJobContext(id: string): Promise<void> {
    await this.client.jobContext.delete({
      where: { id },
    })
  }

  async upsertContextEntry(entry: {
    jobContextId: string
    key: string
    value: string
    category: string
    notes?: string
  }): Promise<any> {
    return await this.client.contextEntry.upsert({
      where: {
        jobContextId_key: {
          jobContextId: entry.jobContextId,
          key: entry.key,
        },
      },
      update: {
        value: entry.value,
        category: entry.category,
        notes: entry.notes ?? null,
      },
      create: {
        id: crypto.randomUUID(),
        key: entry.key,
        value: entry.value,
        category: entry.category,
        notes: entry.notes ?? null,
        jobContextId: entry.jobContextId,
      },
    })
  }

  async deleteContextEntry(jobContextId: string, key: string): Promise<void> {
    await this.client.contextEntry.delete({
      where: {
        jobContextId_key: {
          jobContextId,
          key,
        },
      },
    })
  }

  // Jargon methods
  async createJargonEntry(jargon: {
    term: string
    definition: string
    category?: string
    examples?: string
    relatedTerms?: string
  }): Promise<any> {
    const sessionId = await this.getActiveSession()
    return await this.client.jargonEntry.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        term: jargon.term,
        definition: jargon.definition,
        category: jargon.category ?? null,
        examples: jargon.examples || '',
        relatedTerms: jargon.relatedTerms || '',
      },
    })
  }

  async getJargonEntries(filters?: { category?: string; searchTerm?: string }): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const where: any = { sessionId }

    if (filters?.category) {
      where.category = filters.category
    }

    if (filters?.searchTerm) {
      where.OR = [
        { term: { contains: filters.searchTerm, mode: 'insensitive' } },
        { definition: { contains: filters.searchTerm, mode: 'insensitive' } },
      ]
    }

    return await this.client.jargonEntry.findMany({
      where,
      orderBy: { term: 'asc' },
    })
  }

  async updateJargonEntry(id: string, updates: Partial<{
    term: string
    definition: string
    category?: string
    examples?: string
    relatedTerms?: string
  }>): Promise<any> {
    return await this.client.jargonEntry.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    })
  }

  async deleteJargonEntry(id: string): Promise<void> {
    await this.client.jargonEntry.delete({
      where: { id },
    })
  }

  // Sequenced Tasks
  async getSequencedTasks(): Promise<SequencedTask[]> {
    const sessionId = await this.getActiveSession()
    const tasks = await this.client.sequencedTask.findMany({
      where: { sessionId },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return tasks.map(task => this.formatSequencedTask(task))
  }

  async getSequencedTaskById(id: string): Promise<SequencedTask | null> {
    const task = await this.client.sequencedTask.findUnique({
      where: { id },
      include: {
        TaskStep: true,
      },
    })

    return task ? this.formatSequencedTask(task) : null
  }

  async createSequencedTask(taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<SequencedTask> {
    const sessionId = await this.getActiveSession()
    const { steps } = taskData

    const task = await this.client.sequencedTask.create({
      data: {
        id: crypto.randomUUID(),
        name: taskData.name,
        importance: taskData.importance,
        urgency: taskData.urgency,
        type: taskData.type,
        notes: taskData.notes ?? null,
        dependencies: JSON.stringify(taskData.dependencies || []),
        completed: taskData.completed || false,
        totalDuration: taskData.duration,
        criticalPathDuration: taskData.criticalPathDuration,
        worstCaseDuration: taskData.worstCaseDuration,
        overallStatus: taskData.overallStatus || 'not_started',
        sessionId,
        updatedAt: new Date(),
      },
      include: {
        TaskStep: true,
      },
    })

    // Create steps
    if (steps && steps.length > 0) {
      await this.client.taskStep.createMany({
        data: steps.map((step, index) => {
          const { id: stepId, ...stepData } = step
          return {
            id: crypto.randomUUID(),
            ...stepData,
            sequencedTaskId: task.id,
            stepIndex: index,
            dependsOn: JSON.stringify(step.dependsOn || []),
          }
        }),
      })

      // Fetch with steps
      const taskWithSteps = await this.client.sequencedTask.findUnique({
        where: { id: task.id },
        include: {
          TaskStep: true,
        },
      })

      return this.formatSequencedTask(taskWithSteps!)
    }

    return this.formatSequencedTask(task)
  }

  async updateSequencedTask(id: string, updates: Partial<Omit<SequencedTask, 'id' | 'createdAt' | 'sessionId'>>): Promise<SequencedTask> {
    const { steps, ...coreUpdates } = updates

    const updateData: any = {
      ...coreUpdates,
      updatedAt: new Date(),
    }

    if (updates.dependencies !== undefined) {
      updateData.dependencies = JSON.stringify(updates.dependencies)
    }

    if (updates.duration !== undefined) {
      updateData.totalDuration = updates.duration
    }

    const task = await this.client.sequencedTask.update({
      where: { id },
      data: updateData,
      include: {
        TaskStep: true,
      },
    })

    return this.formatSequencedTask(task)
  }

  async deleteSequencedTask(id: string): Promise<void> {
    await this.client.sequencedTask.delete({
      where: { id },
    })
  }

  private formatSequencedTask(task: any): SequencedTask {
    return {
      ...task,
      duration: task.totalDuration,
      dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
      steps: task.TaskStep?.map((step: any) => ({
        ...step,
        type: step.type as 'focused' | 'admin',
        dependsOn: step.dependsOn ? JSON.parse(step.dependsOn) : [],
      })) || [],
    }
  }

  // Work patterns
  async getWorkPatterns(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const patterns = await this.client.workPattern.findMany({
      where: {
        sessionId,
        isTemplate: false,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
      orderBy: { date: 'desc' },
    })

    return patterns.map(pattern => ({
      ...pattern,
      blocks: pattern.WorkBlock.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: pattern.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }))
  }

  async getWorkPattern(date: string): Promise<any | null> {
    const sessionId = await this.getActiveSession()
    const pattern = await this.client.workPattern.findUnique({
      where: {
        sessionId_date: {
          sessionId,
          date,
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
        WorkSession: true,
      },
    })

    if (!pattern) return null

    return {
      ...pattern,
      blocks: pattern.WorkBlock.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: pattern.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async createWorkPattern(data: {
    date: string
    blocks?: any[]
    meetings?: any[]
    isTemplate?: boolean
    templateName?: string
  }): Promise<any> {
    const sessionId = await this.getActiveSession()
    const { blocks, meetings, ...patternData } = data

    const pattern = await this.client.workPattern.create({
      data: {
        id: crypto.randomUUID(),
        ...patternData,
        sessionId,
        WorkBlock: {
          create: (blocks || []).map((b: any) => {
            const { patternId, id, ...blockData } = b
            return {
              id: crypto.randomUUID(),
              ...blockData,
              capacity: b.capacity ? JSON.stringify(b.capacity) : null,
            }
          }),
        },
        WorkMeeting: {
          create: (meetings || []).map((m: any) => {
            const { patternId, id, ...meetingData } = m
            return {
              id: crypto.randomUUID(),
              ...meetingData,
              daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
            }
          }),
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
        WorkSession: true,
      },
    })

    return {
      ...pattern,
      blocks: pattern.WorkBlock.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: pattern.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async createWorkPatternFromTemplate(date: string, templateName: string): Promise<any> {
    const sessionId = await this.getActiveSession()
    const existingPattern = await this.client.workPattern.findFirst({
      where: {
        sessionId,
        isTemplate: true,
        templateName,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    if (!existingPattern) {
      throw new Error(`Template "${templateName}" not found`)
    }

    const template = await this.client.workPattern.create({
      data: {
        id: crypto.randomUUID(),
        date,
        isTemplate: false,
        templateName,
        sessionId,
        WorkBlock: {
          create: existingPattern.WorkBlock.map((b: any) => ({
            id: crypto.randomUUID(),
            startTime: b.startTime,
            endTime: b.endTime,
            type: b.type,
            focusCapacity: b.focusCapacity,
            adminCapacity: b.adminCapacity,
            capacity: b.capacity,
          })),
        },
        WorkMeeting: {
          create: existingPattern.WorkMeeting.map((m: any) => ({
            id: crypto.randomUUID(),
            name: m.name,
            startTime: m.startTime,
            endTime: m.endTime,
            type: m.type,
            recurring: m.recurring,
            daysOfWeek: m.daysOfWeek,
          })),
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    return {
      ...template,
      blocks: template.WorkBlock.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: template.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async updateWorkPattern(id: string, updates: {
    blocks?: any[]
    meetings?: any[]
  }): Promise<any> {
    // Delete existing blocks and meetings
    await this.client.workBlock.deleteMany({
      where: { patternId: id },
    })
    await this.client.workMeeting.deleteMany({
      where: { patternId: id },
    })

    // Update with new data
    const pattern = await this.client.workPattern.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        WorkBlock: {
          create: (updates.blocks || []).map((b: any) => {
            const { patternId, id, ...blockData } = b
            return {
              id: crypto.randomUUID(),
              ...blockData,
              capacity: b.capacity ? JSON.stringify(b.capacity) : null,
            }
          }),
        },
        WorkMeeting: {
          create: (updates.meetings || []).map((m: any) => {
            const { patternId, id, ...meetingData } = m
            return {
              id: crypto.randomUUID(),
              ...meetingData,
              daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
            }
          }),
        },
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
    })

    return {
      ...pattern,
      blocks: pattern.WorkBlock.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: pattern.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async deleteWorkPattern(id: string): Promise<void> {
    await this.client.workPattern.delete({
      where: { id },
    })
  }

  async getWorkPatternTemplates(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const templates = await this.client.workPattern.findMany({
      where: {
        sessionId,
        isTemplate: true,
      },
      include: {
        WorkBlock: true,
        WorkMeeting: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return templates.map(t => ({
      ...t,
      blocks: t.WorkBlock.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: t.WorkMeeting.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }))
  }

  // Work sessions
  async createWorkSession(data: {
    taskId: string
    stepId?: string
    type: 'focused' | 'admin'
    startTime: Date
    endTime?: Date
    plannedMinutes: number
    actualMinutes?: number
    notes?: string
  }): Promise<any> {
    console.log('DB: Creating work session:', JSON.stringify(data))
    const session = await this.client.workSession.create({
      data: {
        id: crypto.randomUUID(),
        taskId: data.taskId,
        stepId: data.stepId ?? null,
        type: data.type,
        startTime: data.startTime,
        endTime: data.endTime ?? null,
        plannedMinutes: data.plannedMinutes,
        actualMinutes: data.actualMinutes ?? null,
        notes: data.notes ?? null,
      },
    })
    console.log('DB: Created work session:', session.id)
    return session
  }

  async getWorkSessionsForPattern(patternId: string): Promise<any[]> {
    const pattern = await this.client.workPattern.findUnique({
      where: { id: patternId },
      include: { WorkSession: true },
    })

    return pattern?.WorkSession || []
  }

  async endWorkSession(id: string, actualMinutes: number): Promise<any> {
    return await this.client.workSession.update({
      where: { id },
      data: {
        endTime: new Date(),
        actualMinutes,
      },
    })
  }

  async getTodayAccumulated(date: string): Promise<{ focused: number; admin: number; total: number }> {
    console.log(`DB: Getting accumulated time for ${date}`)
    const sessionId = await this.getActiveSession()
    console.log('DB: Active session ID:', sessionId)

    const workSessions = await this.client.workSession.findMany({
      where: {
        Task: {
          sessionId,
        },
        startTime: {
          gte: new Date(`${date}T00:00:00.000Z`),
          lt: new Date(`${date}T23:59:59.999Z`),
        },
      },
      include: {
        Task: true,
      },
    })
    console.log(`Found ${workSessions.length} work sessions for ${date}`)

    const accumulated = workSessions.reduce((acc, session) => {
      const minutes = session.actualMinutes || session.plannedMinutes || 0
      if (session.type === 'focused') {
        acc.focused += minutes
      } else if (session.type === 'admin') {
        acc.admin += minutes
      }
      acc.total += minutes
      return acc
    }, { focused: 0, admin: 0, total: 0 })

    console.log(`DB: Accumulated time for ${date}:`, accumulated)
    return accumulated
  }

  async getTaskTotalLoggedTime(taskId: string): Promise<number> {
    console.log(`DB: Getting total logged time for task ${taskId}`)
    const workSessions = await this.client.workSession.findMany({
      where: { taskId },
    })

    const total = workSessions.reduce((total, session) => {
      return total + (session.actualMinutes || session.plannedMinutes || 0)
    }, 0)

    console.log(`DB: Total logged time for task ${taskId}: ${total} minutes`)
    return total
  }

  // Time estimate accuracy
  async recordTimeEstimateAccuracy(sessionId: string, data: {
    taskType: string
    estimatedMinutes: number
    actualMinutes: number
    workflowCategory?: string
  }): Promise<void> {
    const variance = ((data.actualMinutes - data.estimatedMinutes) / data.estimatedMinutes) * 100

    await this.client.timeEstimateAccuracy.create({
      data: {
        id: crypto.randomUUID(),
        sessionId,
        taskType: data.taskType,
        estimatedMinutes: data.estimatedMinutes,
        actualMinutes: data.actualMinutes ?? null,
        variance,
        workflowCategory: data.workflowCategory ?? null,
      },
    })
  }

  async getTimeEstimateStats(taskType?: string): Promise<{
    avgVariance: number
    totalEstimates: number
    overestimateCount: number
    underestimateCount: number
  }> {
    const sessionId = await this.getActiveSession()
    const where: any = { sessionId }

    if (taskType) {
      where.taskType = taskType
    }

    const estimates = await this.client.timeEstimateAccuracy.findMany({
      where,
    })

    if (estimates.length === 0) {
      return {
        avgVariance: 0,
        totalEstimates: 0,
        overestimateCount: 0,
        underestimateCount: 0,
      }
    }

    const totalVariance = estimates.reduce((sum, e) => sum + e.variance, 0)
    const overestimateCount = estimates.filter(e => e.variance < 0).length
    const underestimateCount = estimates.filter(e => e.variance > 0).length

    return {
      avgVariance: totalVariance / estimates.length,
      totalEstimates: estimates.length,
      overestimateCount,
      underestimateCount,
    }
  }

  // Cleanup
  async disconnect(): Promise<void> {
    await this.client.$disconnect()
  }

  // Missing methods for compatibility
  async initializeDefaultData(): Promise<void> {
    // No-op - data is created on demand
  }

  async addContextEntry(jobContextId: string, entry: any): Promise<any> {
    return this.upsertContextEntry({ ...entry, jobContextId })
  }

  async getJargonDictionary(): Promise<any[]> {
    return this.getJargonEntries()
  }

  async deleteAllTasks(): Promise<void> {
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({ where: { sessionId } })
  }

  async deleteAllSequencedTasks(): Promise<void> {
    const sessionId = await this.getActiveSession()
    await this.client.sequencedTask.deleteMany({ where: { sessionId } })
  }

  async deleteAllUserData(): Promise<void> {
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({ where: { sessionId } })
    await this.client.sequencedTask.deleteMany({ where: { sessionId } })
    await this.client.workPattern.deleteMany({ where: { sessionId } })
    await this.client.jobContext.deleteMany({ where: { sessionId } })
    await this.client.jargonEntry.deleteMany({ where: { sessionId } })
  }

  async getWorkTemplates(): Promise<any[]> {
    return this.getWorkPatternTemplates()
  }

  async saveAsTemplate(date: string, templateName: string): Promise<any> {
    const pattern = await this.getWorkPattern(date)
    if (!pattern) throw new Error('No pattern found for date')

    return this.createWorkPattern({
      date: `template-${Date.now()}`,
      isTemplate: true,
      templateName,
      blocks: pattern.blocks,
      meetings: pattern.meetings,
    })
  }

  async updateWorkSession(id: string, data: any): Promise<any> {
    return this.endWorkSession(id, data.actualMinutes)
  }

  async getWorkSessions(date: string): Promise<any[]> {
    const pattern = await this.getWorkPattern(date)
    return pattern ? this.getWorkSessionsForPattern(pattern.id) : []
  }

  async createStepWorkSession(data: any): Promise<any> {
    return this.createWorkSession(data)
  }

  async updateTaskStepProgress(stepId: string, data: any): Promise<void> {
    // Find task ID from step
    const step = await this.client.taskStep.findUnique({ where: { id: stepId } })
    if (step?.taskId) {
      await this.updateTaskStep(step.taskId, stepId, data)
    }
  }

  async getStepWorkSessions(stepId: string): Promise<any[]> {
    return this.client.workSession.findMany({ where: { stepId } })
  }

  async recordTimeEstimate(data: any): Promise<void> {
    const sessionId = await this.getActiveSession()
    return this.recordTimeEstimateAccuracy(sessionId, data)
  }

  async getTimeAccuracyStats(filters?: any): Promise<any> {
    return this.getTimeEstimateStats(filters?.taskType)
  }
}

// Export a singleton instance
export const getDatabase = () => DatabaseService.getInstance()
