/**
 * Utility functions for managing brainstorm results
 * Extracted for testability and reusability
 */

interface BrainstormResult {
  summary: string
  tasks?: ExtractedTask[]
  workflows?: ExtractedWorkflow[]
  standaloneTasks?: ExtractedTask[]
}

interface ExtractedTask {
  name: string
  description: string
  estimatedDuration: number
  importance: number
  urgency: number
  type: string
  needsMoreInfo?: boolean
  clarificationRequest?: string
  userClarification?: string
}

interface ExtractedWorkflow {
  name: string
  description: string
  importance: number
  urgency: number
  type: string
  steps: any[]
  duration?: number
  totalDuration: number
  earliestCompletion: string
  worstCaseCompletion: string
  notes: string
  clarificationRequest?: string
  userClarification?: string
}

/**
 * Deletes a workflow at the specified index from the brainstorm result
 * @param result - The current brainstorm result
 * @param index - The index of the workflow to delete
 * @returns A new brainstorm result with the workflow removed
 */
export function deleteWorkflow(result: BrainstormResult | null, index: number): BrainstormResult | null {
  if (!result || !result.workflows) return result

  const newResult = { ...result }
  if (newResult.workflows) {
    newResult.workflows = newResult.workflows.filter((_w, i) => i !== index)
  }
  return newResult
}

/**
 * Deletes a task at the specified index from the brainstorm result
 * @param result - The current brainstorm result
 * @param index - The index of the task to delete
 * @returns A new brainstorm result with the task removed
 */
export function deleteTask(result: BrainstormResult | null, index: number): BrainstormResult | null {
  if (!result || !result.tasks) return result

  const newResult = { ...result }
  if (newResult.tasks) {
    newResult.tasks = newResult.tasks.filter((_t, i) => i !== index)
  }
  return newResult
}

/**
 * Deletes a step at the specified index from a workflow in the brainstorm result
 * Also recalculates the workflow's total duration
 * @param result - The current brainstorm result
 * @param workflowIndex - The index of the workflow containing the step
 * @param stepIndex - The index of the step to delete
 * @returns A new brainstorm result with the step removed and duration recalculated
 */
export function deleteStep(
  result: BrainstormResult | null,
  workflowIndex: number,
  stepIndex: number,
): BrainstormResult | null {
  if (!result || !result.workflows) return result

  const newResult = { ...result }
  if (newResult.workflows && newResult.workflows[workflowIndex]) {
    const workflow = newResult.workflows[workflowIndex]
    if (workflow && workflow.steps) {
      // Filter out the step at the specified index
      const newSteps = workflow.steps.filter((_s, i) => i !== stepIndex)

      // Recalculate total duration based on remaining steps
      const totalDuration = newSteps.reduce(
        (sum, step: any) => sum + step.duration + (step.asyncWaitTime || 0),
        0,
      )

      // Update the workflow with new steps and duration
      newResult.workflows[workflowIndex] = {
        ...workflow,
        steps: newSteps,
        totalDuration,
      }
    }
  }
  return newResult
}
