/**
 * Conversion utilities for UnifiedScheduler
 *
 * This module handles the critical conversion of various task types
 * into the unified format used by the scheduler.
 *
 * IMPORTANT: These conversions are critical for data integrity.
 * Any changes should be thoroughly tested as errors here can
 * corrupt scheduling data.
 */

import { Task, TaskStep } from './types'
import { SequencedTask } from './sequencing-types'
import { UnifiedScheduleItem } from './unified-scheduler'
import { StepStatus, UnifiedScheduleItemType } from './enums'

/**
 * Special marker for tasks without explicit type.
 * Used for strict type enforcement - untyped tasks should not silently
 * match any block. They require explicit handling.
 *
 * Tasks should ALWAYS have a type assigned. This marker indicates
 * a data validation issue that should be addressed upstream.
 */
export const UNTYPED_TASK_MARKER = '__UNTYPED__'

/**
 * Convert various input types to UnifiedScheduleItem format
 *
 * This function is responsible for:
 * - Converting Tasks, SequencedTasks, and TaskSteps to unified format
 * - Tracking completed vs active items
 * - Preventing duplicate processing
 * - Preserving all relevant metadata
 *
 * @param items Array of items to convert
 * @returns Object containing active items and set of completed item IDs
 */
export function convertToUnifiedItems(
  items: (Task | SequencedTask | TaskStep)[],
): {
  activeItems: UnifiedScheduleItem[]
  completedItemIds: Set<string>
} {
  const unified: UnifiedScheduleItem[] = []
  const completedItemIds = new Set<string>()
  const processedItemIds = new Set<string>() // Prevent duplicates

  for (const item of items) {
    // Handle SequencedTask (workflow with steps)
    if ('steps' in item && item.steps) {
      const workflow = item as SequencedTask
      const beforeCount = unified.length

      processSequencedTask(
        workflow,
        unified,
        completedItemIds,
        processedItemIds,
      )

      const afterCount = unified.length
      const stepsAdded = afterCount - beforeCount

      if (stepsAdded === 0 && !workflow.completed) {
        // Workflow has no active steps but isn't marked completed
        // This might indicate all steps are completed/waiting - potential issue
        console.log('[scheduler-converters] Workflow has no active steps:', {
          name: workflow.name,
          id: workflow.id,
          completed: workflow.completed,
          steps: workflow.steps.map(s => ({ id: s.id, status: s.status })),
        })
      }
    } else {
      // Handle regular Task or TaskStep
      processTaskOrStep(
        item,
        unified,
        completedItemIds,
        processedItemIds,
      )
    }
  }

  console.log('[scheduler-converters] Conversion complete:', {
    inputItems: items.length,
    activeItems: unified.length,
    completed: completedItemIds.size,
    activeItemsNames: unified.map(i => i.name),
  })

  return {
    activeItems: unified,
    completedItemIds,
  }
}

/**
 * Process a SequencedTask (workflow) and convert its steps
 */
function processSequencedTask(
  sequencedTask: SequencedTask,
  unified: UnifiedScheduleItem[],
  completedItemIds: Set<string>,
  processedItemIds: Set<string>,
): void {
  sequencedTask.steps.forEach((step, index) => {
    // Skip if already processed (deduplication)
    if (processedItemIds.has(step.id)) {
      return
    }
    processedItemIds.add(step.id)

    // Steps that are completed OR waiting (async work happening externally)
    // are considered complete for dependency purposes
    const isCompleted = step.status === StepStatus.Completed
    const isWaiting = step.status === StepStatus.Waiting
    const isDone = isCompleted || isWaiting

    const unifiedItem: UnifiedScheduleItem = {
      // Core identification
      id: step.id,
      name: step.name,
      type: UnifiedScheduleItemType.WorkflowStep,

      // Duration and priority
      duration: step.duration,
      priority: 0, // Will be calculated by scheduler

      // Importance and urgency (with defaults)
      importance: step.importance ?? sequencedTask.importance ?? 5,
      urgency: step.urgency ?? sequencedTask.urgency ?? 5,

      // Complexity
      cognitiveComplexity: step.cognitiveComplexity || 3,

      // Task type ID (references UserTaskType)
      taskTypeId: step.type || '',

      // Dependencies
      dependencies: step.dependsOn || [],
      asyncWaitTime: step.asyncWaitTime,

      // Status
      completed: isDone,

      // Workflow metadata
      workflowId: sequencedTask.id,
      workflowName: sequencedTask.name,
      stepIndex: index,

      // Original reference
      originalItem: step,
    }

    // Add deadline from parent workflow if present
    if (sequencedTask.deadline) {
      unifiedItem.deadline = sequencedTask.deadline
    }
    if (sequencedTask.deadlineType) {
      unifiedItem.deadlineType = sequencedTask.deadlineType
    }

    // Add to appropriate collection
    // Completed and waiting steps go in completedItemIds (unblock dependents)
    // But only truly completed steps are excluded from scheduling
    if (isDone) {
      completedItemIds.add(step.id)
      // Only add to unified array if not fully completed (still waiting)
      if (isWaiting) {
        // Mark it so UI knows not to allow starting it
        unifiedItem.isWaitingOnAsync = true
        // Pass the completion time so scheduler knows when wait started
        if (step.completedAt) {
          unifiedItem.completedAt = step.completedAt
        }
        unified.push(unifiedItem)
      }
    } else {
      unified.push(unifiedItem)
    }
  })
}

/**
 * Process a regular Task or TaskStep
 */
