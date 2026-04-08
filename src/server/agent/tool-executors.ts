/**
 * Agent Tool Executors
 *
 * Maps tool names to tRPC router calls via appRouter.createCaller().
 * Each executor validates input shape, calls the appropriate router
 * procedure, and returns a JSON-serializable result.
 *
 * The caller is created once per agent session with the same auth
 * context as the original HTTP request, so all session scoping and
 * authorization is preserved.
 */

import { appRouter } from '../router'
import type { Context } from '../trpc'
import { READ_TOOL_NAMES, WRITE_TOOL_NAMES } from './tool-definitions'
import { generateUniqueId } from '../../shared/step-id-utils'
import { EndeavorStatus, DeadlineType } from '../../shared/enums'
import { logger } from '../../logger'

export interface ToolExecutionResult {
  success: boolean
  data?: unknown
  error?: string
}

type RouterCaller = ReturnType<typeof appRouter.createCaller>

/**
 * Creates a tool executor bound to a specific tRPC context.
 * The executor can call any tRPC router procedure with the
 * same authentication and session as the original request.
 */
export function createToolExecutor(ctx: Context): ToolExecutor {
  const caller = appRouter.createCaller(ctx)
  return new ToolExecutor(caller)
}

export class ToolExecutor {
  constructor(private readonly caller: RouterCaller) {}

