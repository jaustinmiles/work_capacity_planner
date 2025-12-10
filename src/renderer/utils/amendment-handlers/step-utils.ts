/**
 * Step lookup utilities for amendment handlers
 * Provides exact matching (case-insensitive) for workflow steps
 *
 * IMPORTANT: Steps within a workflow should have unique names.
 * We use exact matching only - no fuzzy/partial matching.
 */

import type { TaskStep } from '@shared/types'

/**
 * Find a step by exact name match (case-insensitive, trimmed).
 *
 * @param steps - Array of workflow steps to search
 * @param stepName - The step name to find
 * @returns The matching step or undefined if not found
 */
export function findStepByName(
  steps: TaskStep[],
  stepName: string,
): TaskStep | undefined {
  const normalized = stepName.toLowerCase().trim()
  return steps.find(s => s.name.toLowerCase().trim() === normalized)
}

/**
 * Find step index by exact name match (case-insensitive, trimmed).
 *
 * @param steps - Array of workflow steps to search
 * @param stepName - The step name to find
 * @returns The index of the matching step or -1 if not found
 */
export function findStepIndexByName(
  steps: TaskStep[],
  stepName: string,
): number {
  const normalized = stepName.toLowerCase().trim()
  return steps.findIndex(s => s.name.toLowerCase().trim() === normalized)
}
