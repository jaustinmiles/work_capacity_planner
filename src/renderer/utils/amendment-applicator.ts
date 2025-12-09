/**
 * Applies amendments to tasks and workflows
 */

import {
  Amendment,
  AmendmentType,
  EntityType,
  TaskStatus,
  StatusUpdate,
  TimeLog,
  NoteAddition,
  DurationChange,
  StepAddition,
  StepRemoval,
  TaskCreation,
  WorkflowCreation,
  DependencyChange,
  DeadlineChange,
  PriorityChange,
  TypeChange,
  ArchiveToggle,
  WorkPatternModification,
  WorkSessionEdit,
  TaskTypeCreation,
} from '@shared/amendment-types'
import { assertNever, BlockConfigKind, StepStatus, WorkBlockType, WorkPatternOperation, WorkSessionOperation } from '@shared/enums'
import { dateToYYYYMMDD, extractTimeFromISO } from '@shared/time-utils'
import { generateUniqueId, validateWorkflowDependencies } from '@shared/step-id-utils'
import { useWorkPatternStore } from '../store/useWorkPatternStore'
import { useUserTaskTypeStore } from '../store/useUserTaskTypeStore'
import { getDatabase } from '../services/database'
import { Message } from '../components/common/Message'
import { logger } from '@/logger'
import { useTaskStore } from '../store/useTaskStore'
import {
  applyForwardDependencyChanges,
  applyReverseDependencyChanges,
} from './dependency-utils'
import { resolveAmendmentTargets } from './target-resolver'

/**
 * Result for a single amendment application
 */
export interface AmendmentResult {
  amendment: Amendment
  success: boolean
  message: string
}

/**
 * Summary of all amendment applications
 */
export interface ApplyAmendmentsResult {
  successCount: number
  errorCount: number
  results: AmendmentResult[]
}

/**
 * Get a human-readable summary of an amendment for display
 */
function getAmendmentDescription(amendment: Amendment): string {
  switch (amendment.type) {
    case AmendmentType.TaskCreation:
      return `Create task "${amendment.name}"`
    case AmendmentType.WorkflowCreation:
      return `Create workflow "${amendment.name}" (${amendment.steps.length} steps)`
    case AmendmentType.StatusUpdate:
      return `Update ${amendment.target.name} → ${amendment.newStatus}`
    case AmendmentType.TimeLog:
      return `Log ${amendment.duration}min on ${amendment.target.name}`
    case AmendmentType.NoteAddition:
      return `Add note to ${amendment.target.name}`
    case AmendmentType.DurationChange:
      return `Change ${amendment.target.name} duration to ${amendment.newDuration}min`
    case AmendmentType.StepAddition:
      return `Add step "${amendment.stepName}" to ${amendment.workflowTarget.name}`
    case AmendmentType.StepRemoval:
      return `Remove step "${amendment.stepName}" from ${amendment.workflowTarget.name}`
    case AmendmentType.DependencyChange:
      return `Update dependencies for ${amendment.target.name}`
    case AmendmentType.DeadlineChange:
      return `Set deadline for ${amendment.target.name}`
    case AmendmentType.PriorityChange:
      return `Update priority for ${amendment.target.name}`
    case AmendmentType.TypeChange:
      return `Change ${amendment.target.name} type to ${amendment.newType}`
    case AmendmentType.WorkPatternModification: {
      const mod = amendment as WorkPatternModification
      // Show specific operation details for better user understanding
      if (mod.operation === WorkPatternOperation.AddBlock && mod.blockData) {
        const start = extractTimeFromISO(mod.blockData.startTime)
        const end = extractTimeFromISO(mod.blockData.endTime)
        return `Add ${mod.blockData.type} block ${start} - ${end}`
      }
      if (mod.operation === WorkPatternOperation.AddMeeting && mod.meetingData) {
        const start = extractTimeFromISO(mod.meetingData.startTime)
        const end = extractTimeFromISO(mod.meetingData.endTime)
        return `Add meeting "${mod.meetingData.name}" ${start} - ${end}`
      }
      if (mod.operation === WorkPatternOperation.RemoveBlock) {
        return 'Remove block'
      }
      if (mod.operation === WorkPatternOperation.RemoveMeeting) {
        return 'Remove meeting'
      }
      return `${mod.operation} work pattern`
    }
    case AmendmentType.WorkSessionEdit:
      return `${amendment.operation} work session`
    case AmendmentType.ArchiveToggle:
      return `${amendment.archive ? 'Archive' : 'Unarchive'} ${amendment.target.name}`
    case AmendmentType.QueryResponse:
      return 'Query response (no changes)'
    case AmendmentType.TaskTypeCreation:
      return `Create task type "${amendment.name}"`
  }
}

/**
 * Validate and resolve a task type ID against user-defined types.
 * Returns a valid type ID or empty string if not found.
 */
function resolveTaskType(requestedType: string | undefined): string {
  if (!requestedType) return ''

  const userTypes = useUserTaskTypeStore.getState().types
  const matchedType = userTypes.find(t =>
    t.id === requestedType ||
    t.name.toLowerCase() === requestedType.toLowerCase(),
  )

  if (matchedType) {
    return matchedType.id
  }

  // Log warning if type not found
  if (requestedType) {
    logger.ui.warn('Task type not found in user-defined types', {
      requestedType,
      availableTypes: userTypes.map(t => ({ id: t.id, name: t.name })),
    }, 'task-type-resolution')
  }

  return ''
}