  /**
   * Execute a tool by name with the given input.
   * Routes to the appropriate tRPC procedure.
   */
  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    try {
      if (READ_TOOL_NAMES.has(toolName)) {
        return await this.executeReadTool(toolName, input)
      }
      if (WRITE_TOOL_NAMES.has(toolName)) {
        return await this.executeWriteTool(toolName, input)
      }
      return { success: false, error: `Unknown tool: ${toolName}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.system.error('Tool execution failed', {
        toolName,
        error: message,
      }, 'agent-tool-error')
      return { success: false, error: message }
    }
  }

  // ============================================================================
  // Read Tool Executors
  // ============================================================================

  private async executeReadTool(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'get_tasks': {
        const includeArchived = input.includeArchived as boolean | undefined
        const data = await this.caller.task.getAll({ includeArchived })
        return { success: true, data: this.summarizeTasks(data) }
      }

      case 'get_task_detail': {
        const data = await this.caller.task.getById({ id: input.id as string })
        return { success: true, data }
      }

      case 'get_schedule_for_date': {
        const data = await this.caller.workPattern.getByDate({ date: input.date as string })
        return { success: true, data }
      }

      case 'get_work_sessions': {
        const data = await this.caller.workSession.getByDate({ date: input.date as string })
        return { success: true, data }
      }

      case 'get_active_work_session': {
        const data = await this.caller.workSession.getActive()
        return { success: true, data }
      }

      case 'get_next_scheduled': {
        const skipIndex = input.skipIndex as number | undefined
        const data = await this.caller.task.getNextScheduled({ skipIndex })
        return { success: true, data }
      }

      case 'get_endeavors': {
        const data = await this.caller.endeavor.getAll({
          status: input.status as EndeavorStatus | undefined,
          includeArchived: input.includeArchived as boolean | undefined,
        })
        return { success: true, data }
      }

      case 'get_task_types': {
        const data = await this.caller.userTaskType.getAll()
        return { success: true, data }
      }

      case 'get_time_summary': {
        const data = await this.caller.workSession.getAccumulatedByDate({
          date: input.date as string,
        })
        return { success: true, data }
      }

      default:
        return { success: false, error: `Unknown read tool: ${toolName}` }
    }
  }

  // ============================================================================
  // Write Tool Executors
  // ============================================================================

  private async executeWriteTool(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'create_task': {
        const data = await this.caller.task.create({
          name: input.name as string,
          duration: input.duration as number,
          importance: input.importance as number,
          urgency: input.urgency as number,
          type: input.type as string,
          notes: (input.notes as string) ?? null,
          deadline: input.deadline ? new Date(input.deadline as string) : null,
          deadlineType: (input.deadlineType as 'hard' | 'soft') ?? null,
          cognitiveComplexity: (input.cognitiveComplexity as number) ?? null,
        })
        return { success: true, data }
      }

      case 'update_task': {
        const updateData: Record<string, unknown> = { id: input.id as string }
        // Only include fields that were provided
        if (input.name !== undefined) updateData.name = input.name
        if (input.duration !== undefined) updateData.duration = input.duration
        if (input.importance !== undefined) updateData.importance = input.importance
        if (input.urgency !== undefined) updateData.urgency = input.urgency
        if (input.type !== undefined) updateData.type = input.type
        if (input.notes !== undefined) updateData.notes = input.notes
        if (input.deadline !== undefined) {
          updateData.deadline = input.deadline ? new Date(input.deadline as string) : null
        }
        if (input.deadlineType !== undefined) updateData.deadlineType = input.deadlineType
        if (input.cognitiveComplexity !== undefined) updateData.cognitiveComplexity = input.cognitiveComplexity
        if (input.overallStatus !== undefined) updateData.overallStatus = input.overallStatus

        const data = await this.caller.task.update(updateData as Parameters<RouterCaller['task']['update']>[0])
        return { success: true, data }
      }

      case 'complete_task': {
        const data = await this.caller.task.complete({
          id: input.id as string,
          actualDuration: input.actualDuration as number | undefined,
        })
        return { success: true, data }
      }

      case 'archive_task': {
        const data = await this.caller.task.archive({ id: input.id as string })
        return { success: true, data }
      }

      case 'create_workflow': {
        const steps = (input.steps as Array<Record<string, unknown>>).map(step => ({
          id: generateUniqueId('step'),
          name: step.name as string,
          duration: step.duration as number,
          type: step.type as string,
          dependsOn: (step.dependsOn as string[]) ?? [],
          asyncWaitTime: (step.asyncWaitTime as number) ?? 0,
        }))

        const data = await this.caller.task.create({
          name: input.name as string,
          duration: steps.reduce((sum, s) => sum + s.duration, 0),
          importance: input.importance as number,
          urgency: input.urgency as number,
          type: input.type as string,
          notes: (input.notes as string) ?? null,
          hasSteps: true,
          steps,
        })
        return { success: true, data }
      }

      case 'add_workflow_step': {
        const data = await this.caller.workflow.addStep({
          workflowId: input.workflowId as string,
          name: input.name as string,
          duration: input.duration as number,
          type: input.type as string,
          afterStep: input.afterStep as string | undefined,
          beforeStep: input.beforeStep as string | undefined,
          dependencies: input.dependencies as string[] | undefined,
          asyncWaitTime: (input.asyncWaitTime as number) ?? 0,
        })
        return { success: true, data }
      }

      case 'log_work_session': {
        const data = await this.caller.workSession.create({
          taskId: input.taskId as string,
          stepId: (input.stepId as string) ?? null,
          startTime: new Date(input.startTime as string),
          endTime: input.endTime ? new Date(input.endTime as string) : null,
          actualMinutes: (input.actualMinutes as number) ?? null,
          notes: (input.notes as string) ?? null,
        })
        return { success: true, data }
      }

      case 'create_schedule': {
        const data = await this.caller.workPattern.create({
          date: input.date as string,
          blocks: input.blocks as Parameters<RouterCaller['workPattern']['create']>[0]['blocks'],
          meetings: input.meetings as Parameters<RouterCaller['workPattern']['create']>[0]['meetings'],
        })
        return { success: true, data }
      }

      case 'create_endeavor': {
        const data = await this.caller.endeavor.create({
          name: input.name as string,
          description: input.description as string | undefined,
          importance: (input.importance as number) ?? 5,
          urgency: (input.urgency as number) ?? 5,
          deadline: input.deadline ? new Date(input.deadline as string) : undefined,
          deadlineType: input.deadlineType as DeadlineType | undefined,
          color: input.color as string | undefined,
        })
        return { success: true, data }
      }

      case 'link_task_to_endeavor': {
        const data = await this.caller.endeavor.addItem({
          endeavorId: input.endeavorId as string,
          taskId: input.taskId as string,
        })
        return { success: true, data }
      }

      case 'manage_sprint': {
        const data = await this.caller.task.update({
          id: input.taskId as string,
          inActiveSprint: input.inActiveSprint as boolean,
        })
        return { success: true, data }
      }

      case 'create_task_type': {
        const data = await this.caller.userTaskType.create({
          name: input.name as string,
          emoji: input.emoji as string,
          color: input.color as string,
        })
        return { success: true, data }
      }

      default:
        return { success: false, error: `Unknown write tool: ${toolName}` }
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Summarize tasks to reduce token count in Claude's context.
   * Full details can be fetched with get_task_detail.
   */
  private summarizeTasks(tasks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return tasks.map(task => ({
      id: task.id,
      name: task.name,
      type: task.type,
      duration: task.duration,
      importance: task.importance,
      urgency: task.urgency,
      completed: task.completed,
      overallStatus: task.overallStatus,
      hasSteps: task.hasSteps,
      stepCount: Array.isArray(task.steps) ? task.steps.length : 0,
      inActiveSprint: task.inActiveSprint,
      deadline: task.deadline,
      deadlineType: task.deadlineType,
      archived: task.archived,
      notes: task.notes ? (task.notes as string).substring(0, 100) : null,
    }))
  }
}
