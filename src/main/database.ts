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

  // Task operations
  async getTasks(): Promise<Task[]> {
    const tasks = await this.client.task.findMany({
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

  async createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const task = await this.client.task.create({
      data: {
        ...taskData,
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
    const sequencedTasks = await this.client.sequencedTask.findMany({
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

  async createSequencedTask(taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<SequencedTask> {
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
        dependencies: JSON.stringify(sequencedTaskData.dependencies),
        steps: {
          create: steps.map((step, index) => ({
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
          const { tempId, templd, id: stepId, ...stepData } = step as any
          
          // Ensure dependsOn is an array
          const dependsOn = Array.isArray(step.dependsOn) ? step.dependsOn : []
          
          // Only include valid fields for TaskStep
          return {
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
    const contexts = await this.client.jobContext.findMany({
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
    const context = await this.client.jobContext.findFirst({
      where: { isActive: true },
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

    const context = await this.client.jobContext.create({
      data: {
        ...data,
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
    const entries = await this.client.jargonEntry.findMany({
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
    const entry = await this.client.jargonEntry.create({
      data: {
        ...data,
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
    const entries = await this.client.jargonEntry.findMany()
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

  // Cleanup method
  async disconnect(): Promise<void> {
    await this.client.$disconnect()
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance()
