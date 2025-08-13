// Unified database methods to replace the old sequenced task methods
// These will be merged into the main database.ts file

import { Task, TaskStep } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

export class UnifiedDatabaseMethods {
  // Get all tasks (both simple and workflows)
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

    return tasks.map(task => ({
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
      steps: task.steps?.map(step => ({
        ...step,
        type: step.type as 'focused' | 'admin',
        status: step.status as 'pending' | 'in_progress' | 'waiting' | 'completed' | 'skipped',
        dependsOn: step.dependsOn ? JSON.parse(step.dependsOn) : [],
        actualDuration: step.actualDuration || undefined,
        startedAt: step.startedAt || undefined,
        completedAt: step.completedAt || undefined,
      })),
    }))
  }

  // Get only workflow tasks (hasSteps = true)
  async getSequencedTasks(): Promise<SequencedTask[]> {
    const tasks = await this.getTasks()
    return tasks.filter(task => task.hasSteps) as SequencedTask[]
  }

  // Create a task (simple or workflow)
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
      return this.getTaskById(task.id)
    }

    return this.formatTask(task)
  }

  // Create a workflow task (alias for backward compatibility)
  async createSequencedTask(taskData: Omit<SequencedTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>): Promise<SequencedTask> {
    return this.createTask({
      ...taskData,
      hasSteps: true,
    }) as Promise<SequencedTask>
  }

  // Update a task
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

  // Update a workflow task (alias)
  async updateSequencedTask(id: string, updates: Partial<SequencedTask>): Promise<SequencedTask> {
    return this.updateTask(id, updates) as Promise<SequencedTask>
  }

  // Delete a task
  async deleteTask(id: string): Promise<void> {
    await this.client.task.delete({
      where: { id },
    })
    // Steps will be cascade deleted
  }

  // Delete a workflow task (alias)
  async deleteSequencedTask(id: string): Promise<void> {
    return this.deleteTask(id)
  }

  // Get task by ID
  async getTaskById(id: string): Promise<Task> {
    const task = await this.client.task.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    if (!task) throw new Error('Task not found')
    return this.formatTask(task)
  }

  // Get sequenced task by ID (alias)
  async getSequencedTaskById(id: string): Promise<SequencedTask> {
    const task = await this.getTaskById(id)
    if (!task.hasSteps) throw new Error('Task is not a workflow')
    return task as SequencedTask
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

  // Update accumulated time to use unified WorkSession
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

  // Create work session (unified for both tasks and steps)
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
        stepId: data.stepId,
        type: data.type,
        startTime: data.startTime,
        endTime: new Date(data.startTime.getTime() + data.duration * 60000),
        plannedMinutes: data.duration,
        actualMinutes: data.duration,
        notes: data.notes,
      },
    })
  }
}