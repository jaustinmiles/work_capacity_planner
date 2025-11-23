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
  TaskType,
  ArchiveToggle,
} from '@shared/amendment-types'
import { assertNever, StepStatus } from '@shared/enums'
import { getDatabase } from '../services/database'
import { Message } from '../components/common/Message'
import { logger } from '@/logger'
import { useTaskStore } from '../store/useTaskStore'
import {
  applyForwardDependencyChanges,
  applyReverseDependencyChanges,
} from './dependency-utils'


export async function applyAmendments(amendments: Amendment[]): Promise<void> {
  const db = getDatabase()
  let successCount = 0
  let errorCount = 0

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
                  Message.warning(`Step "${update.stepName}" not found in workflow`)
                  errorCount++
                }
              } else {
                Message.warning('Workflow not found or has no steps')
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
            Message.warning(`Cannot update ${update.target.name} - not found`)
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
                  Message.warning(`Step "${log.stepName}" not found in workflow`)
                  errorCount++
                }
              } else {
                Message.warning('Workflow not found or has no steps')
                errorCount++
              }
            } else {
              // Log time for task
              await db.createWorkSession({
                taskId: log.target.id,
                date: log.date ? log.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                plannedMinutes: log.duration,
                actualMinutes: log.duration,
                type: TaskType.Focused, // Default, could be smarter
              })
              successCount++
            }
          } else {
            Message.warning(`Cannot log time for ${log.target.name} - not found`)
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
                  Message.warning(`Step "${note.stepName}" not found in workflow`)
                  errorCount++
                }
              } else {
                Message.warning('Workflow not found or has no steps')
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
            Message.warning(`Cannot add note to ${note.target.name} - not found`)
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
                  Message.warning(`Step "${change.stepName}" not found in workflow`)
                  errorCount++
                }
              } else {
                Message.warning('Workflow not found or has no steps')
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
            Message.warning(`Cannot update duration for ${change.target.name} - not found`)
            errorCount++
          }
          break
        }

        case AmendmentType.StepAddition: {
          const addition = amendment as StepAddition
          if (addition.workflowTarget.id) {
            try {
              const __updatedWorkflow = await db.addStepToWorkflow(addition.workflowTarget.id, {
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
                if (change.target.type === EntityType.Workflow) {
                  // Update workflow dependencies
                  const workflow = await db.getSequencedTaskById(change.target.id)
                  if (workflow) {
                    let currentDeps = workflow.dependencies || []

                    if (change.addDependencies && change.addDependencies.length > 0) {
                      // Resolve any placeholder task IDs
                      const resolvedDeps = change.addDependencies.map(dep =>
                        createdTaskMap.get(dep) || dep,
                      )
                      const toAdd = resolvedDeps.filter(d => !currentDeps.includes(d))
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
                      // Resolve any placeholder task IDs
                      const resolvedDeps = change.addDependencies.map(dep =>
                        createdTaskMap.get(dep) || dep,
                      )
                      const toAdd = resolvedDeps.filter(d => !currentDeps.includes(d))
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
            type: creation.taskType || TaskType.Focused,
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

          // Create the workflow with steps - use notes field since description doesn't exist
          const totalDuration = creation.steps.reduce((sum, step) => sum + step.duration, 0)
          const workflowData = {
            name: creation.name,
            notes: creation.description || '',
            importance: creation.importance || 5,
            urgency: creation.urgency || 5,
            duration: totalDuration,
            type: creation.steps[0]?.type || TaskType.Focused,
            asyncWaitTime: 0,
            completed: false,
            dependencies: [],
            criticalPathDuration: totalDuration,
            worstCaseDuration: totalDuration,
            steps: creation.steps.map((step, index) => ({
              id: `step-${Date.now()}-${index}`,
              taskId: '', // Will be set when saved
              name: step.name,
              duration: step.duration,
              type: step.type,
              dependsOn: step.dependsOn || [],
              asyncWaitTime: step.asyncWaitTime || 0,
              status: StepStatus.Pending,
              stepIndex: index,
              percentComplete: 0,
            })),
            hasSteps: true as const,
            overallStatus: TaskStatus.NotStarted,
            archived: false,
          }

          await db.createSequencedTask(workflowData)
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
                    updatedSteps[stepIndex] = {
                      ...updatedSteps[stepIndex],
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
          // TODO: Implement work pattern modification
          // This requires accessing the work pattern store and database
          Message.info('Work pattern modification not yet implemented')
          break
        }

        case AmendmentType.WorkSessionEdit: {
          // TODO: Implement work session editing
          // This requires accessing work session database methods
          Message.info('Work session editing not yet implemented')
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

        default: {
          // This will cause a compile-time error if we miss any enum values
          const _exhaustiveCheck: never = amendment
          assertNever(_exhaustiveCheck)
        }
      }
    } catch (error) {
      logger.ui.error('Error applying amendment', {
        error: error instanceof Error ? error.message : String(error),
        amendmentType: amendment.type,
      }, 'amendment-apply-error')
      errorCount++
    }
  }

  if (successCount > 0) {
    Message.success(`Applied ${successCount} amendment${successCount !== 1 ? 's' : ''}`)
    // Update stores to refresh UI reactively
    await useTaskStore.getState().initializeData()
    // Schedule will automatically recompute via reactive subscriptions
  }
  if (errorCount > 0) {
    Message.error(`Failed to apply ${errorCount} amendment${errorCount !== 1 ? 's' : ''}`)
  }
}
