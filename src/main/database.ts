import { PrismaClient } from '@prisma/client'
import { Task, TaskStep } from '../shared/types'
import { TaskType } from '../shared/enums'
import { getMainLogger } from '../logging/index.main'
import * as crypto from 'crypto'

// Create Prisma client instance
const prisma = new PrismaClient()

// Initialize main logger with Prisma
const mainLogger = getMainLogger()
mainLogger.setPrisma(prisma)

// Database service for managing tasks (including workflows)
export class DatabaseService {
  private static instance: DatabaseService
  private client: PrismaClient
  private logger = mainLogger.child({ component: 'database' })

  private constructor() {
    this.client = prisma
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  // Utility function to parse date string and create local date range
  private getLocalDateRange(dateString: string): { startOfDay: Date; endOfDay: Date } {
    const [year, month, day] = dateString.split('-').map(Number)

    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

    return { startOfDay, endOfDay }
  }

  // Session management
  private activeSessionId: string | null = null
  private sessionInitPromise: Promise<string> | null = null

  async getActiveSession(): Promise<string> {
    // If already cached, return it
    if (this.activeSessionId) {
      return this.activeSessionId
    }

    // If initialization is in progress, wait for it
    if (this.sessionInitPromise) {
      return this.sessionInitPromise
    }

    // Start initialization and cache the promise to prevent race conditions
    this.sessionInitPromise = this.initializeActiveSession()

    try {
      this.activeSessionId = await this.sessionInitPromise
      return this.activeSessionId
    } finally {
      this.sessionInitPromise = null
    }
  }

  private async initializeActiveSession(): Promise<string> {
    // Find the active session or create one if none exists
    let session = await this.client.session.findFirst({
      where: { isActive: true },
    })

    if (!session) {
      // Check again for any existing session to reuse before creating a new one
      const existingSession = await this.client.session.findFirst({
        orderBy: { createdAt: 'desc' },
      })

      if (existingSession) {
        // Reactivate the most recent session instead of creating a duplicate
        session = await this.client.session.update({
          where: { id: existingSession.id },
          data: { isActive: true },
        })
      } else {
        // Create a default session only if truly none exists
        session = await this.client.session.create({
          data: {
            id: crypto.randomUUID(),
            name: 'Default Session',
            description: 'Initial work session',
            isActive: true,
          },
        })
      }
    }

    return session.id
  }

  async getSessions(): Promise<{ id: string; name: string; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date }[]> {
    const sessions = await this.client.session.findMany({
      orderBy: { updatedAt: 'desc' },
    })

    console.log('[DB] Found sessions:', sessions.length, sessions.map(s => ({ id: s.id, name: s.name, isActive: s.isActive })))

    // Log if we detect duplicates but don't filter them - let the UI show the actual state
    const uniqueIds = new Set(sessions.map(s => s.id))
    if (uniqueIds.size !== sessions.length) {
      console.error('[DB] WARNING: Duplicate session IDs detected in database!', {
        totalSessions: sessions.length,
        uniqueIds: uniqueIds.size,
        duplicates: sessions.length - uniqueIds.size,
      })
    }

    return sessions
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
    console.log('[DB] Switching session to:', sessionId)
    console.log('[DB] Previous activeSessionId:', this.activeSessionId)

    // Clear the cached session ID to force re-fetch
    this.activeSessionId = null

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
    console.log('[DB] Session switched successfully to:', session.id)
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
    console.log('[DB] Attempting to delete session:', id)

    const session = await this.client.session.findUnique({
      where: { id },
    })

    if (!session) {
      console.warn('[DB] Session not found for deletion:', id)
      throw new Error(`Session ${id} not found`)
    }

    if (session?.isActive) {
      console.warn('[DB] Cannot delete active session:', id)
      throw new Error('Cannot delete the active session')
    }

    try {
      await this.client.session.delete({
        where: { id },
      })
      console.log('[DB] Session deleted successfully:', id)
    } catch (error) {
      console.error('[DB] Failed to delete session:', id, error)
      throw error
    }
  }

  async getCurrentSession(): Promise<any> {
    const session = await this.client.session.findFirst({
      where: { isActive: true },
      include: { SchedulingPreferences: true },
    })
    return session
  }

  async updateSchedulingPreferences(sessionId: string, updates: any): Promise<any> {
    // Check if preferences exist
    const existing = await this.client.schedulingPreferences.findUnique({
      where: { sessionId },
    })

    if (existing) {
      // Update existing preferences
      return await this.client.schedulingPreferences.update({
        where: { sessionId },
        data: updates,
      })
    } else {
      // Create new preferences
      return await this.client.schedulingPreferences.create({
        data: {
          id: `pref-${Date.now()}`,
          sessionId,
          ...updates,
        },
      })
    }
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    const sessionId = await this.getActiveSession()
    console.log('[DB] getTasks - Using sessionId:', sessionId)

    const tasks = await this.client.task.findMany({
      where: { sessionId },
      include: {
        TaskStep: true, // Include steps for workflows
      },
      orderBy: { createdAt: 'desc' },
    })

    console.log(`[DB] getTasks - Found ${tasks.length} tasks for session ${sessionId}`)
    const formattedTasks = tasks.map(task => this.formatTask(task))
    console.log(`[DB] getTasks - Returning ${formattedTasks.length} formatted tasks`)
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
        hasSteps: !!steps && steps.length > 0,
        criticalPathDuration: taskData.criticalPathDuration || taskData.duration,
        worstCaseDuration: taskData.worstCaseDuration || taskData.duration,
        updatedAt: new Date(),
      },
    })

    // Create steps if this is a workflow
    if (steps && steps.length > 0) {
      // Steps should already have proper IDs from the frontend
      // If not, generate new ones (for backward compatibility)
      const stepsWithIds = steps.map((step: TaskStep, index: number) => ({
        id: step.id || crypto.randomUUID(),
        taskId: task.id,
        name: step.name,
        duration: step.duration,
        type: step.type,
        dependsOn: JSON.stringify(step.dependsOn || []),
        asyncWaitTime: step.asyncWaitTime || 0,
        status: step.status || 'pending',
        stepIndex: step.stepIndex ?? index,
        percentComplete: step.percentComplete ?? 0,
        notes: step.notes || null,
        cognitiveComplexity: step.cognitiveComplexity || null,
        importance: step.importance || null,
        urgency: step.urgency || null,
      }))

      await this.client.taskStep.createMany({
        data: stepsWithIds,
      })

      // Return task with steps
      const taskWithSteps = await this.client.task.findUnique({
        where: { id: task.id },
        include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
      })
      return this.formatTask(taskWithSteps!)
    }

    return this.formatTask(task)
  }

  async updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'sessionId'>>): Promise<Task> {
    const { steps, ...rawUpdates } = updates as any

    // Define allowed fields for Task model update
    const allowedFields = [
      'name', 'duration', 'importance', 'urgency', 'type', 'category',
      'asyncWaitTime', 'dependencies', 'completed', 'completedAt',
      'actualDuration', 'notes', 'projectId', 'deadline', 'isLocked',
      'lockedStartTime', 'hasSteps', 'currentStepId', 'overallStatus',
      'criticalPathDuration', 'worstCaseDuration', 'cognitiveComplexity',
    ]

    // Clean update data - only include allowed fields
    const cleanUpdateData = Object.entries(rawUpdates).reduce((acc, [key, value]) => {
      // Only include fields that are allowed
      // Include defined values, or null for nullable fields like deadline
      if (allowedFields.includes(key) && (value !== undefined || (key === 'deadline' && value === null))) {
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
      data: {
        ...cleanUpdateData,
        updatedAt: new Date(),
      },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    // If steps are provided, update them
    if (steps && Array.isArray(steps)) {
      // Get existing steps to determine which are new vs updates
      const existingSteps = await this.client.taskStep.findMany({
        where: { taskId: id },
      })
      const existingStepIds = new Set(existingSteps.map(s => s.id))

      // First pass: ensure all steps have IDs
      const stepsWithIds = steps.map((step: TaskStep) => {
        // If step doesn't have an ID or it's not in existing steps, it's new
        if (!step.id) {
          // Generate ID for new step
          return { ...step, id: crypto.randomUUID() }
        }
        return step
      })

      // Delete steps that are no longer in the new list
      const newStepIds = new Set(stepsWithIds.map((s: TaskStep) => s.id))
      const stepsToDelete = existingSteps.filter(s => !newStepIds.has(s.id))
      for (const step of stepsToDelete) {
        await this.client.taskStep.delete({
          where: { id: step.id },
        })
      }

      // Update or create each step
      for (let i = 0; i < stepsWithIds.length; i++) {
        const step = stepsWithIds[i]

        // Dependencies should already be properly mapped from frontend
        const dependencies = step.dependsOn || []

        const stepData = {
          name: step.name,
          duration: step.duration,
          type: step.type,
          dependsOn: JSON.stringify(dependencies),
          asyncWaitTime: step.asyncWaitTime || 0,
          stepIndex: i,
          status: step.status || 'pending',
          percentComplete: step.percentComplete || 0,
          notes: step.notes || null,
          cognitiveComplexity: step.cognitiveComplexity || null,
          importance: step.importance || null,
          urgency: step.urgency || null,
        }

        if (existingStepIds.has(step.id)) {
          // Check if type changed
          const existingStep = existingSteps.find(s => s.id === step.id)
          if (existingStep && existingStep.type !== step.type) {
            // Type changed, update work sessions
            await this.updateWorkSessionTypesForStep(step.id, step.type)
          }

          // Update existing step
          await this.client.taskStep.update({
            where: { id: step.id },
            data: stepData,
          })
        } else {
          // Create new step with the already generated UUID
          await this.client.taskStep.create({
            data: {
              id: step.id, // Use the ID we already generated above
              ...stepData,
              taskId: id,
            },
          })
        }
      }

      // Return task with updated steps
      const updatedTask = await this.client.task.findUnique({
        where: { id },
        include: {
          TaskStep: {
            orderBy: { stepIndex: 'asc' },
          },
        },
      })

      return this.formatTask(updatedTask!)
    }

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

  async updateTaskStep(taskId: string, stepId: string, updates: { status?: string; actualDuration?: number; notes?: string; percentComplete?: number; completedAt?: Date; startedAt?: Date }): Promise<void> {
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
    if (!task) {
      throw new Error('Cannot format null or undefined task')
    }

    // Debug log to see what we're getting
    if (task.hasSteps) {
      // Task has steps - will be processed below
    }

    return {
      ...task,
      dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
      completedAt: task.completedAt ?? null,
      actualDuration: task.actualDuration ?? null,
      deadline: task.deadline ?? null,
      currentStepId: task.currentStepId ?? null,
      steps: task.hasSteps && task.TaskStep ? task.TaskStep
        .sort((a: any, b: any) => a.stepIndex - b.stepIndex)
        .map((step: any) => ({
          ...step,
          dependsOn: step.dependsOn ? JSON.parse(step.dependsOn) : [],
        })) : undefined,
    }
  }

  async getTaskById(id: string): Promise<Task | null> {
    const task = await this.client.task.findUnique({
      where: { id },
      include: {
        TaskStep: true, // Include steps for workflows
      },
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

  // Sequenced Tasks - NOW USING UNIFIED TASK MODEL
  async getSequencedTasks(): Promise<any[]> {
    // Get all workflows (tasks with steps) and format them as SequencedTasks for backward compatibility
    const allTasks = await this.getTasks()
    const workflows = allTasks.filter(task => task.hasSteps && task.steps)

    // Format as SequencedTask for UI compatibility
    return workflows.map(task => ({
      ...task,
      totalDuration: task.duration,
      steps: task.steps || [],
      // Ensure we have the right structure for UI
      overallStatus: task.overallStatus || 'not_started',
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
    }))
  }

  async getSequencedTaskById(id: string): Promise<any | null> {
    // Get task and format as SequencedTask for UI compatibility
    const task = await this.getTaskById(id)
    if (!task || !task.hasSteps) return null

    return {
      ...task,
      totalDuration: task.duration,
      steps: task.steps || [],
      overallStatus: task.overallStatus || 'not_started',
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
    }
  }

  async createSequencedTask(taskData: any): Promise<any> {
    // Create task as workflow and format as SequencedTask
    const task = await this.createTask({
      ...taskData,
      hasSteps: true,
      steps: taskData.steps,
    })

    // Return in SequencedTask format for UI compatibility
    return {
      ...task,
      totalDuration: task.duration,
      steps: task.steps || [],
      overallStatus: task.overallStatus || 'not_started',
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
    }
  }

  async updateSequencedTask(id: string, updates: any): Promise<any> {
    // Update task and format as SequencedTask
    const task = await this.updateTask(id, updates)

    // Return in SequencedTask format for UI compatibility
    return {
      ...task,
      totalDuration: task.duration,
      steps: task.steps || [],
      overallStatus: task.overallStatus || 'not_started',
      criticalPathDuration: task.criticalPathDuration || task.duration,
      worstCaseDuration: task.worstCaseDuration || task.duration,
    }
  }

  async deleteSequencedTask(id: string): Promise<void> {
    // Redirect to deleteTask
    await this.deleteTask(id)
  }

  async addStepToWorkflow(workflowId: string, stepData: {
    name: string
    duration: number
    type: TaskType
    afterStep?: string
    beforeStep?: string
    dependencies?: string[]
    asyncWaitTime?: number
  }): Promise<any> {

    // Get existing steps to determine order
    const existingSteps = await this.client.taskStep.findMany({
      where: { taskId: workflowId },
      orderBy: { stepIndex: 'asc' },
    })

    // Determine the index for the new step
    let newStepIndex = existingSteps.length // Default to end

    if (stepData.afterStep) {
      const afterIndex = existingSteps.findIndex(s => s.name === stepData.afterStep)
      if (afterIndex !== -1) {
        newStepIndex = afterIndex + 1
      }
    } else if (stepData.beforeStep) {
      const beforeIndex = existingSteps.findIndex(s => s.name === stepData.beforeStep)
      if (beforeIndex !== -1) {
        newStepIndex = beforeIndex
      }
    }

    // Shift existing steps if inserting in the middle
    if (newStepIndex < existingSteps.length) {
      for (let i = newStepIndex; i < existingSteps.length; i++) {
        await this.client.taskStep.update({
          where: { id: existingSteps[i].id },
          data: { stepIndex: existingSteps[i].stepIndex + 1 },
        })
      }
    }

    // Create the new step
    await this.client.taskStep.create({
      data: {
        id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        taskId: workflowId,
        name: stepData.name,
        duration: stepData.duration,
        type: stepData.type,
        stepIndex: newStepIndex,
        dependsOn: JSON.stringify(stepData.dependencies || []),
        asyncWaitTime: stepData.asyncWaitTime || 0,
        status: 'pending',
        percentComplete: 0,
      },
    })

    // Update the workflow's total duration
    const updatedTask = await this.client.task.findUnique({
      where: { id: workflowId },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    if (updatedTask) {
      const totalDuration = updatedTask.TaskStep.reduce((sum, step) => sum + step.duration, 0)
      await this.client.task.update({
        where: { id: workflowId },
        data: { duration: totalDuration },
      })
    }


    // Return the updated workflow in SequencedTask format
    const finalTask = await this.client.task.findUnique({
      where: { id: workflowId },
      include: {
        TaskStep: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    })

    return this.formatTask(finalTask!)
  }

  private formatSequencedTask(task: any): any {
    // Redirect to formatTask since we're using unified model
    return this.formatTask(task)
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
      blocks: pattern.WorkBlock.map(b => {
        // Convert database structure to WorkBlock type structure
        let capacity: { focusMinutes: number; adminMinutes: number } | null = null

        // Try to parse JSON capacity field first
        if (b.capacity) {
          try {
            capacity = JSON.parse(b.capacity)
          } catch (e) {
            // If not JSON, try to use individual fields
            capacity = null
          }
        }

        // If no capacity object, build from individual fields or calculate defaults
        if (!capacity && (b.focusCapacity !== null || b.adminCapacity !== null)) {
          capacity = {
            focusMinutes: b.focusCapacity || 0,
            adminMinutes: b.adminCapacity || 0,
          }
        } else if (!capacity) {
          // Calculate default capacity based on block type and duration
          const [startHour, startMin] = b.startTime.split(':').map(Number)
          const [endHour, endMin] = b.endTime.split(':').map(Number)
          const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin)

          // Set capacity based on block type
          switch (b.type) {
            case 'focused':
              capacity = { focusMinutes: totalMinutes, adminMinutes: 0 }
              break
            case 'admin':
              capacity = { focusMinutes: 0, adminMinutes: totalMinutes }
              break
            case 'mixed':
              capacity = { focusMinutes: Math.floor(totalMinutes * 0.7), adminMinutes: Math.floor(totalMinutes * 0.3) }
              break
            case 'flexible':
              capacity = { focusMinutes: Math.floor(totalMinutes * 0.5), adminMinutes: Math.floor(totalMinutes * 0.5) }
              break
            default:
              capacity = { focusMinutes: 0, adminMinutes: 0 }
          }
        }

        return {
          ...b,
          capacity,
        }
      }),
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
    recurring?: 'none' | 'daily' | 'weekly'
  }): Promise<any> {
    const sessionId = await this.getActiveSession()
    const { blocks, meetings, recurring, ...patternData } = data

    // First, delete existing pattern if it exists (to replace it)
    if (!data.isTemplate) {
      await this.client.workPattern.deleteMany({
        where: {
          sessionId,
          date: data.date,
        },
      })
    }

    const pattern = await this.client.workPattern.create({
      data: {
        id: crypto.randomUUID(),
        ...patternData,
        sessionId,
        WorkBlock: {
          create: (blocks || []).map((b: any) => {
            const { patternId: _patternId, id: _id, ...blockData } = b
            return {
              id: crypto.randomUUID(),
              ...blockData,
              capacity: b.capacity ? JSON.stringify(b.capacity) : null,
            }
          }),
        },
        WorkMeeting: {
          create: (meetings || []).map((m: any) => {
            const { patternId: _patternId, id: _id, ...meetingData } = m
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

    // Handle repetition for sleep blocks
    if (recurring === 'daily' && !data.isTemplate) {
      // Check if this pattern has sleep blocks (in meetings array)
      const hasSleepBlocks = meetings?.some(m =>
        m.name === 'Sleep' || m.type === 'blocked',
      )

      if (hasSleepBlocks) {
        // Create patterns for the next 30 days
        const startDate = new Date(data.date)
        for (let i = 1; i <= 30; i++) {
          const futureDate = new Date(startDate)
          futureDate.setDate(futureDate.getDate() + i)
          const futureDateStr = futureDate.toISOString().split('T')[0]

          // Check if pattern already exists for this date
          const existingPattern = await this.client.workPattern.findUnique({
            where: {
              sessionId_date: {
                sessionId,
                date: futureDateStr,
              },
            },
          })

          // Only create if it doesn't exist
          if (!existingPattern) {
            await this.client.workPattern.create({
              data: {
                id: crypto.randomUUID(),
                date: futureDateStr,
                sessionId,
                isTemplate: false,
                WorkBlock: {
                  create: (blocks || []).map((b: any) => {
                    const { patternId: _patternId, id: _id, ...blockData } = b
                    return {
                      id: crypto.randomUUID(),
                      ...blockData,
                      capacity: b.capacity ? JSON.stringify(b.capacity) : null,
                    }
                  }),
                },
                WorkMeeting: {
                  create: (meetings || []).map((m: any) => {
                    const { patternId: _patternId, id: _id, ...meetingData } = m
                    return {
                      id: crypto.randomUUID(),
                      ...meetingData,
                      daysOfWeek: m.daysOfWeek ? JSON.stringify(m.daysOfWeek) : null,
                    }
                  }),
                },
              },
            })
          }
        }

        console.log(`Created daily sleep patterns for next 30 days from ${data.date}`)
      }
    }

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
            const { patternId: _patternId, id: _id, ...blockData } = b
            return {
              id: crypto.randomUUID(),
              ...blockData,
              capacity: b.capacity ? JSON.stringify(b.capacity) : null,
            }
          }),
        },
        WorkMeeting: {
          create: (updates.meetings || []).map((m: any) => {
            const { patternId: _patternId, id: _id, ...meetingData } = m
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
    type: TaskType
    startTime: Date
    endTime?: Date
    plannedMinutes: number
    actualMinutes?: number
    notes?: string
  }): Promise<any> {
    // Validate required fields
    if (!data.taskId) {
      throw new Error('taskId is required for creating a work session')
    }
    if (!data.type) {
      throw new Error('type is required for creating a work session')
    }
    if (data.plannedMinutes === undefined || data.plannedMinutes === null) {
      throw new Error('plannedMinutes is required for creating a work session')
    }
    if (!data.startTime) {
      throw new Error('startTime is required for creating a work session')
    }

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

  async getTodayAccumulated(date: string): Promise<{ focused: number; admin: number; personal: number; total: number }> {
    const _sessionId = await this.getActiveSession()

    // APPROACH 1: Get work sessions for the date
    const { startOfDay, endOfDay } = this.getLocalDateRange(date)

    const workSessions = await this.client.workSession.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        Task: true,
      },
    })

    // APPROACH 2: Also check task steps that were completed today with actualDuration
    const completedSteps = await this.client.taskStep.findMany({
      where: {
        completedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        actualDuration: {
          gt: 0,
        },
      },
    })

    // APPROACH 3: Check tasks with actualDuration that were updated today (unused for now)
    // const tasksWithTime = await this.client.task.findMany({
    //   where: {
    //     sessionId: _sessionId,
    //     actualDuration: {
    //       gt: 0,
    //     },
    //   },
    // })

    // Accumulate from work sessions
    const accumulated = workSessions.reduce((acc, session) => {
      const minutes = session.actualMinutes || session.plannedMinutes || 0
      if (session.type === TaskType.Focused) {
        acc.focused += minutes
      } else if (session.type === TaskType.Admin) {
        acc.admin += minutes
      } else if (session.type === TaskType.Personal) {
        acc.personal += minutes
      }
      acc.total += minutes
      return acc
    }, { focused: 0, admin: 0, personal: 0, total: 0 })

    // Add time from completed steps (if not already in work sessions)
    completedSteps.forEach(step => {
      if (step.actualDuration) {
        // Check if this step already has a work session
        const hasWorkSession = workSessions.some(ws => ws.stepId === step.id)
        if (!hasWorkSession) {
          const stepType = step.type as TaskType
          if (stepType === TaskType.Focused) {
            accumulated.focused += step.actualDuration
          } else if (stepType === TaskType.Admin) {
            accumulated.admin += step.actualDuration
          } else if (stepType === TaskType.Personal) {
            accumulated.personal += step.actualDuration
          }
          accumulated.total += step.actualDuration
        }
      }
    })

    return accumulated
  }

  async getTaskTotalLoggedTime(taskId: string): Promise<number> {
    const workSessions = await this.client.workSession.findMany({
      where: { taskId },
    })

    const total = workSessions.reduce((total, session) => {
      return total + (session.actualMinutes || session.plannedMinutes || 0)
    }, 0)

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

  async getJargonDictionary(): Promise<Record<string, string>> {
    const entries = await this.getJargonEntries()
    const dictionary: Record<string, string> = {}
    for (const entry of entries) {
      dictionary[entry.term] = entry.definition || ''
    }
    return dictionary
  }

  async updateJargonDefinition(term: string, definition: string): Promise<void> {
    const sessionId = await this.getActiveSession()
    const existing = await this.client.jargonEntry.findFirst({
      where: { sessionId, term },
    })

    if (existing) {
      await this.client.jargonEntry.update({
        where: { id: existing.id },
        data: { definition, updatedAt: new Date() },
      })
    } else {
      // Create new entry if it doesn't exist
      await this.client.jargonEntry.create({
        data: {
          id: `jargon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          term,
          definition,
          sessionId,
          category: 'custom',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    }
  }

  async deleteAllTasks(): Promise<void> {
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({ where: { sessionId } })
  }

  async deleteAllSequencedTasks(): Promise<void> {
    // Delete all workflows (tasks with hasSteps=true)
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({ where: { sessionId, hasSteps: true } })
  }

  async deleteAllUserData(): Promise<void> {
    const sessionId = await this.getActiveSession()
    await this.client.task.deleteMany({ where: { sessionId } })
    // Note: SequencedTasks are now part of Task table with hasSteps=true
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
    // Get the session to know which task/step to update
    const session = await this.client.workSession.findUnique({
      where: { id },
    })

    if (!session) throw new Error(`Work session not found: ${id}`)

    // If only actualMinutes is provided, use the old method
    if (Object.keys(data).length === 1 && data.actualMinutes !== undefined) {
      const result = await this.endWorkSession(id, data.actualMinutes)
      // Recalculate actualDuration
      if (session.stepId) {
        await this.recalculateStepActualDuration(session.stepId)
      } else if (session.taskId) {
        await this.recalculateTaskActualDuration(session.taskId)
      }
      return result
    }

    // Otherwise, do a full update
    const updateData: any = {}
    if (data.plannedMinutes !== undefined) updateData.plannedMinutes = data.plannedMinutes
    if (data.actualMinutes !== undefined) updateData.actualMinutes = data.actualMinutes
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.startTime !== undefined) updateData.startTime = data.startTime
    if (data.endTime !== undefined) updateData.endTime = data.endTime

    const result = await this.client.workSession.update({
      where: { id },
      data: updateData,
    })

    // Recalculate actualDuration after update
    if (session.stepId) {
      await this.recalculateStepActualDuration(session.stepId)
    } else if (session.taskId) {
      await this.recalculateTaskActualDuration(session.taskId)
    }

    return result
  }

  async deleteWorkSession(id: string): Promise<void> {
    // Get the work session before deleting to know which task/step to update
    const session = await this.client.workSession.findUnique({
      where: { id },
    })

    if (!session) return

    // Delete the session
    await this.client.workSession.delete({
      where: { id },
    })

    // Recalculate actualDuration for the task/step
    if (session.stepId) {
      await this.recalculateStepActualDuration(session.stepId)
    } else if (session.taskId) {
      await this.recalculateTaskActualDuration(session.taskId)
    }
  }

  async recalculateStepActualDuration(stepId: string): Promise<void> {
    // Get all work sessions for this step
    const sessions = await this.client.workSession.findMany({
      where: { stepId },
    })

    // Calculate total actual duration from work sessions
    const totalActualMinutes = sessions.reduce((sum, session) =>
      sum + (session.actualMinutes || session.plannedMinutes || 0), 0)

    // Update the step's actualDuration
    await this.client.taskStep.update({
      where: { id: stepId },
      data: { actualDuration: totalActualMinutes > 0 ? totalActualMinutes : null },
    })
  }

  async recalculateTaskActualDuration(taskId: string): Promise<void> {
    // Get all work sessions for this task (not including step sessions)
    const sessions = await this.client.workSession.findMany({
      where: {
        taskId,
        stepId: null,
      },
    })

    // Calculate total actual duration from work sessions
    const totalActualMinutes = sessions.reduce((sum, session) =>
      sum + (session.actualMinutes || session.plannedMinutes || 0), 0)

    // Update the task's actualDuration
    await this.client.task.update({
      where: { id: taskId },
      data: { actualDuration: totalActualMinutes > 0 ? totalActualMinutes : null },
    })
  }

  async getWorkSessionsForTask(taskId: string): Promise<any[]> {
    return this.client.workSession.findMany({
      where: { taskId },
      orderBy: { startTime: 'desc' },
    })
  }

  async getWorkSessions(date: string): Promise<any[]> {
    // Get all work sessions for the given date
    // This includes both pattern-based sessions and standalone sessions
    const { startOfDay, endOfDay } = this.getLocalDateRange(date)

    const sessions = await this.client.workSession.findMany({
      where: {
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        Task: true,
      },
      orderBy: { startTime: 'asc' },
    })

    return sessions
  }

  async createStepWorkSession(data: any): Promise<any> {

    // Transform the data from UI format to database format
    // UI sends: { taskStepId, startTime, duration, notes }
    // DB needs: { taskId, stepId, type, startTime, plannedMinutes, notes }

    // Handle both taskStepId and stepId field names
    const stepId = data.taskStepId || data.stepId || data.taskStepld || data.stepld

    if (!stepId) {
      throw new Error('Step ID is required')
    }

    // First, we need to get the task ID from the step
    const step = await this.client.taskStep.findUnique({
      where: { id: stepId },
      include: { Task: true },
    })

    if (!step) {
      throw new Error(`Step not found: ${stepId}`)
    }

    // Determine the type from the step or task
    const type = (step.type || step.Task.type || TaskType.Focused) as TaskType

    // Transform the data
    const workSessionData = {
      taskId: step.taskId,
      stepId: step.id,
      type: type,
      startTime: data.startTime || new Date(),
      endTime: data.endTime || null,
      plannedMinutes: data.duration || data.plannedMinutes || 0,
      actualMinutes: data.actualMinutes || data.duration || null,
      notes: data.notes || null,
    }


    const result = await this.createWorkSession(workSessionData)

    // Recalculate actualDuration after creating session
    await this.recalculateStepActualDuration(step.id)

    return result
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

  async updateWorkSessionTypesForStep(stepId: string, newType: TaskType): Promise<void> {
    await this.client.workSession.updateMany({
      where: { stepId },
      data: { type: newType },
    })
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
export const getDatabase = (): DatabaseService => DatabaseService.getInstance()
