/**
 * Search utilities for tasks and workflows
 * Provides case-insensitive keyword search across task/workflow fields
 */

import { Task, TaskStep } from './types'
import { SequencedTask } from './sequencing-types'

/**
 * Result of searching a task or workflow
 */
export interface TaskSearchResult {
  task: Task
  matchedFields: TaskMatchField[]
  matchedStepIds: string[] // For workflows: IDs of steps that matched
}

/**
 * Fields that can match in a search
 */
export enum TaskMatchField {
  Name = 'name',
  Notes = 'notes',
  StepName = 'stepName',
  StepNotes = 'stepNotes',
}

/**
 * Result of searching within a workflow's steps
 */
export interface StepSearchResult {
  step: TaskStep
  matchedFields: StepMatchField[]
}

/**
 * Fields that can match in a step search
 */
export enum StepMatchField {
  Name = 'name',
  Notes = 'notes',
}

/**
 * Checks if a string contains the search query (case-insensitive)
 * @param text - The text to search in
 * @param query - The search query
 * @returns True if the text contains the query
 */
function containsQuery(text: string | undefined | null, query: string): boolean {
  if (!text || !query) return false
  return text.toLowerCase().includes(query.toLowerCase().trim())
}

/**
 * Searches a single task for matching fields
 * @param task - The task to search
 * @param query - The search query
 * @returns TaskSearchResult if task matches, null otherwise
 */
export function searchTask(task: Task, query: string): TaskSearchResult | null {
  if (!query.trim()) return null

  const matchedFields: TaskMatchField[] = []
  const matchedStepIds: string[] = []

  // Search task name
  if (containsQuery(task.name, query)) {
    matchedFields.push(TaskMatchField.Name)
  }

  // Search task notes
  if (containsQuery(task.notes, query)) {
    matchedFields.push(TaskMatchField.Notes)
  }

  // Search workflow steps if this is a workflow
  if (task.hasSteps && task.steps) {
    for (const step of task.steps) {
      const stepMatched = searchStep(step, query)
      if (stepMatched) {
        matchedStepIds.push(step.id)
        // Add step match fields to task match fields (deduplicated)
        if (stepMatched.matchedFields.includes(StepMatchField.Name) &&
            !matchedFields.includes(TaskMatchField.StepName)) {
          matchedFields.push(TaskMatchField.StepName)
        }
        if (stepMatched.matchedFields.includes(StepMatchField.Notes) &&
            !matchedFields.includes(TaskMatchField.StepNotes)) {
          matchedFields.push(TaskMatchField.StepNotes)
        }
      }
    }
  }

  // Return result only if something matched
  if (matchedFields.length > 0 || matchedStepIds.length > 0) {
    return {
      task,
      matchedFields,
      matchedStepIds,
    }
  }

  return null
}

/**
 * Searches a single step for matching fields
 * @param step - The step to search
 * @param query - The search query
 * @returns StepSearchResult if step matches, null otherwise
 */
export function searchStep(step: TaskStep, query: string): StepSearchResult | null {
  if (!query.trim()) return null

  const matchedFields: StepMatchField[] = []

  // Search step name
  if (containsQuery(step.name, query)) {
    matchedFields.push(StepMatchField.Name)
  }

  // Search step notes
  if (containsQuery(step.notes, query)) {
    matchedFields.push(StepMatchField.Notes)
  }

  if (matchedFields.length > 0) {
    return {
      step,
      matchedFields,
    }
  }

  return null
}

/**
 * Searches an array of tasks for matching items
 * @param tasks - The tasks to search
 * @param query - The search query
 * @returns Array of TaskSearchResult for matching tasks
 */
export function searchTasks(tasks: Task[], query: string): TaskSearchResult[] {
  if (!query.trim()) return []

  const results: TaskSearchResult[] = []

  for (const task of tasks) {
    const result = searchTask(task, query)
    if (result) {
      results.push(result)
    }
  }

  return results
}

/**
 * Searches workflow steps for matching items
 * @param workflow - The workflow (SequencedTask) to search
 * @param query - The search query
 * @returns Array of StepSearchResult for matching steps
 */
export function searchWorkflowSteps(workflow: SequencedTask, query: string): StepSearchResult[] {
  if (!query.trim() || !workflow.steps) return []

  const results: StepSearchResult[] = []

  for (const step of workflow.steps) {
    const result = searchStep(step, query)
    if (result) {
      results.push(result)
    }
  }

  return results
}

/**
 * Filters tasks based on search query, returning only matching tasks
 * Simpler alternative to searchTasks when you just need the filtered list
 * @param tasks - The tasks to filter
 * @param query - The search query
 * @returns Filtered array of tasks that match the query
 */
export function filterTasksBySearch(tasks: Task[], query: string): Task[] {
  if (!query.trim()) return tasks

  return tasks.filter(task => searchTask(task, query) !== null)
}

/**
 * Gets the matched step IDs for a task given a search query
 * Useful for highlighting matching steps in UI
 * @param task - The task (should have steps if workflow)
 * @param query - The search query
 * @returns Array of step IDs that match, empty if no matches or not a workflow
 */
export function getMatchedStepIds(task: Task, query: string): string[] {
  if (!query.trim() || !task.hasSteps || !task.steps) return []

  const result = searchTask(task, query)
  return result?.matchedStepIds ?? []
}

/**
 * Checks if a task matches a search query (simple boolean check)
 * @param task - The task to check
 * @param query - The search query
 * @returns True if task matches the query
 */
export function taskMatchesSearch(task: Task, query: string): boolean {
  if (!query.trim()) return true // Empty query matches all
  return searchTask(task, query) !== null
}

/**
 * Checks if a step matches a search query (simple boolean check)
 * @param step - The step to check
 * @param query - The search query
 * @returns True if step matches the query
 */
export function stepMatchesSearch(step: TaskStep, query: string): boolean {
  if (!query.trim()) return true // Empty query matches all
  return searchStep(step, query) !== null
}
