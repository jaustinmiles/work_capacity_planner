import { PrismaClient } from '@prisma/client'
import { Task } from '../shared/types'
import { SequencedTask, TaskStep } from '../shared/sequencing-types'

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
      // Find the active session or create one if none exists
      let session = await this.client.session.findFirst({
        where: { isActive: true },
      })

      if (!session) {
        // Create a default session if none exists
        session = await this.client.session.create({
          data: {
            name: 'Default Session',
            description: 'Initial work session',
            isActive: true,
          },
        })
      }

      this.activeSessionId = session.id
    }

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
    return await this.client.session.update({
      where: { id },
      data: updates,
    })
  }

  async deleteSession(id: string): Promise<void> {
    // Don't delete the active session
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

  // Task operations - Unified model
  async getTasks(): Promise<Task[]> {
    const sessionId = await this.getActiveSession()
    const tasks = await this.client.task.findMany({
      where: { sessionId },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return tasks.map(task => this.formatTask(task))
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<Task> {
    const sessionId = await this.getActiveSession()
    const { steps, ...coreTaskData } = taskData as any

    // Create the task
    const task = await this.client.task.create({
      data: {
        ...coreTaskData,
        sessionId,
        dependencies: JSON.stringify(taskData.dependencies || []),
        overallStatus: taskData.overallStatus || 'not_started',
        hasSteps: taskData.hasSteps || false,
        criticalPathDuration: taskData.criticalPathDuration || taskData.duration,
        worstCaseDuration: taskData.worstCaseDuration || taskData.duration,
      },
      include: {
        steps: true,
      },
    })

    // If it has steps, create them
    if (steps && steps.length > 0) {
      await this.client.taskStep.createMany({
        data: steps.map((step: any, index: number) => ({
          ...step,
          taskId: task.id,
          stepIndex: index,
          dependsOn: JSON.stringify(step.dependsOn || []),
          status: step.status || 'pending',
          percentComplete: step.percentComplete || 0,
        })),
      })

      // Fetch the task again with steps
      return this.getTaskById(task.id) as Promise<Task>
    }

    return this.formatTask(task)
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const { steps, ...updateData } = updates as any
    const cleanUpdateData: any = { ...updateData }

    // Handle JSON fields
    if (cleanUpdateData.dependencies) {
      cleanUpdateData.dependencies = JSON.stringify(cleanUpdateData.dependencies)
    }

    // Remove computed fields
    delete cleanUpdateData.id
    delete cleanUpdateData.createdAt
    delete cleanUpdateData.updatedAt
    delete cleanUpdateData.sessionId

    const task = await this.client.task.update({
      where: { id },
      data: cleanUpdateData,
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    // Handle steps update if provided
    if (steps) {
      // This would need more complex logic to handle step updates
      // For now, we'll skip this as it's rarely needed
    }

    return this.formatTask(task)
  }

  async deleteTask(id: string): Promise<void> {
    await this.client.task.delete({
      where: { id },
    })
  }

  // Helper to format task from DB
  private formatTask(task: any): Task {
    return {
      ...task,
      type: task.type as 'focused' | 'admin',
      overallStatus: task.overallStatus as 'not_started' | 'in_progress' | 'waiting' | 'completed',
      dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
      completedAt: task.completedAt || undefined,
      actualDuration: task.actualDuration || undefined,
      notes: task.notes || undefined,
      projectId: task.projectId || undefined,
      deadline: task.deadline || undefined,
      currentStepId: task.currentStepId || undefined,
      steps: task.steps?.map((step: any) => ({
        ...step,
        type: step.type as 'focused' | 'admin',
        status: step.status as 'pending' | 'in_progress' | 'waiting' | 'completed' | 'skipped',
        dependsOn: step.dependsOn ? JSON.parse(step.dependsOn) : [],
        actualDuration: step.actualDuration || undefined,
        startedAt: step.startedAt || undefined,
        completedAt: step.completedAt || undefined,
      })),
    }
  }

  // Sequenced task operations (legacy - now uses unified model)
  async getSequencedTasks(): Promise<SequencedTask[]> {
    const tasks = await this.getTasks()
    return tasks.filter(task => task.hasSteps) as SequencedTask[]
  }

  async createSequencedTask(taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<SequencedTask> {
    // Map totalDuration to duration for unified model
    const unifiedTaskData = {
      ...taskData,
      duration: (taskData as any).totalDuration || taskData.duration,
      hasSteps: true,
    }
    return this.createTask(unifiedTaskData) as Promise<SequencedTask>
  }

  async updateSequencedTask(id: string, updates: Partial<SequencedTask>): Promise<SequencedTask> {
    return this.updateTask(id, updates) as Promise<SequencedTask>
  }

  async deleteSequencedTask(id: string): Promise<void> {
    return this.deleteTask(id)
  }

  // Update individual task step
  async updateTaskStep(stepId: string, updates: Partial<TaskStep>): Promise<void> {
    const updateData: any = { ...updates }
    if (updateData.dependsOn) {
      updateData.dependsOn = JSON.stringify(updateData.dependsOn)
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id
    delete updateData.taskId

    await this.client.taskStep.update({
      where: { id: stepId },
      data: updateData,
    })
  }

  // Utility methods
  async getTaskById(id: string): Promise<Task | null> {
    const task = await this.client.task.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    if (!task) return null
    return this.formatTask(task)
  }

  async getSequencedTaskById(id: string): Promise<SequencedTask | null> {
    const task = await this.getTaskById(id)
    if (!task || !task.hasSteps) return null
    return task as SequencedTask
  }

  // Initialize database connection (no longer creates default tasks)
  async initializeDefaultData(): Promise<void> {
    // Database initialization is handled automatically by Prisma
    // With AI brainstorming feature, sample tasks are no longer needed
    // This method is kept for compatibility but doesn't create default data
  }

  // Job Context operations
  async getJobContexts(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const contexts = await this.client.jobContext.findMany({
      where: { sessionId },
      include: {
        contextEntries: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return contexts.map(context => ({
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
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
        contextEntries: true,
      },
    })

    if (!context) return null

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
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
      await this.client.jobContext.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
    }

    const sessionId = await this.getActiveSession()
    const context = await this.client.jobContext.create({
      data: {
        ...data,
        sessionId,
        asyncPatterns: JSON.stringify(data.asyncPatterns || {}),
        reviewCycles: JSON.stringify(data.reviewCycles || {}),
        tools: JSON.stringify(data.tools || []),
      },
      include: {
        contextEntries: true,
      },
    })

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
    }
  }

  async updateJobContext(id: string, updates: Partial<any>): Promise<any> {
    const updateData: any = { ...updates }

    // Handle JSON fields
    if (updateData.asyncPatterns) {
      updateData.asyncPatterns = JSON.stringify(updateData.asyncPatterns)
    }
    if (updateData.reviewCycles) {
      updateData.reviewCycles = JSON.stringify(updateData.reviewCycles)
    }
    if (updateData.tools) {
      updateData.tools = JSON.stringify(updateData.tools)
    }

    // Deactivate other contexts if this one is being set as active
    if (updateData.isActive) {
      await this.client.jobContext.updateMany({
        where: { isActive: true, NOT: { id } },
        data: { isActive: false },
      })
    }

    const context = await this.client.jobContext.update({
      where: { id },
      data: updateData,
      include: {
        contextEntries: true,
      },
    })

    return {
      ...context,
      asyncPatterns: JSON.parse(context.asyncPatterns),
      reviewCycles: JSON.parse(context.reviewCycles),
      tools: JSON.parse(context.tools),
    }
  }

  async deleteJobContext(id: string): Promise<void> {
    await this.client.jobContext.delete({
      where: { id },
    })
  }

  async addContextEntry(jobContextId: string, entry: {
    key: string
    value: string
    category: string
    notes?: string
  }): Promise<any> {
    return await this.client.contextEntry.upsert({
      where: {
        jobContextId_key: {
          jobContextId,
          key: entry.key,
        },
      },
      update: {
        value: entry.value,
        category: entry.category,
        notes: entry.notes ?? null,
      },
      create: {
        jobContextId,
        ...entry,
      },
    })
  }

  // Jargon Dictionary operations
  async getJargonEntries(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const entries = await this.client.jargonEntry.findMany({
      where: { sessionId },
      orderBy: { term: 'asc' },
    })

    return entries.map(entry => ({
      ...entry,
      examples: entry.examples ? JSON.parse(entry.examples) : [],
      relatedTerms: entry.relatedTerms ? JSON.parse(entry.relatedTerms) : [],
    }))
  }

  async createJargonEntry(data: {
    term: string
    definition: string
    category?: string
    examples?: string[]
    relatedTerms?: string[]
  }): Promise<any> {
    const sessionId = await this.getActiveSession()
    const entry = await this.client.jargonEntry.create({
      data: {
        ...data,
        sessionId,
        examples: data.examples ? JSON.stringify(data.examples) : null,
        relatedTerms: data.relatedTerms ? JSON.stringify(data.relatedTerms) : null,
      },
    })

    return {
      ...entry,
      examples: entry.examples ? JSON.parse(entry.examples) : [],
      relatedTerms: entry.relatedTerms ? JSON.parse(entry.relatedTerms) : [],
    }
  }

  async updateJargonEntry(id: string, updates: Partial<any>): Promise<any> {
    const updateData: any = { ...updates }

    if (updateData.examples) {
      updateData.examples = JSON.stringify(updateData.examples)
    }
    if (updateData.relatedTerms) {
      updateData.relatedTerms = JSON.stringify(updateData.relatedTerms)
    }

    const entry = await this.client.jargonEntry.update({
      where: { id },
      data: updateData,
    })

    return {
      ...entry,
      examples: entry.examples ? JSON.parse(entry.examples) : [],
      relatedTerms: entry.relatedTerms ? JSON.parse(entry.relatedTerms) : [],
    }
  }

  async deleteJargonEntry(id: string): Promise<void> {
    await this.client.jargonEntry.delete({
      where: { id },
    })
  }

  async getJargonDictionary(): Promise<Record<string, string>> {
    const sessionId = await this.getActiveSession()
    const entries = await this.client.jargonEntry.findMany({
      where: { sessionId },
    })
    const dictionary: Record<string, string> = {}

    entries.forEach(entry => {
      dictionary[entry.term.toLowerCase()] = entry.definition
    })

    return dictionary
  }

  // Delete all tasks (for development)
  async deleteAllTasks(): Promise<void> {
    await this.client.task.deleteMany({})
  }

  async deleteAllSequencedTasks(): Promise<void> {
    // Delete only tasks with steps
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({
      where: {
        sessionId,
        hasSteps: true,
      },
    })
  }

  // Delete all user data (for clean slate)
  async deleteAllUserData(): Promise<void> {
    // Delete in order to respect foreign key constraints
    await this.client.workSession.deleteMany({})
    await this.client.workMeeting.deleteMany({})
    await this.client.workBlock.deleteMany({})
    await this.client.workPattern.deleteMany({})
    await this.client.contextEntry.deleteMany({})
    await this.client.jargonEntry.deleteMany({})
    await this.client.jobContext.deleteMany({})
    await this.client.taskStep.deleteMany({})
    await this.client.task.deleteMany({})
    // Keep sessions but clear their data
    await this.client.session.updateMany({
      data: { updatedAt: new Date() },
    })
  }

  // Work Pattern operations
  async getWorkPattern(date: string): Promise<any> {
    const sessionId = await this.getActiveSession()
    const pattern = await this.client.workPattern.findUnique({
      where: {
        sessionId_date: {
          sessionId,
          date,
        },
      },
      include: {
        blocks: true,
        meetings: true,
        sessions: true,
      },
    })

    if (!pattern) return null

    return {
      ...pattern,
      blocks: pattern.blocks.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: pattern.meetings.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async createWorkPattern(data: any): Promise<any> {
    const sessionId = await this.getActiveSession()
    const { blocks, meetings, ...patternData } = data

    const pattern = await this.client.workPattern.create({
      data: {
        ...patternData,
        sessionId,
        blocks: {
          create: (blocks || []).map((b: any) => ({
            ...b,
            capacity: b.capacity ? JSON.stringify(b.capacity) : null,
          })),
        },
        meetings: {
          create: (meetings || []).map((m: any) => ({
            ...m,
            daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
          })),
        },
      },
      include: {
        blocks: true,
        meetings: true,
        sessions: true,
      },
    })

    return {
      ...pattern,
      blocks: pattern.blocks.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: pattern.meetings.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async saveAsTemplate(date: string, templateName: string): Promise<any> {
    const sessionId = await this.getActiveSession()

    // Try to get the pattern for the date
    let existingPattern = await this.getWorkPattern(date)

    // If no pattern exists, check if we just created one
    if (!existingPattern) {
      // Wait a bit and try again (in case of race condition)
      await new Promise(resolve => global.setTimeout(resolve, 100))
      existingPattern = await this.getWorkPattern(date)

      if (!existingPattern) {
        throw new Error('No work schedule found for this date. Please save the schedule first.')
      }
    }

    // Check if a template with this name already exists
    const existingTemplate = await this.client.workPattern.findFirst({
      where: {
        sessionId,
        isTemplate: true,
        templateName,
      },
    })

    if (existingTemplate) {
      throw new Error(`A template named "${templateName}" already exists`)
    }

    // Create a new template based on the existing pattern
    const template = await this.client.workPattern.create({
      data: {
        date: `template-${Date.now()}`, // Use unique date for templates
        isTemplate: true,
        templateName,
        sessionId,
        blocks: {
          create: existingPattern.blocks.map((b: any) => ({
            startTime: b.startTime,
            endTime: b.endTime,
            type: b.type,
            capacity: b.capacity ? JSON.stringify(b.capacity) : null,
          })),
        },
        meetings: {
          create: existingPattern.meetings.map((m: any) => ({
            name: m.name,
            startTime: m.startTime,
            endTime: m.endTime,
            type: m.type,
            recurring: m.recurring || 'none',
            daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
          })),
        },
      },
      include: {
        blocks: true,
        meetings: true,
      },
    })

    return {
      ...template,
      blocks: template.blocks.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: template.meetings.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }
  }

  async updateWorkPattern(id: string, data: any): Promise<any> {
    const { blocks, meetings, ...patternData } = data

    // Update pattern
    await this.client.workPattern.update({
      where: { id },
      data: patternData,
    })

    // Replace blocks if provided
    if (blocks) {
      await this.client.workBlock.deleteMany({
        where: { patternId: id },
      })

      await this.client.workBlock.createMany({
        data: blocks.map((b: any) => ({
          ...b,
          patternId: id,
          capacity: b.capacity ? JSON.stringify(b.capacity) : null,
        })),
      })
    }

    // Replace meetings if provided
    if (meetings) {
      await this.client.workMeeting.deleteMany({
        where: { patternId: id },
      })

      await this.client.workMeeting.createMany({
        data: meetings.map((m: any) => ({
          ...m,
          patternId: id,
          daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
        })),
      })
    }

    return this.getWorkPattern(patternData.date || id)
  }

  async getWorkTemplates(): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const templates = await this.client.workPattern.findMany({
      where: {
        isTemplate: true,
        sessionId,
      },
      include: {
        blocks: true,
        meetings: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return templates.map(t => ({
      ...t,
      blocks: t.blocks.map(b => ({
        ...b,
        capacity: b.capacity ? JSON.parse(b.capacity) : null,
      })),
      meetings: t.meetings.map(m => ({
        ...m,
        daysOfWeek: m.daysOfWeek ? JSON.parse(m.daysOfWeek) : null,
      })),
    }))
  }

  // Work Session operations (unified for both tasks and steps)
  async createWorkSession(data: {
    taskId: string
    stepId?: string
    type: 'focused' | 'admin'
    startTime: Date
    duration: number
    notes?: string
  }): Promise<any> {
    return this.client.workSession.create({
      data: {
        taskId: data.taskId,
        stepId: data.stepId ?? null,
        type: data.type,
        startTime: data.startTime,
        endTime: new Date(data.startTime.getTime() + data.duration * 60000),
        plannedMinutes: data.duration,
        actualMinutes: data.duration,
        notes: data.notes ?? null,
      },
    })
  }

  async updateWorkSession(id: string, data: any): Promise<any> {
    const { id: _id, ...updateData } = data
    return this.client.workSession.update({
      where: { id },
      data: updateData,
    })
  }

  async getWorkSessions(date: string): Promise<any[]> {
    const sessionId = await this.getActiveSession()
    const pattern = await this.client.workPattern.findUnique({
      where: {
        sessionId_date: {
          sessionId,
          date,
        },
      },
      include: { sessions: true },
    })

    return pattern?.sessions || []
  }

  async getTodayAccumulated(date: string): Promise<{ focusMinutes: number; adminMinutes: number }> {
    const sessionId = await this.getActiveSession()
    
    // Get work sessions for today
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const workSessions = await this.client.workSession.findMany({
      where: {
        task: {
          sessionId,
        },
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    })

    // Sum up by type
    return workSessions.reduce((acc, session) => {
      const minutes = session.actualMinutes || session.plannedMinutes || 0
      if (session.type === 'focused') {
        acc.focusMinutes += minutes
      } else {
        acc.adminMinutes += minutes
      }
      return acc
    }, { focusMinutes: 0, adminMinutes: 0 })
  }

  // Progress tracking operations
  async createStepWorkSession(data: {
    taskStepId: string;
    startTime: Date;
    duration: number;
    notes?: string;
  }): Promise<any> {
    // Get the step to find its task
    const step = await this.client.taskStep.findUnique({
      where: { id: data.taskStepId },
    })
    
    if (!step) throw new Error('Step not found')
    
    // Create work session with unified model
    return this.createWorkSession({
      taskId: step.taskId,
      stepId: data.taskStepId,
      type: step.type as 'focused' | 'admin',
      startTime: data.startTime,
      duration: data.duration,
      notes: data.notes,
    })
  }

  async updateTaskStepProgress(stepId: string, data: {
    actualDuration?: number;
    percentComplete?: number;
    status?: string;
    completedAt?: Date;
    startedAt?: Date;
  }): Promise<any> {
    return this.client.taskStep.update({
      where: { id: stepId },
      data,
    })
  }

  async getStepWorkSessions(stepId: string): Promise<any[]> {
    return this.client.workSession.findMany({
      where: { stepId },
      orderBy: { startTime: 'desc' },
    })
  }

  async recordTimeEstimate(data: {
    taskType: string;
    estimatedMinutes: number;
    actualMinutes: number;
    workflowCategory?: string;
  }): Promise<void> {
    const sessionId = await this.getActiveSession()
    const variance = ((data.actualMinutes - data.estimatedMinutes) / data.estimatedMinutes) * 100

    await this.client.timeEstimateAccuracy.create({
      data: {
        sessionId,
        taskType: data.taskType,
        estimatedMinutes: data.estimatedMinutes,
        actualMinutes: data.actualMinutes,
        variance,
        workflowCategory: data.workflowCategory ?? null,
      },
    })
  }

  async getTimeAccuracyStats(filters?: {
    taskType?: string;
    dateRange?: { start: Date; end: Date };
  }): Promise<{
    averageVariance: number;
    totalSamples: number;
    overestimateCount: number;
    underestimateCount: number;
    accurateCount: number;
    byTaskType: Record<string, { variance: number; samples: number }>;
  }> {
    const sessionId = await this.getActiveSession()
    const where: any = { sessionId }

    if (filters?.taskType) {
      where.taskType = filters.taskType
    }

    if (filters?.dateRange) {
      where.createdAt = {
        gte: filters.dateRange.start,
        lte: filters.dateRange.end,
      }
    }

    const records = await this.client.timeEstimateAccuracy.findMany({ where })

    if (records.length === 0) {
      return {
        averageVariance: 0,
        totalSamples: 0,
        overestimateCount: 0,
        underestimateCount: 0,
        accurateCount: 0,
        byTaskType: {},
      }
    }

    const stats = records.reduce(
      (acc, record) => {
        acc.totalVariance += record.variance
        
        if (record.variance > 10) {
          acc.overestimateCount++
        } else if (record.variance < -10) {
          acc.underestimateCount++
        } else {
          acc.accurateCount++
        }

        if (!acc.byTaskType[record.taskType]) {
          acc.byTaskType[record.taskType] = { totalVariance: 0, count: 0 }
        }
        acc.byTaskType[record.taskType].totalVariance += record.variance
        acc.byTaskType[record.taskType].count++

        return acc
      },
      {
        totalVariance: 0,
        overestimateCount: 0,
        underestimateCount: 0,
        accurateCount: 0,
        byTaskType: {} as Record<string, { totalVariance: number; count: number }>,
      }
    )

    const byTaskType = Object.entries(stats.byTaskType).reduce(
      (acc, [type, data]) => {
        acc[type] = {
          variance: data.totalVariance / data.count,
          samples: data.count,
        }
        return acc
      },
      {} as Record<string, { variance: number; samples: number }>
    )

    return {
      averageVariance: stats.totalVariance / records.length,
      totalSamples: records.length,
      overestimateCount: stats.overestimateCount,
      underestimateCount: stats.underestimateCount,
      accurateCount: stats.accurateCount,
      byTaskType,
    }
  }

  // Cleanup method
  async disconnect(): Promise<void> {
    await this.client.$disconnect()
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance()
