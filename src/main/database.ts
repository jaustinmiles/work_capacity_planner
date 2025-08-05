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
    const { steps, ...sequencedTaskData } = taskData

    const sequencedTask = await this.client.sequencedTask.create({
      data: {
        ...sequencedTaskData,
        dependencies: JSON.stringify(sequencedTaskData.dependencies),
        steps: {
          create: steps.map((step, index) => ({
            ...step,
            dependsOn: JSON.stringify(step.dependsOn),
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
        data: steps.map((step, index) => ({
          ...step,
          dependsOn: JSON.stringify(step.dependsOn),
          sequencedTaskId: id,
          stepIndex: index,
        })),
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

  // Initialize with some default data if database is empty
  async initializeDefaultData(): Promise<void> {
    const taskCount = await this.client.task.count()
    const sequencedTaskCount = await this.client.sequencedTask.count()

    // Only add default data if database is completely empty
    if (taskCount === 0 && sequencedTaskCount === 0) {
      // Add some sample tasks
      await this.createTask({
        name: 'Review project requirements',
        duration: 60,
        importance: 7,
        urgency: 6,
        type: 'focused',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        notes: 'Initial project review and planning',
      })

      await this.createTask({
        name: 'Team standup meeting',
        duration: 30,
        importance: 5,
        urgency: 8,
        type: 'admin',
        asyncWaitTime: 0,
        dependencies: [],
        completed: false,
        notes: 'Daily team synchronization',
      })
    }
  }

  // Cleanup method
  async disconnect(): Promise<void> {
    await this.client.$disconnect()
  }
}

// Export singleton instance
export const db = DatabaseService.getInstance()