export async function applyAmendments(amendments: Amendment[]): Promise<ApplyAmendmentsResult> {
  const db = getDatabase()

  // CRITICAL: Resolve target names to IDs before processing
  // The AI generates amendments with target names but no IDs
  logger.ui.info('Resolving amendment targets', {
    amendmentCount: amendments.length,
    types: amendments.map(a => a.type),
  }, 'target-resolution-start')
  await resolveAmendmentTargets(amendments, db)

  let successCount = 0
  let errorCount = 0
  const results: AmendmentResult[] = []

  /**
   * Helper to record a failed amendment
   */
  function recordError(amendment: Amendment, message: string): void {
    errorCount++
    results.push({ amendment, success: false, message })
  }

  // Track the current amendment's success/error status
  let currentAmendmentFailed = false
  let currentAmendmentError = ''

  /**
   * Mark current amendment as failed (called from existing error paths)
   */
  function markFailed(error: string): void {
    currentAmendmentFailed = true
    currentAmendmentError = error
  }

    // totalAmendments: amendments.length,
    // amendmentTypes: amendments.map(a => a.type),
    // stepAdditions: amendments.filter(a => a.type === AmendmentType.StepAddition).map(a => {
      // const sa = a as StepAddition
      // return {
        // workflowName: sa.workflowTarget.name,
        // stepName: sa.stepName,
        // afterStep: sa.afterStep,
        // beforeStep: sa.beforeStep,
        // dependencies: sa.dependencies,
      // }
    // }),
    // stackTrace: new Error().stack?.split('\n').slice(1, 5).join('\n'),
  // })

  // Track newly created task IDs to resolve placeholders
  const createdTaskMap = new Map<string, string>() // placeholder -> actual ID

  for (const amendment of amendments) {
    // Reset tracking for this amendment
    currentAmendmentFailed = false
    currentAmendmentError = ''
    const amendmentDesc = getAmendmentDescription(amendment)
    // Track original counts to detect if this amendment changed them
    const prevSuccessCount = successCount
    const prevErrorCount = errorCount

    try {
      switch (amendment.type) {
        case AmendmentType.StatusUpdate: {
          const update = amendment as StatusUpdate
          if (update.target.id) {
            if (update.stepName) {
              // Update workflow step status
              // Find the step in the workflow
              const workflow = await db.getSequencedTaskById(update.target.id)
              if (workflow && workflow.steps) {
                const step = workflow.steps.find(s =>
                  s.name.toLowerCase().includes(update.stepName!.toLowerCase()) ||
                  update.stepName!.toLowerCase().includes(s.name.toLowerCase()),
                )
                if (step) {
                  await db.updateTaskStepProgress(step.id, {
                    status: update.newStatus,
                  })
                  successCount++
                } else {
                  markFailed(`Step "${update.stepName}" not found in workflow "${workflow.name}"`)
                  errorCount++
                }
              } else {
                markFailed(`Workflow not found or has no steps for target "${update.target.name}"`)
                errorCount++
              }
            } else if (update.target.type === EntityType.Workflow) {
              // Update workflow status
              await db.updateSequencedTask(update.target.id, {
                overallStatus: update.newStatus,
              })
              successCount++
            } else {
              // Update task status
              await db.updateTask(update.target.id, {
                completed: update.newStatus === TaskStatus.Completed,
                overallStatus: update.newStatus,
              })
              successCount++
            }
          } else {
            markFailed(`Cannot update "${update.target.name}" - target not found in database`)
            errorCount++
          }
          break
        }

        case AmendmentType.TimeLog: {
          const log = amendment as TimeLog
          if (log.target.id) {
            if (log.stepName) {
              // Log time for workflow step
              const workflow = await db.getSequencedTaskById(log.target.id)
              if (workflow && workflow.steps) {
                const step = workflow.steps.find(s =>
                  s.name.toLowerCase().includes(log.stepName!.toLowerCase()) ||
                  log.stepName!.toLowerCase().includes(s.name.toLowerCase()),
                )
                if (step) {
                  // Create work session for the step
                  await db.createWorkSession({
                    stepId: step.id,
                    taskId: workflow.id,
                    date: log.date || new Date(),
                    plannedMinutes: step.duration,
                    actualMinutes: log.duration,
                    description: log.description || `Time logged for step: ${step.name}`,
                    type: step.type as any,
                  })
                  successCount++
                } else {
                  markFailed(`Step "${log.stepName}" not found in workflow "${workflow.name}"`)
                  errorCount++
                }
              } else {
                markFailed(`Workflow not found or has no steps for target "${log.target.name}"`)
                errorCount++
              }
            } else {
              // Log time for task - look up task's type from database
              const task = await db.getTaskById(log.target.id)
              await db.createWorkSession({
                taskId: log.target.id,
                date: log.date ? log.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                plannedMinutes: log.duration,
                actualMinutes: log.duration,
                type: task?.type || '',
              })
              successCount++
            }
          } else {
            markFailed(`Cannot log time for "${log.target.name}" - target not found in database`)
            errorCount++
          }
          break
        }

        case AmendmentType.NoteAddition: {
          const note = amendment as NoteAddition
          if (note.target.id) {
            if (note.stepName) {
              // Add note to workflow step
              const workflow = await db.getSequencedTaskById(note.target.id)
              if (workflow && workflow.steps) {
                const step = workflow.steps.find(s =>
                  s.name.toLowerCase().includes(note.stepName!.toLowerCase()) ||
                  note.stepName!.toLowerCase().includes(s.name.toLowerCase()),
                )
                if (step) {
                  const currentNotes = step.notes || ''
                  const newNotes = note.append
                    ? currentNotes + (currentNotes ? '\n' : '') + note.note
                    : note.note

                  // Update the step with new notes
                  await db.updateTaskStepProgress(step.id, {
                    notes: newNotes,
                  })
                  successCount++
                } else {
                  markFailed(`Step "${note.stepName}" not found in workflow "${workflow.name}"`)
                  errorCount++
                }
              } else {
                markFailed(`Workflow not found or has no steps for target "${note.target.name}"`)
                errorCount++
              }
            } else if (note.target.type === EntityType.Workflow) {
              // Add note to workflow
              const workflow = await db.getSequencedTaskById(note.target.id)
              if (workflow) {
                const currentNotes = workflow.notes || ''
                const newNotes = note.append
                  ? currentNotes + (currentNotes ? '\n' : '') + note.note
                  : note.note
                await db.updateSequencedTask(note.target.id, { notes: newNotes })
                successCount++
              }
            } else {
              // Add note to task
              const task = await db.getTaskById(note.target.id)
              if (task) {
                const currentNotes = task.notes || ''
                const newNotes = note.append
                  ? currentNotes + (currentNotes ? '\n' : '') + note.note
                  : note.note
                await db.updateTask(note.target.id, { notes: newNotes })
                successCount++
              }
            }
          } else {
            markFailed(`Cannot add note to "${note.target.name}" - target not found in database`)
            errorCount++
          }
          break
        }

        case AmendmentType.DurationChange: {
          const change = amendment as DurationChange
          if (change.target.id) {
            if (change.stepName) {
              // Update workflow step duration
              const workflow = await db.getSequencedTaskById(change.target.id)
              if (workflow && workflow.steps) {
                const step = workflow.steps.find(s =>
                  s.name.toLowerCase().includes(change.stepName!.toLowerCase()) ||
                  change.stepName!.toLowerCase().includes(s.name.toLowerCase()),
                )
                if (step) {
                  // Update the step duration
                  await db.updateTaskStepProgress(step.id, {
                    duration: change.newDuration,
                  })

                  // Recalculate workflow total duration
                  const updatedWorkflow = await db.getSequencedTaskById(change.target.id)
                  if (updatedWorkflow && updatedWorkflow.steps) {
                    const newTotalDuration = updatedWorkflow.steps.reduce((sum, s) => sum + s.duration, 0)
                    await db.updateSequencedTask(change.target.id, {
                      duration: newTotalDuration,
                    })
                  }

                  successCount++
                } else {
                  markFailed(`Step "${change.stepName}" not found in workflow "${workflow.name}"`)
                  errorCount++
                }
              } else {
                markFailed(`Workflow not found or has no steps for target "${change.target.name}"`)
                errorCount++
              }
            } else if (change.target.type === EntityType.Workflow) {
              // Update workflow duration
              await db.updateSequencedTask(change.target.id, {
                duration: change.newDuration,
              })
              successCount++
            } else {
              // Update task duration
              await db.updateTask(change.target.id, {
                duration: change.newDuration,
              })
              successCount++
            }
          } else {
            markFailed(`Cannot update duration for "${change.target.name}" - target not found in database`)
            errorCount++
          }
          break
        }

        case AmendmentType.StepAddition: {
          const addition = amendment as StepAddition
          if (addition.workflowTarget.id) {
            try {
              await db.addStepToWorkflow(addition.workflowTarget.id, {
                name: addition.stepName,
                duration: addition.duration,
                type: addition.stepType,
                afterStep: addition.afterStep,
                beforeStep: addition.beforeStep,
                dependencies: addition.dependencies,
                asyncWaitTime: addition.asyncWaitTime || 0,
              })
              successCount++
              // UI refresh will be triggered by DATA_REFRESH_NEEDED event at end of applyAmendments
            } catch (error) {
              logger.ui.error('Failed to add step to workflow', {
                error: error instanceof Error ? error.message : String(error),
                stepName: addition.stepName,
              }, 'step-add-error')
              Message.error(`Failed to add step "${addition.stepName}" to workflow`)
              errorCount++
            }
          } else {
            Message.warning(`Cannot add step to ${addition.workflowTarget.name} - workflow not found`)
            errorCount++
          }
          break
        }

        case AmendmentType.StepRemoval: {
          const removal = amendment as StepRemoval
          if (removal.workflowTarget.id) {
            try {
              const workflow = await db.getSequencedTaskById(removal.workflowTarget.id)
              if (workflow && workflow.steps) {
                const stepIndex = workflow.steps.findIndex(s =>
                  s.name.toLowerCase().includes(removal.stepName.toLowerCase()) ||
                  removal.stepName.toLowerCase().includes(s.name.toLowerCase()),
                )

                if (stepIndex !== -1) {
                  const removedStep = workflow.steps[stepIndex]
                  if (!removedStep) continue // Satisfy noUncheckedIndexedAccess
                  // Remove the step
                  const updatedSteps = workflow.steps.filter((_, index) => index !== stepIndex)

                  // Update step indices
                  updatedSteps.forEach((step, index) => {
                    step.stepIndex = index
                  })

                  // Remove dependencies on the removed step
                  updatedSteps.forEach(step => {
                    if (step.dependsOn && step.dependsOn.includes(removedStep.id)) {
                      step.dependsOn = step.dependsOn.filter(id => id !== removedStep.id)
                    }
                  })

                  // Update workflow duration
                  const newDuration = updatedSteps.reduce((sum, step) => sum + step.duration, 0)

                  await db.updateSequencedTask(removal.workflowTarget.id, {
                    steps: updatedSteps,
                    duration: newDuration,
                  })

                  successCount++
                  Message.success(`Removed step "${removal.stepName}"`)
                } else {
                  Message.warning(`Step "${removal.stepName}" not found in workflow`)
                  errorCount++
                }
              } else {
                Message.warning('Workflow not found or has no steps')
                errorCount++
              }
            } catch (error) {
              logger.ui.error('Failed to remove step', {
                error: error instanceof Error ? error.message : String(error),
                stepName: removal.stepName,
              }, 'step-remove-error')
              Message.error(`Failed to remove step "${removal.stepName}"`)
              errorCount++
            }
          } else {
            Message.warning(`Cannot remove step from ${removal.workflowTarget.name} - workflow not found`)
            errorCount++
          }
          break
        }

        case AmendmentType.DependencyChange: {
          const change = amendment as DependencyChange

          if (change.target.id) {
            try {
              if (change.stepName) {
                // This is a workflow step dependency change

                // Get the workflow
                const workflow = await db.getSequencedTaskById(change.target.id)
                if (workflow && workflow.steps) {
                  // Find the step
                  const stepIndex = workflow.steps.findIndex(s =>
                    s.name.toLowerCase() === change.stepName.toLowerCase(),
                  )

                  if (stepIndex !== -1) {
                    const step = workflow.steps[stepIndex]
                    if (!step) continue // Satisfy noUncheckedIndexedAccess

                    // Apply forward dependency changes using shared utility
                    applyForwardDependencyChanges(step, change, workflow.steps)

                    // Update the step in the workflow
                    workflow.steps[stepIndex] = step

                    // Apply reverse dependency changes using shared utility
                    applyReverseDependencyChanges(step, change, workflow.steps)

                    // Save the workflow with all updates
                    await db.updateSequencedTask(change.target.id, { steps: workflow.steps })

                    successCount++
                  } else {
                    Message.warning(`Step "${change.stepName}" not found in workflow`)
                    errorCount++
                  }
                } else {
                  Message.warning(`Workflow ${change.target.name} not found or has no steps`)
                  errorCount++
                }
              } else {
                // This is a task/workflow level dependency change
                // First, build a set of valid entity IDs for validation
                const allTasks = await db.getTasks()
                const allWorkflows = await db.getSequencedTasks()
                const validEntityIds = new Set<string>([
                  ...allTasks.map(t => t.id),
                  ...allWorkflows.map(w => w.id),
                  ...allWorkflows.flatMap(w => w.steps?.map(s => s.id) || []),
                  ...Array.from(createdTaskMap.values()), // Include newly created tasks
                ])

                // Validate dependencies before applying
                const validateDependencyIds = (depIds: string[]): { valid: string[]; invalid: string[] } => {
                  const valid: string[] = []
                  const invalid: string[] = []
                  for (const depId of depIds) {
                    // Resolve from createdTaskMap first (for batch-created tasks)
                    const resolvedId = createdTaskMap.get(depId) || depId
                    if (validEntityIds.has(resolvedId)) {
                      valid.push(resolvedId)
                    } else {
                      invalid.push(depId)
                    }
                  }
                  return { valid, invalid }
                }

                if (change.target.type === EntityType.Workflow) {
                  // Update workflow dependencies
                  const workflow = await db.getSequencedTaskById(change.target.id)
                  if (workflow) {
                    let currentDeps = workflow.dependencies || []

                    if (change.addDependencies && change.addDependencies.length > 0) {
                      const { valid, invalid } = validateDependencyIds(change.addDependencies)
                      if (invalid.length > 0) {
                        Message.warning(`Some dependencies could not be resolved: ${invalid.join(', ')}`)
                        logger.ui.warn('Invalid dependencies in workflow update', {
                          workflowId: change.target.id,
                          invalid,
                        }, 'invalid-dependencies')
                      }
                      const toAdd = valid.filter(d => !currentDeps.includes(d))
                      currentDeps = [...currentDeps, ...toAdd]
                    }

                    if (change.removeDependencies && change.removeDependencies.length > 0) {
                      currentDeps = currentDeps.filter(d => !change.removeDependencies!.includes(d))
                    }

                    await db.updateSequencedTask(change.target.id, { dependencies: currentDeps })
                    successCount++
                  }
                } else {
                  // Update task dependencies
                  const task = await db.getTaskById(change.target.id)
                  if (task) {
                    let currentDeps = task.dependencies || []

                    if (change.addDependencies && change.addDependencies.length > 0) {
                      const { valid, invalid } = validateDependencyIds(change.addDependencies)
                      if (invalid.length > 0) {
                        Message.warning(`Some dependencies could not be resolved: ${invalid.join(', ')}`)
                        logger.ui.warn('Invalid dependencies in task update', {
                          taskId: change.target.id,
                          invalid,
                        }, 'invalid-dependencies')
                      }
                      const toAdd = valid.filter(d => !currentDeps.includes(d))
                      currentDeps = [...currentDeps, ...toAdd]
                    }

                    if (change.removeDependencies && change.removeDependencies.length > 0) {
                      currentDeps = currentDeps.filter(d => !change.removeDependencies!.includes(d))
                    }

                    await db.updateTask(change.target.id, { dependencies: currentDeps })
                    successCount++
                  }
                }
              }
            } catch (error) {
              logger.ui.error('Failed to update dependencies', {
                error: error instanceof Error ? error.message : String(error),
                targetName: change.target.name,
              }, 'dependencies-update-error')
              Message.error(`Failed to update dependencies for ${change.target.name}`)
              errorCount++
            }
          } else {
            Message.warning(`Cannot update dependencies for ${change.target.name} - not found`)
            errorCount++
          }
          break
        }

        case AmendmentType.TaskCreation: {
          const creation = amendment as TaskCreation

          // Check if this might be a workflow step that was misidentified
          // Look for patterns that suggest this should be a workflow step
          // Check for duplicate task names to prevent creating duplicates
          const existingTasks = await db.getTasks()
          const duplicateTask = existingTasks.find(t =>
            t.name === creation.name &&
            !t.completed &&
            Math.abs(t.duration - creation.duration) < 30, // Similar duration
          )

          if (duplicateTask) {
            Message.warning(`Task "${creation.name}" already exists`)
            // Track the existing task ID for dependency resolution
            const placeholderIndex = amendments.findIndex(a =>
              a.type === AmendmentType.TaskCreation && a === amendment,
            )
            createdTaskMap.set(`task-new-${placeholderIndex + 1}`, duplicateTask.id)
            break
          }

          // Create the task - use notes field since description doesn't exist in schema
          const taskData = {
            name: creation.name,
            notes: creation.description || '',
            importance: creation.importance || 5,
            urgency: creation.urgency || 5,
            duration: creation.duration,
            type: resolveTaskType(creation.taskType),
            asyncWaitTime: 0,
            completed: false,
            dependencies: [],
            hasSteps: false as const,
            overallStatus: TaskStatus.NotStarted,
            criticalPathDuration: creation.duration,
            worstCaseDuration: creation.duration,
            archived: false,
          }

          const newTask = await db.createTask(taskData)
          successCount++

          // Track the created task ID for resolving placeholders
          // Look for task-new-N pattern in amendments
          const placeholderIndex = amendments.findIndex(a =>
            a.type === AmendmentType.TaskCreation && a === amendment,
          )
          createdTaskMap.set(`task-new-${placeholderIndex + 1}`, newTask.id)

          break
        }

        case AmendmentType.WorkflowCreation: {
          const creation = amendment as WorkflowCreation
          const totalDuration = creation.steps.reduce((sum, step) => sum + step.duration, 0)

          // STEP 1: Generate unique IDs for all steps first (name → ID map)
          const stepNameToId = new Map<string, string>()
          creation.steps.forEach((step) => {
            const stepId = generateUniqueId('step')
            stepNameToId.set(step.name.toLowerCase(), stepId)
          })

          // STEP 2: Build steps with proper ID-based dependencies
          // Track unresolved dependencies to surface warnings to user
          const unresolvedDepsPerStep: Array<{ stepName: string; unresolvedDeps: string[] }> = []

          const steps = creation.steps.map((step, index) => {
            const stepId = stepNameToId.get(step.name.toLowerCase())!
            const unresolvedDeps: string[] = []

            // Convert dependency names to IDs
            const dependencyIds = (step.dependsOn || []).map(depName => {
              const depId = stepNameToId.get(depName.toLowerCase())
              if (!depId) {
                unresolvedDeps.push(depName)
                logger.ui.warn(`Dependency "${depName}" not found in workflow "${creation.name}"`, {
                  stepName: step.name,
                  availableSteps: Array.from(stepNameToId.keys()),
                }, 'dependency-resolution')
              }
              return depId
            }).filter((id): id is string => id !== undefined)

            // Collect unresolved deps for this step
            if (unresolvedDeps.length > 0) {
              unresolvedDepsPerStep.push({ stepName: step.name, unresolvedDeps })
            }

            return {
              id: stepId,
              taskId: '', // Will be set when saved
              name: step.name,
              duration: step.duration,
              type: resolveTaskType(step.type),
              dependsOn: dependencyIds, // NOW USING IDs, NOT NAMES
              asyncWaitTime: step.asyncWaitTime || 0,
              status: StepStatus.Pending,
              stepIndex: index,
              percentComplete: 0,
            }
          })

          // Surface user-visible warning if any dependencies couldn't be resolved
          if (unresolvedDepsPerStep.length > 0) {
            const warningMessages = unresolvedDepsPerStep.map(
              ({ stepName, unresolvedDeps }) => `"${stepName}": ${unresolvedDeps.join(', ')}`,
            )
            Message.warning(`Some step dependencies couldn't be linked: ${warningMessages.join('; ')}`)
          }

          // STEP 3: Validate dependencies (orphans + cycles)
          const validationResult = validateWorkflowDependencies(steps)
          if (!validationResult.isValid) {
            logger.ui.error(`Invalid dependencies in workflow "${creation.name}"`, {
              errors: validationResult.errors,
            }, 'dependency-validation')
            Message.error(`Workflow "${creation.name}": ${validationResult.errors[0]}`)
            errorCount++
            break
          }

          const workflowData = {
            name: creation.name,
            notes: creation.description || '',
            importance: creation.importance || 5,
            urgency: creation.urgency || 5,
            duration: totalDuration,
            type: steps[0]?.type || '',
            asyncWaitTime: 0,
            completed: false,
            dependencies: [],
            criticalPathDuration: totalDuration,
            worstCaseDuration: totalDuration,
            steps: steps,
            hasSteps: true as const,
            overallStatus: TaskStatus.NotStarted,
            archived: false,
          }

          await db.createSequencedTask(workflowData)
          Message.success(`Created workflow: ${creation.name} (${steps.length} steps)`)
          successCount++
          break
        }

        case AmendmentType.DeadlineChange: {
          const change = amendment as DeadlineChange
          if (change.target.id) {
            try {
              const deadline = change.newDeadline
              const deadlineType = change.deadlineType

              if (change.stepName) {
                // Changing deadline for a workflow step
                Message.warning('Step deadlines are not yet supported')
                errorCount++
              } else if (change.target.type === EntityType.Workflow) {
                // Update workflow deadline
                await db.updateSequencedTask(change.target.id, {
                  deadline: deadline,
                  deadlineType: deadlineType,
                })
                successCount++
                Message.success(`Deadline updated to ${change.newDeadline.toLocaleString()}`)
              } else {
                // Update task deadline
                await db.updateTask(change.target.id, {
                  deadline: deadline,
                  deadlineType: deadlineType,
                })
                successCount++
                Message.success(`Deadline updated to ${change.newDeadline.toLocaleString()}`)
              }
            } catch (error) {
              logger.ui.error('Failed to update deadline', {
                error: error instanceof Error ? error.message : String(error),
                targetName: change.target.name,
              }, 'deadline-update-error')
              Message.error(`Failed to update deadline for ${change.target.name}`)
              errorCount++
            }
          } else {
            Message.warning(`Cannot update deadline for ${change.target.name} - not found`)
            errorCount++
          }
          break
        }

        case AmendmentType.PriorityChange: {
          const change = amendment as PriorityChange
          if (change.target.id) {
            try {
              const updates: any = {}
              if (change.importance !== undefined) updates.importance = change.importance
              if (change.urgency !== undefined) updates.urgency = change.urgency
              if (change.cognitiveComplexity !== undefined) updates.cognitiveComplexity = change.cognitiveComplexity

              if (change.stepName) {
                // Changing priority for a workflow step
                const workflow = await db.getSequencedTaskById(change.target.id)
                if (workflow && workflow.steps) {
                  const stepIndex = workflow.steps.findIndex(s =>
                    s.name.toLowerCase().includes(change.stepName!.toLowerCase()) ||
                    change.stepName!.toLowerCase().includes(s.name.toLowerCase()),
                  )

                  if (stepIndex !== -1) {
                    // Update step properties - schema supports importance and urgency for steps
                    const updatedSteps = [...workflow.steps]
                    const step = updatedSteps[stepIndex]
                    if (!step) continue // Satisfy noUncheckedIndexedAccess

                    // Apply the priority changes that are supported
                    if (change.importance !== undefined) {
                      step.importance = change.importance
                    }
                    if (change.urgency !== undefined) {
                      step.urgency = change.urgency
                    }
                    if (change.cognitiveComplexity !== undefined) {
                      step.cognitiveComplexity = change.cognitiveComplexity
                    }

                    await db.updateSequencedTask(change.target.id, { steps: updatedSteps })
                    successCount++
                    Message.success(`Updated priority for step "${change.stepName}"`)
                  } else {
                    Message.warning(`Step "${change.stepName}" not found`)
                    errorCount++
                  }
                }
              } else if (change.target.type === EntityType.Workflow) {
                // Update workflow priority
                await db.updateSequencedTask(change.target.id, updates)
                successCount++
                Message.success('Priority updated successfully')
              } else {
                // Update task priority
                await db.updateTask(change.target.id, updates)
                successCount++
                Message.success('Priority updated successfully')
              }
            } catch (error) {
              logger.ui.error('Failed to update priority', {
                error: error instanceof Error ? error.message : String(error),
                targetName: change.target.name,
              }, 'priority-update-error')
              Message.error(`Failed to update priority for ${change.target.name}`)
              errorCount++
            }
          } else {
            Message.warning(`Cannot update priority for ${change.target.name} - not found`)
            errorCount++
          }
          break
        }

        case AmendmentType.TypeChange: {
          const change = amendment as TypeChange
          if (change.target.id) {
            try {
              if (change.stepName) {
                // Changing type for a workflow step
                const workflow = await db.getSequencedTaskById(change.target.id)
                if (workflow && workflow.steps) {
                  const stepIndex = workflow.steps.findIndex(s =>
                    s.name.toLowerCase().includes(change.stepName!.toLowerCase()) ||
                    change.stepName!.toLowerCase().includes(s.name.toLowerCase()),
                  )

                  if (stepIndex !== -1) {
                    const updatedSteps = [...workflow.steps]
                    const existingStep = updatedSteps[stepIndex]
                    if (!existingStep) continue // Satisfy noUncheckedIndexedAccess
                    updatedSteps[stepIndex] = {
                      ...existingStep,
                      type: change.newType,
                    }

                    await db.updateSequencedTask(change.target.id, { steps: updatedSteps })
                    successCount++
                    Message.success(`Step type changed to ${change.newType}`)
                  } else {
                    Message.warning(`Step "${change.stepName}" not found`)
                    errorCount++
                  }
                }
              } else if (change.target.type === EntityType.Workflow) {
                // Update workflow type
                await db.updateSequencedTask(change.target.id, { type: change.newType })
                successCount++
                Message.success(`Type changed to ${change.newType}`)
              } else {
                // Update task type
                await db.updateTask(change.target.id, { type: change.newType })
                successCount++
                Message.success(`Type changed to ${change.newType}`)
              }
            } catch (error) {
              logger.ui.error('Failed to update type', {
                error: error instanceof Error ? error.message : String(error),
                targetName: change.target.name,
              }, 'type-update-error')
              Message.error(`Failed to update type for ${change.target.name}`)
              errorCount++
            }
          } else {
            Message.warning(`Cannot update type for ${change.target.name} - not found`)
            errorCount++
          }
          break
        }

        case AmendmentType.WorkPatternModification: {
          const mod = amendment as WorkPatternModification

          // Date is now always a proper Date object after transformation in amendment-validator.ts
          // Use local date extraction to get YYYY-MM-DD string
          const dateStr = dateToYYYYMMDD(mod.date)

          logger.ui.info('WorkPatternModification processing', {
            operation: mod.operation,
            originalDate: String(mod.date),
            parsedDateStr: dateStr,
          }, 'work-pattern-mod')

          try {
            // Get existing pattern for this date
            const existingPattern = await db.getWorkPattern(dateStr)

            switch (mod.operation) {
              case WorkPatternOperation.AddBlock: {
                if (!mod.blockData) {
                  Message.warning('Block data required for AddBlock operation')
                  errorCount++
                  break
                }

                // Extract time directly from ISO string to avoid timezone conversion issues
                // The AI provides times that represent local time encoded in ISO format
                const startTimeStr = extractTimeFromISO(mod.blockData.startTime)
                const endTimeStr = extractTimeFromISO(mod.blockData.endTime)

                // Convert type ID to proper BlockTypeConfig object
                // Database expects typeConfig: { kind, typeId/systemType }, not just a type string
                const typeId = mod.blockData.type
                // Check for system block types (blocked, sleep) - compare as strings since typeId comes from AI
                const isBlockedType = typeId === 'blocked' || typeId === (WorkBlockType.Blocked as string)
                const isSleepType = typeId === 'sleep' || typeId === (WorkBlockType.Sleep as string)
                const typeConfig = isBlockedType
                  ? { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked }
                  : isSleepType
                  ? { kind: BlockConfigKind.System, systemType: WorkBlockType.Sleep }
                  : { kind: BlockConfigKind.Single, typeId: typeId }

                const newBlock = {
                  startTime: startTimeStr,
                  endTime: endTimeStr,
                  typeConfig: typeConfig,  // Use typeConfig object, not type string
                  splitRatio: mod.blockData.splitRatio || null,
                }

                if (existingPattern) {
                  // Add block to existing pattern
                  // CRITICAL: Must preserve block IDs and typeConfig or database will treat all blocks as "to delete"
                  const existingBlocks = existingPattern.WorkBlock || []
                  await db.updateWorkPattern(existingPattern.id, {
                    blocks: [...existingBlocks.map((b: { id: string; startTime: string; endTime: string; typeConfig?: unknown; splitRatio?: Record<string, number> | null }) => ({
                      id: b.id,  // Preserve existing block ID
                      startTime: b.startTime,
                      endTime: b.endTime,
                      typeConfig: b.typeConfig,  // Preserve existing typeConfig
                      splitRatio: b.splitRatio,
                    })), newBlock],
                  })
                } else {
                  // Create new pattern with this block
                  await db.createWorkPattern({
                    date: dateStr,
                    blocks: [newBlock],
                    meetings: [],
                  })
                }

                // Refresh work pattern store reactively
                useWorkPatternStore.getState().loadWorkPatterns()
                Message.success(`Added ${typeId} block: ${startTimeStr} - ${endTimeStr}`)
                successCount++
                break
              }

              case WorkPatternOperation.AddMeeting: {
                if (!mod.meetingData) {
                  Message.warning('Meeting data required for AddMeeting operation')
                  errorCount++
                  break
                }

                // Extract time directly from ISO string to avoid timezone conversion issues
                const meetingStartStr = extractTimeFromISO(mod.meetingData.startTime)
                const meetingEndStr = extractTimeFromISO(mod.meetingData.endTime)

                const newMeeting = {
                  name: mod.meetingData.name,
                  startTime: meetingStartStr,
                  endTime: meetingEndStr,
                  type: mod.meetingData.type,
                  recurring: mod.meetingData.recurring || 'none', // Default to 'none' - Prisma requires non-null
                  daysOfWeek: mod.meetingData.daysOfWeek || null,
                }

                if (existingPattern) {
                  // CRITICAL: Must preserve IDs or database will treat existing entries as "to delete"
                  const existingMeetings = existingPattern.WorkMeeting || []
                  const existingBlocks = existingPattern.WorkBlock || []
                  await db.updateWorkPattern(existingPattern.id, {
                    blocks: existingBlocks.map((b: { id: string; startTime: string; endTime: string; typeConfig?: unknown; splitRatio?: Record<string, number> | null }) => ({
                      id: b.id,  // Preserve existing block ID
                      startTime: b.startTime,
                      endTime: b.endTime,
                      typeConfig: b.typeConfig,  // Preserve existing typeConfig
                      splitRatio: b.splitRatio,
                    })),
                    meetings: [...existingMeetings.map((m: { id: string; name: string; startTime: string; endTime: string; type: string; recurring?: string | null; daysOfWeek?: string | null }) => ({
                      id: m.id,  // Preserve existing meeting ID
                      name: m.name,
                      startTime: m.startTime,
                      endTime: m.endTime,
                      type: m.type,
                      recurring: m.recurring || 'none', // Ensure non-null for Prisma
                      daysOfWeek: m.daysOfWeek,
                    })), newMeeting],
                  })
                } else {
                  await db.createWorkPattern({
                    date: dateStr,
                    blocks: [],
                    meetings: [newMeeting],
                  })
                }

                useWorkPatternStore.getState().loadWorkPatterns()
                Message.success(`Added meeting "${mod.meetingData.name}": ${meetingStartStr} - ${meetingEndStr}`)
                successCount++
                break
              }

              case WorkPatternOperation.RemoveBlock: {
                if (!existingPattern || !mod.blockId) {
                  Message.warning('Cannot remove block - pattern or block ID not found')
                  errorCount++
                  break
                }

                const filteredBlocks = (existingPattern.WorkBlock || []).filter(
                  (b: { id: string }) => b.id !== mod.blockId,
                )
                // CRITICAL: Must preserve block IDs for blocks we're keeping
                await db.updateWorkPattern(existingPattern.id, {
                  blocks: filteredBlocks.map((b: { id: string; startTime: string; endTime: string; typeConfig?: unknown; splitRatio?: Record<string, number> | null }) => ({
                    id: b.id,  // Preserve existing block ID
                    startTime: b.startTime,
                    endTime: b.endTime,
                    typeConfig: b.typeConfig,  // Preserve existing typeConfig
                    splitRatio: b.splitRatio,
                  })),
                })

                useWorkPatternStore.getState().loadWorkPatterns()
                Message.success('Removed work block')
                successCount++
                break
              }

              case WorkPatternOperation.RemoveMeeting: {
                if (!existingPattern || !mod.meetingId) {
                  Message.warning('Cannot remove meeting - pattern or meeting ID not found')
                  errorCount++
                  break
                }

                const filteredMeetings = (existingPattern.WorkMeeting || []).filter(
                  (m: { id: string }) => m.id !== mod.meetingId,
                )
                // CRITICAL: Must preserve meeting IDs for meetings we're keeping
                await db.updateWorkPattern(existingPattern.id, {
                  meetings: filteredMeetings.map((m: { id: string; name: string; startTime: string; endTime: string; type: string; recurring?: string | null; daysOfWeek?: string | null }) => ({
                    id: m.id,  // Preserve existing meeting ID
                    name: m.name,
                    startTime: m.startTime,
                    endTime: m.endTime,
                    type: m.type,
                    recurring: m.recurring || 'none', // Ensure non-null for Prisma
                    daysOfWeek: m.daysOfWeek,
                  })),
                })

                useWorkPatternStore.getState().loadWorkPatterns()
                Message.success('Removed meeting')
                successCount++
                break
              }

              case WorkPatternOperation.ModifyBlock:
              case WorkPatternOperation.ModifyMeeting: {
                // These require more complex logic - for now show info message
                Message.info('Block/meeting modification coming soon')
                break
              }

              default: {
                Message.warning(`Unknown work pattern operation: ${mod.operation}`)
                errorCount++
              }
            }
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            logger.ui.error('Failed to modify work pattern', {
              error: errMsg,
              date: dateStr,
              operation: mod.operation,
            }, 'work-pattern-modification-error')
            markFailed(`Failed to modify work pattern: ${errMsg}`)
            errorCount++
          }
          break
        }

        case AmendmentType.WorkSessionEdit: {
          const edit = amendment as WorkSessionEdit

          try {
            switch (edit.operation) {
              case WorkSessionOperation.Create: {
                if (!edit.taskId) {
                  Message.warning('Task ID required to create work session')
                  errorCount++
                  break
                }

                const startTime = edit.startTime
                  ? (edit.startTime instanceof Date ? edit.startTime : new Date(edit.startTime))
                  : new Date()

                await db.createWorkSession({
                  taskId: edit.taskId,
                  stepId: edit.stepId,
                  startTime,
                  endTime: edit.endTime
                    ? (edit.endTime instanceof Date ? edit.endTime : new Date(edit.endTime))
                    : undefined,
                  plannedMinutes: edit.plannedMinutes || 30,
                  actualMinutes: edit.actualMinutes,
                  notes: edit.notes,
                })
                Message.success('Created work session')
                successCount++
                break
              }

              case WorkSessionOperation.Update: {
                if (!edit.sessionId) {
                  Message.warning('Session ID required to update work session')
                  errorCount++
                  break
                }

                await db.updateWorkSession(edit.sessionId, {
                  startTime: edit.startTime
                    ? (edit.startTime instanceof Date ? edit.startTime : new Date(edit.startTime))
                    : undefined,
                  endTime: edit.endTime
                    ? (edit.endTime instanceof Date ? edit.endTime : new Date(edit.endTime))
                    : undefined,
                  plannedMinutes: edit.plannedMinutes,
                  actualMinutes: edit.actualMinutes,
                  notes: edit.notes,
                })
                Message.success('Updated work session')
                successCount++
                break
              }

              case WorkSessionOperation.Delete: {
                if (!edit.sessionId) {
                  Message.warning('Session ID required to delete work session')
                  errorCount++
                  break
                }

                await db.deleteWorkSession(edit.sessionId)
                Message.success('Deleted work session')
                successCount++
                break
              }

              case WorkSessionOperation.Split: {
                // Split requires new database method - defer for now
                Message.info('Work session split not yet implemented')
                break
              }
            }
          } catch (error) {
            logger.ui.error('Failed to edit work session', {
              error: error instanceof Error ? error.message : String(error),
              operation: edit.operation,
            }, 'work-session-edit-error')
            Message.error(`Failed to ${edit.operation} work session`)
            errorCount++
          }
          break
        }

        case AmendmentType.ArchiveToggle: {
          const toggle = amendment as ArchiveToggle
          if (toggle.target.id) {
            if (toggle.target.type === EntityType.Workflow) {
              await db.updateSequencedTask(toggle.target.id, {
                archived: toggle.archive,
              })
              Message.success(`${toggle.archive ? 'Archived' : 'Unarchived'} workflow: ${toggle.target.name}`)
              successCount++
            } else if (toggle.target.type === EntityType.Task) {
              if (toggle.archive) {
                await db.archiveTask(toggle.target.id)
              } else {
                await db.unarchiveTask(toggle.target.id)
              }
              Message.success(`${toggle.archive ? 'Archived' : 'Unarchived'} task: ${toggle.target.name}`)
              successCount++
            } else {
              Message.warning('Cannot archive/unarchive steps directly')
              errorCount++
            }
          } else {
            Message.warning(`Cannot find ${toggle.target.name} to archive/unarchive`)
            errorCount++
          }
          break
        }

        case AmendmentType.QueryResponse: {
          // QueryResponse doesn't modify anything, just informational
          // No action needed
          break
        }

        case AmendmentType.TaskTypeCreation: {
          const creation = amendment as TaskTypeCreation
          try {
            // Validate hex color format
            if (!creation.color.match(/^#[0-9A-Fa-f]{6}$/)) {
              Message.warning(`Invalid color format "${creation.color}" - must be #RRGGBB`)
              errorCount++
              break
            }

            // Check for duplicate type name
            const existingTypes = useUserTaskTypeStore.getState().types
            const duplicate = existingTypes.find(
              t => t.name.toLowerCase() === creation.name.toLowerCase(),
            )
            if (duplicate) {
              Message.warning(`Task type "${creation.name}" already exists`)
              errorCount++
              break
            }

            // Create the new task type
            await useUserTaskTypeStore.getState().createType({
              name: creation.name.trim(),
              emoji: creation.emoji || '📌',
              color: creation.color.toUpperCase(),
            })

            Message.success(`Created task type: ${creation.emoji} ${creation.name}`)
            successCount++
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            logger.ui.error('Failed to create task type', {
              error: errMsg,
              name: creation.name,
            }, 'task-type-creation-error')
            Message.error(`Failed to create task type "${creation.name}": ${errMsg}`)
            errorCount++
          }
          break
        }

        default: {
          // This will cause a compile-time error if we miss any enum values
          const _exhaustiveCheck: never = amendment
          assertNever(_exhaustiveCheck)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.ui.error('Error applying amendment', {
        error: errorMessage,
        amendmentType: amendment.type,
      }, 'amendment-apply-error')
      // Only record if we haven't already tracked this amendment
      if (successCount === prevSuccessCount && errorCount === prevErrorCount) {
        recordError(amendment, errorMessage)
      }
    }

    // Record result based on what happened during this amendment
    // If counts didn't change in the switch, record based on markFailed flag
    if (successCount === prevSuccessCount && errorCount === prevErrorCount) {
      // Nothing was recorded yet - use the tracking flags
      if (currentAmendmentFailed) {
        results.push({ amendment, success: false, message: currentAmendmentError || 'Unknown error' })
      } else {
        // No explicit success/error - assume success for amendments that don't increment counts
        results.push({ amendment, success: true, message: amendmentDesc })
      }
    } else if (successCount > prevSuccessCount) {
      // Success was recorded via successCount++
      results.push({ amendment, success: true, message: amendmentDesc })
    } else if (errorCount > prevErrorCount) {
      // Error was recorded via errorCount++
      results.push({ amendment, success: false, message: currentAmendmentError || amendmentDesc })
    }
  }

  // Update stores if any amendments succeeded
  if (successCount > 0) {
    await useTaskStore.getState().initializeData()
    // Schedule will automatically recompute via reactive subscriptions
  }

  // Show summary messages (for backwards compatibility with existing behavior)
  if (successCount > 0 && errorCount === 0) {
    Message.success(`Applied ${successCount} amendment${successCount > 1 ? 's' : ''}`)
  } else if (successCount > 0 && errorCount > 0) {
    Message.success(`Applied ${successCount} amendment${successCount > 1 ? 's' : ''}`)
    Message.error(`Failed to apply ${errorCount} amendment${errorCount > 1 ? 's' : ''}`)
  } else if (errorCount > 0) {
    Message.error(`Failed to apply ${errorCount} amendment${errorCount > 1 ? 's' : ''}`)
  }

  return {
    successCount,
    errorCount,
    results,
  }
}
