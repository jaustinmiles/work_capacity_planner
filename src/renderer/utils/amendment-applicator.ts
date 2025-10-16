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
} from '@shared/amendment-types'
import { assertNever, StepStatus } from '@shared/enums'
import { getDatabase } from '../services/database'
import { Message } from '../components/common/Message'
import { logger } from '@/logger'
import { appEvents, EVENTS } from './events'
import {
  applyForwardDependencyChanges,
  applyReverseDependencyChanges,
} from './dependency-utils'


export async function applyAmendments(amendments: Amendment[]): Promise<void> {
  const db = getDatabase()
  let successCount = 0
  let errorCount = 0

  logger.ui.info('[AmendmentApplicator] applyAmendments called', {    status: update.newStatus,
                  })
                  successCount++
                  logger.ui.debug('Updated workflow step status', { stepName: update.stepName, status: update.newStatus })
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
                  logger.ui.info(`Logged ${log.duration} minutes for step "${log.stepName}"`)
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
                  logger.ui.info(`Added note to step "${note.stepName}"`)
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
                  logger.ui.info(`Updated duration for step "${change.stepName}" to ${change.newDuration} minutes`)
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
              logger.ui.debug('[AmendmentApplicator] Adding step to workflow:', {

              const __updatedWorkflow = await db.addStepToWorkflow(addition.workflowTarget.id, {})
                name: addition.stepName,
                duration: addition.duration,
                type: addition.stepType,
                afterStep: addition.afterStep,
                beforeStep: addition.beforeStep,
                dependencies: addition.dependencies,
                asyncWaitTime: addition.asyncWaitTime || 0,
              })
              logger.ui.debug('[AmendmentApplicator] Step added successfully')
              successCount++
              // UI refresh will be triggered by DATA_REFRESH_NEEDED event at end of applyAmendments
            } catch (error) {
              logger.ui.info('Failed to add step to workflow', {    duration: newDuration,
                  })

                  successCount++
                  logger.ui.info(`Removed step "${removal.stepName}" from workflow`)
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
              logger.ui.info('Failed to remove step', {    percentComplete: 0,
            })),
            hasSteps: true as const,
            overallStatus: TaskStatus.NotStarted,
            archived: false,
          }

          await db.createSequencedTask(workflowData)
          successCount++
          logger.ui.info('Workflow created successfully:', creation.name)
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
                logger.ui.warn('Step-level deadlines not yet supported in database schema')
                Message.warning('Step deadlines are not yet supported')
                errorCount++
              } else if (change.target.type === EntityType.Workflow) {
                // Update workflow deadline
                await db.updateSequencedTask(change.target.id, {
                  deadline: deadline,
                  deadlineType: deadlineType,
                })
                successCount++
                logger.ui.info(`Updated workflow deadline to ${deadline.toISOString()}`)
                Message.success(`Deadline updated to ${change.newDeadline.toLocaleString()}`)
              } else {
                // Update task deadline
                await db.updateTask(change.target.id, {
                  deadline: deadline,
                  deadlineType: deadlineType,
                })
                successCount++
                logger.ui.info(`Updated task deadline to ${deadline.toISOString()}`)
                Message.success(`Deadline updated to ${change.newDeadline.toLocaleString()}`)
              }
            } catch (error) {
              logger.ui.error('Failed to update deadline', {})
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
                    logger.ui.info('Updated step priority:', {})

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
                logger.ui.info('Updated workflow priority:', updates)
                Message.success('Priority updated successfully')
              } else {
                // Update task priority
                await db.updateTask(change.target.id, updates)
                successCount++
                logger.ui.info('Updated task priority:', updates)
                Message.success('Priority updated successfully')
              }
            } catch (error) {
              logger.ui.error('Failed to update priority', {})
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
                    logger.ui.info(`Updated step type to ${change.newType}`)
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
                logger.ui.info(`Updated workflow type to ${change.newType}`)
                Message.success(`Type changed to ${change.newType}`)
              } else {
                // Update task type
                await db.updateTask(change.target.id, { type: change.newType })
                successCount++
                logger.ui.info(`Updated task type to ${change.newType}`)
                Message.success(`Type changed to ${change.newType}`)
              }
            } catch (error) {
              logger.ui.error('Failed to update type', {})
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

        default: {
          // This will cause a compile-time error if we miss any enum values
          const _exhaustiveCheck: never = amendment
          assertNever(_exhaustiveCheck)
        }
      }
    } catch (error) {
      logger.ui.error('Error applying amendment', {})
        error: error instanceof Error ? error.message : String(error),
        amendmentType: amendment.type,
      }, 'amendment-apply-error')
      errorCount++
    }
  }

  if (successCount > 0) {
    Message.success(`Applied ${successCount} amendment${successCount !== 1 ? 's' : ''}`)
    // Emit events to refresh UI
    appEvents.emit(EVENTS.DATA_REFRESH_NEEDED)
    appEvents.emit(EVENTS.TASK_UPDATED)
    appEvents.emit(EVENTS.WORKFLOW_UPDATED)
  }
  if (errorCount > 0) {
    Message.error(`Failed to apply ${errorCount} amendment${errorCount !== 1 ? 's' : ''}`)
  }
}
