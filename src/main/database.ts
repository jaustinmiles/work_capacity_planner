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

  async getActiveSession() {
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

  async getSessions() {
    return await this.client.session.findMany({
      orderBy: { updatedAt: 'desc' },
    })
  }

  async createSession(name: string, description?: string) {
    // Deactivate all other sessions
    await this.client.session.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    // Create and activate new session
    const session = await this.client.session.create({
      data: {
        name,
        description,
        isActive: true,
      },
    })

    this.activeSessionId = session.id
    return session
  }

  async switchSession(sessionId: string) {
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

  async updateSession(id: string, updates: { name?: string; description?: string }) {
    return await this.client.session.update({
      where: { id },
      data: updates,
    })
  }

  async deleteSession(id: string) {
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

  // Task operations
  async getTasks(): Promise<Task[]> {
    const sessionId = await this.getActiveSession()
    const tasks = await this.client.task.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    })

    return tasks.map(task => ({
      ...task,
      type: task.type as 'focused' | 'admin',
      completedAt: task.completedAt || undefined,
      notes: task.notes || undefined,
      actualDuration: task.actualDuration || undefined,
      projectId: task.projectId || undefined,
      dependencies: JSON.parse(task.dependencies),
    }))
  }

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<Task> {
    const sessionId = await this.getActiveSession()
    const task = await this.client.task.create({
      data: {
        ...taskData,
        sessionId,
        dependencies: JSON.stringify(taskData.dependencies),
      },
    })

    return {
      ...task,
      type: task.type as 'focused' | 'admin',
      completedAt: task.completedAt || undefined,
      notes: task.notes || undefined,
      actualDuration: task.actualDuration || undefined,
      projectId: task.projectId || undefined,
      dependencies: JSON.parse(task.dependencies),
    }
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const updateData: any = { ...updates }
    if (updateData.dependencies) {
      updateData.dependencies = JSON.stringify(updateData.dependencies)
    }
    // Remove fields that shouldn't be updated directly
    delete updateData.id
    delete updateData.createdAt

    const task = await this.client.task.update({
      where: { id },
      data: updateData,
    })

    return {
      ...task,
      type: task.type as 'focused' | 'admin',
      completedAt: task.completedAt || undefined,
      notes: task.notes || undefined,
      actualDuration: task.actualDuration || undefined,
      projectId: task.projectId || undefined,
      dependencies: JSON.parse(task.dependencies),
    }
  }

  async deleteTask(id: string): Promise<void> {
    await this.client.task.delete({
      where: { id },
    })
  }

  // Sequenced task operations
  async getSequencedTasks(): Promise<SequencedTask[]> {
    const sessionId = await this.getActiveSession()
    const sequencedTasks = await this.client.sequencedTask.findMany({
      where: { sessionId },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return sequencedTasks.map(task => ({
      ...task,
      type: task.type as 'focused' | 'admin',
      overallStatus: task.overallStatus as 'not_started' | 'in_progress' | 'waiting' | 'completed',
      notes: task.notes || undefined,
      dependencies: JSON.parse(task.dependencies),
      steps: task.steps.map(step => ({
        ...step,
        type: step.type as 'focused' | 'admin',
        status: step.status as 'pending' | 'in_progress' | 'waiting' | 'completed' | 'skipped',
        dependsOn: JSON.parse(step.dependsOn),
      })),
    }))
  }

  async createSequencedTask(taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<SequencedTask> {
    const sessionId = await this.getActiveSession()
    const { steps, ...rawTaskData } = taskData

    // Extract only the fields that exist in the SequencedTask model
    const sequencedTaskData = {
      name: rawTaskData.name,
      importance: rawTaskData.importance,
      urgency: rawTaskData.urgency,
      type: rawTaskData.type,
      notes: rawTaskData.notes,
      dependencies: rawTaskData.dependencies,
      completed: rawTaskData.completed,
      totalDuration: rawTaskData.totalDuration,
      criticalPathDuration: rawTaskData.criticalPathDuration,
      worstCaseDuration: rawTaskData.worstCaseDuration,
      overallStatus: rawTaskData.overallStatus,
    }

    const sequencedTask = await this.client.sequencedTask.create({
      data: {
        ...sequencedTaskData,
        sessionId,
        dependencies: JSON.stringify(sequencedTaskData.dependencies),
        steps: {
          create: steps.map((step, index) => ({
            id: step.id || `step-${Date.now()}-${index}`,
            name: step.name,
            duration: step.duration,
            type: step.type,
            dependsOn: JSON.stringify(step.dependsOn || []),
            asyncWaitTime: step.asyncWaitTime || 0,
            status: step.status || 'pending',
            stepIndex: index,
          })),
        },
      },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    return {
      ...sequencedTask,
      type: sequencedTask.type as 'focused' | 'admin',
      overallStatus: sequencedTask.overallStatus as 'not_started' | 'in_progress' | 'waiting' | 'completed',
      notes: sequencedTask.notes || undefined,
      dependencies: JSON.parse(sequencedTask.dependencies),
      steps: sequencedTask.steps.map(step => ({
        ...step,
        type: step.type as 'focused' | 'admin',
        status: step.status as 'pending' | 'in_progress' | 'waiting' | 'completed' | 'skipped',
        dependsOn: JSON.parse(step.dependsOn),
      })),
    }
  }

  async updateSequencedTask(id: string, updates: Partial<SequencedTask>): Promise<SequencedTask> {
    const { steps, ...updateData } = updates
    const cleanUpdateData: any = { ...updateData }

    // Handle dependencies serialization
    if (cleanUpdateData.dependencies) {
      cleanUpdateData.dependencies = JSON.stringify(cleanUpdateData.dependencies)
    }

    // Remove fields that shouldn't be updated directly
    delete cleanUpdateData.id
    delete cleanUpdateData.createdAt

    // Update the main sequenced task
    await this.client.sequencedTask.update({
      where: { id },
      data: cleanUpdateData,
    })

    // If steps are provided, update them
    if (steps) {
      // Delete existing steps and recreate them (simpler than complex updates)
      await this.client.taskStep.deleteMany({
        where: { sequencedTaskId: id },
      })

      await this.client.taskStep.createMany({
        data: steps.map((step, index) => {
          // Remove tempId and id fields that don't exist in the schema
          // Remove tempId, templd and id fields that don't exist in the schema
          const stepData = {
            name: step.name,
            duration: step.duration,
            type: step.type,
            asyncWaitTime: step.asyncWaitTime || 0,
            status: step.status || 'pending',
          }

          // Ensure dependsOn is an array
          const dependsOn = Array.isArray(step.dependsOn) ? step.dependsOn : []

          // Only include valid fields for TaskStep
          return {
            id: step.id || `step-${Date.now()}-${index}`,
            name: stepData.name,
            duration: stepData.duration,
            type: stepData.type,
            dependsOn: JSON.stringify(dependsOn),
            asyncWaitTime: stepData.asyncWaitTime || 0,
            status: stepData.status || 'pending',
            sequencedTaskId: id,
            stepIndex: index,
          }
        }),
      })
    }

    // Fetch and return the updated sequenced task
    const updatedTask = await this.client.sequencedTask.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    if (!updatedTask) {
      throw new Error(`SequencedTask with id ${id} not found`)
    }

    return {
      ...updatedTask,
      type: updatedTask.type as 'focused' | 'admin',
      overallStatus: updatedTask.overallStatus as 'not_started' | 'in_progress' | 'waiting' | 'completed',
      notes: updatedTask.notes || undefined,
      dependencies: JSON.parse(updatedTask.dependencies),
      steps: updatedTask.steps.map(step => ({
        ...step,
        type: step.type as 'focused' | 'admin',
        status: step.status as 'pending' | 'in_progress' | 'waiting' | 'completed' | 'skipped',
        dependsOn: JSON.parse(step.dependsOn),
      })),
    }
  }

  async deleteSequencedTask(id: string): Promise<void> {
    await this.client.sequencedTask.delete({
      where: { id },
    })
    // TaskSteps will be cascade deleted due to the schema relationship
  }

  // Update individual task step
  async updateTaskStep(stepId: string, updates: Partial<TaskStep>): Promise<void> {
    const updateData: any = { ...updates }
    if (updateData.dependsOn) {
      updateData.dependsOn = JSON.stringify(updateData.dependsOn)
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id

    await this.client.taskStep.update({
      where: { id: stepId },
      data: updateData,
    })
  }

  // Utility methods
  async getTaskById(id: string): Promise<Task | null> {
    const task = await this.client.task.findUnique({
      where: { id },
    })

    if (!task) return null

    return {
      ...task,
      type: task.type as 'focused' | 'admin',
      completedAt: task.completedAt || undefined,
      notes: task.notes || undefined,
      actualDuration: task.actualDuration || undefined,
      projectId: task.projectId || undefined,
      dependencies: JSON.parse(task.dependencies),
    }
  }

  async getSequencedTaskById(id: string): Promise<SequencedTask | null> {
    const task = await this.client.sequencedTask.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    if (!task) return null

    return {
      ...task,
      type: task.type as 'focused' | 'admin',
      overallStatus: task.overallStatus as 'not_started' | 'in_progress' | 'waiting' | 'completed',
      notes: task.notes || undefined,
      dependencies: JSON.parse(task.dependencies),
      steps: task.steps.map(step => ({
        ...step,
        type: step.type as 'focused' | 'admin',
        status: step.status as 'pending' | 'in_progress' | 'waiting' | 'completed' | 'skipped',
        dependsOn: JSON.parse(step.dependsOn),
      })),
    }
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
        notes: entry.notes,
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
    await this.client.sequencedTask.deleteMany({})
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
    const templates = await this.client.workPattern.findMany({
      where: { isTemplate: true },
      include: {
        blocks: true,
        meetings: true,
      },
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

  // Work Session operations
  async createWorkSession(data: any): Promise<any> {
    return this.client.workSession.create({ data })
  }

  async updateWorkSession(id: string, data: any): Promise<any> {
    const { id: _, ...updateData } = data
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
    const sessions = await this.getWorkSessions(date)

    return sessions.reduce((acc, session) => {
      const minutes = session.actualMinutes || session.plannedMinutes
      if (session.type === 'focused') {
        acc.focusMinutes += minutes
      } else {
        acc.adminMinutes += minutes
      }
      return acc
    }, { focusMinutes: 0, adminMinutes: 0 })
  }

  // Cleanup method
  async disconnect(): Promise<void> {
    await this.client.$disconnect()
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance()