function processTaskOrStep(
  item: Task | TaskStep,
  unified: UnifiedScheduleItem[],
  completedItemIds: Set<string>,
  processedItemIds: Set<string>,
): void {
  // Skip if already processed (deduplication)
  if (processedItemIds.has(item.id)) {
    return
  }
  processedItemIds.add(item.id)

  // Determine if item is completed
  const isCompleted = isItemCompleted(item)

  // Extract deadline information
  const deadline = 'deadline' in item ? item.deadline : undefined
  const deadlineType = 'deadlineType' in item ? item.deadlineType : undefined

  // Extract workflow ID if this is a step
  const workflowId = 'taskId' in item ? item.taskId : undefined

  // Determine item type
  const itemType = determineItemType(item)

  // Determine task type ID (references UserTaskType)
  const taskTypeId = extractTaskType(item)

  const unifiedItem: UnifiedScheduleItem = {
    // Core identification
    id: item.id,
    name: item.name,
    type: itemType,

    // Duration and priority
    duration: item.duration,
    priority: 0, // Will be calculated by scheduler

    // Importance and urgency (with defaults)
    importance: item.importance ?? 5,
    urgency: item.urgency ?? 5,

    // Complexity
    cognitiveComplexity: item.cognitiveComplexity || 3,

    // Task type ID (references UserTaskType)
    taskTypeId,

    // Dependencies
    dependencies: extractDependencies(item),
    asyncWaitTime: item.asyncWaitTime,

    // Status
    completed: isCompleted,

    // Original reference
    originalItem: item,
  }

  // Add optional fields only if defined
  if (deadline) {
    unifiedItem.deadline = deadline
  }
  if (deadlineType) {
    unifiedItem.deadlineType = deadlineType
  }
  if (workflowId) {
    unifiedItem.workflowId = workflowId
  }

  // Add to appropriate collection
  if (isCompleted) {
    completedItemIds.add(item.id)
  } else {
    unified.push(unifiedItem)
  }
}

/**
 * Determine if an item is completed
 */
function isItemCompleted(item: Task | TaskStep): boolean {
  // Check for completed property (Task)
  if ('completed' in item && item.completed) {
    return true
  }

  // Check for status property (TaskStep)
  if ('status' in item) {
    // Both completed and waiting statuses mean the step doesn't need scheduling
    return item.status === 'completed' || item.status === 'waiting'
  }

  return false
}

/**
 * Determine the type of item for unified format
 */
function determineItemType(item: Task | TaskStep): UnifiedScheduleItemType {
  // If it has a taskId, it's a workflow step
  if ('taskId' in item) {
    return UnifiedScheduleItemType.WorkflowStep
  }

  return UnifiedScheduleItemType.Task
}

/**
 * Extract task type from various formats
 * Returns user-defined task type ID (string)
 *
 * If no type is found, returns UNTYPED_TASK_MARKER to ensure
 * strict type enforcement. Tasks should always have a type assigned.
 */
function extractTaskType(item: Task | TaskStep): string {
  // TaskStep has taskType property
  if ('taskType' in item && item.taskType) {
    return item.taskType as string
  }

  // Task has type property
  if ('type' in item && item.type) {
    return item.type as string
  }

  // Return explicit marker for untyped tasks - NOT empty string
  // This ensures untyped tasks are handled explicitly, not silently ignored
  return UNTYPED_TASK_MARKER
}

/**
 * Extract dependencies from various formats
 */
function extractDependencies(item: Task | TaskStep): string[] {
  // Check for dependencies property
  if ('dependencies' in item && item.dependencies) {
    return item.dependencies
  }

  // Check for dependsOn property
  if ('dependsOn' in item && item.dependsOn) {
    return item.dependsOn
  }

  return []
}

/**
 * Validate converted items for data integrity
 * Throws errors if critical data is missing or invalid
 */
export function validateConvertedItems(
  items: UnifiedScheduleItem[],
): void {
  const seenIds = new Set<string>()

  for (const item of items) {
    // Check for duplicate IDs
    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate item ID detected: ${item.id}`)
    }
    seenIds.add(item.id)

    // Validate required fields
    if (!item.id) {
      throw new Error('Item missing required ID')
    }
    if (!item.name) {
      throw new Error(`Item ${item.id} missing required name`)
    }
    if (item.duration === null || item.duration === undefined || item.duration < 0) {
      throw new Error(`Item ${item.id} has invalid duration: ${item.duration}`)
    }
    if (!item.type) {
      throw new Error(`Item ${item.id} missing required type`)
    }
    // taskType is required but may be undefined during conversion
    // The converter sets a default value if not present

    // Note: Dependencies might reference completed items not in this list
    // This is valid, so we don't validate them here

    // Validate numeric fields are in valid ranges
    if (item.importance !== null && item.importance !== undefined && (item.importance < 1 || item.importance > 10)) {
      throw new Error(`Item ${item.id} has invalid importance: ${item.importance}`)
    }
    if (item.urgency !== null && item.urgency !== undefined && (item.urgency < 1 || item.urgency > 10)) {
      throw new Error(`Item ${item.id} has invalid urgency: ${item.urgency}`)
    }
    if (item.cognitiveComplexity !== null && item.cognitiveComplexity !== undefined &&
        (item.cognitiveComplexity < 1 || item.cognitiveComplexity > 5)) {
      throw new Error(`Item ${item.id} has invalid cognitive complexity: ${item.cognitiveComplexity}`)
    }
  }
}
