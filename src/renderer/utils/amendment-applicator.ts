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
  TaskCreation,
  WorkflowCreation,
  DependencyChange,
} from '@shared/amendment-types'
import { assertNever, TaskType } from '@shared/enums'
import { getDatabase } from '../services/database'
import { Message } from '../components/common/Message'
import { logger } from './logger'


export async function applyAmendments(amendments: Amendment[]): Promise<void> {
  const db = getDatabase()
  let successCount = 0
  let errorCount = 0

  for (const amendment of amendments) {
    try {
      switch (amendment.type) {
        case AmendmentType.StatusUpdate: {
          const update = amendment as StatusUpdate
          if (update.target.id) {
            if (update.stepName) {
              // Update workflow step status
              // This would need to be implemented in the database service
              logger.ui.debug('TODO: Update workflow step status', update)
              Message.info('Step status updates not yet implemented')
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
              // This would need StepWorkSession creation
              logger.ui.debug('TODO: Log time for workflow step', log)
              Message.info('Step time logging not yet implemented')
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
              logger.ui.debug('TODO: Add note to workflow step', note)
              Message.info('Step notes not yet implemented')
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
              logger.ui.debug('TODO: Update workflow step duration', change)
              Message.info('Step duration updates not yet implemented')
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
              // logger.ui.debug('[AmendmentApplicator] Adding step to workflow:', addition)
              const __updatedWorkflow = await db.addStepToWorkflow(addition.workflowTarget.id, {
                name: addition.stepName,
                duration: addition.duration,
                type: addition.stepType as any, // TODO: Fix mixed pattern in addStepToWorkflow type definition
                afterStep: addition.afterStep,
                beforeStep: addition.beforeStep,
                dependencies: addition.dependencies,
                asyncWaitTime: addition.asyncWaitTime || 0,
              })
              // logger.ui.debug('[AmendmentApplicator] Step added successfully, updated workflow:', updatedWorkflow)
              successCount++

              // Trigger UI refresh by updating the store
              const { useTaskStore } = await import('../store/useTaskStore')
              const store = useTaskStore.getState()
              await store.loadTasks()
              await store.loadSequencedTasks()
            } catch (error) {
              logger.ui.error('Failed to add step to workflow:', error)
              Message.error(`Failed to add step "${addition.stepName}" to workflow`)
              errorCount++
            }
          } else {
            Message.warning(`Cannot add step to ${addition.workflowTarget.name} - workflow not found`)
            errorCount++
          }
          break
        }

        case AmendmentType.StepRemoval:
          // TODO: Implement step removal
          logger.ui.debug('TODO: Step removal not yet implemented', amendment)
          Message.info('Step removal not yet implemented')
          break

        case AmendmentType.DependencyChange: {
          const change = amendment as DependencyChange
          logger.ui.info('Processing dependency change:', change)

          if (change.target.id) {
            try {
              if (change.stepName) {
                // This is a workflow step dependency change
                logger.ui.info(`Updating dependencies for workflow step: ${change.stepName}`)

                // Get the workflow
                const workflow = await db.getSequencedTaskById(change.target.id)
                if (workflow && workflow.steps) {
                  // Find the step
                  const stepIndex = workflow.steps.findIndex(s =>
                    s.name.toLowerCase() === change.stepName.toLowerCase(),
                  )

                  if (stepIndex !== -1) {
                    const step = workflow.steps[stepIndex]
                    let currentDeps = step.dependsOn || []

                    // Add new dependencies
                    if (change.addDependencies && change.addDependencies.length > 0) {
                      // Filter out any that are already there
                      const toAdd = change.addDependencies.filter(d => !currentDeps.includes(d))
                      currentDeps = [...currentDeps, ...toAdd]
                      logger.ui.info(`Adding dependencies to step ${step.name}:`, toAdd)
                    }

                    // Remove dependencies
                    if (change.removeDependencies && change.removeDependencies.length > 0) {
                      currentDeps = currentDeps.filter(d => !change.removeDependencies!.includes(d))
                      logger.ui.info(`Removing dependencies from step ${step.name}:`, change.removeDependencies)
                    }

                    // Update the step
                    workflow.steps[stepIndex] = {
                      ...step,
                      dependsOn: currentDeps,
                    }

                    // Save the workflow
                    await db.updateSequencedTask(change.target.id, { steps: workflow.steps })
                    successCount++
                    logger.ui.info(`Successfully updated dependencies for step ${step.name}`)
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
                      const toAdd = change.addDependencies.filter(d => !currentDeps.includes(d))
                      currentDeps = [...currentDeps, ...toAdd]
                      logger.ui.info('Adding dependencies to workflow:', toAdd)
                    }

                    if (change.removeDependencies && change.removeDependencies.length > 0) {
                      currentDeps = currentDeps.filter(d => !change.removeDependencies!.includes(d))
                      logger.ui.info('Removing dependencies from workflow:', change.removeDependencies)
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
                      const toAdd = change.addDependencies.filter(d => !currentDeps.includes(d))
                      currentDeps = [...currentDeps, ...toAdd]
                      logger.ui.info('Adding dependencies to task:', toAdd)
                    }

                    if (change.removeDependencies && change.removeDependencies.length > 0) {
                      currentDeps = currentDeps.filter(d => !change.removeDependencies!.includes(d))
                      logger.ui.info('Removing dependencies from task:', change.removeDependencies)
                    }

                    await db.updateTask(change.target.id, { dependencies: currentDeps })
                    successCount++
                  }
                }
              }
            } catch (error) {
              logger.ui.error('Failed to update dependencies:', error)
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
          logger.ui.info('Creating task from amendment:', creation)

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
          }

          await db.createTask(taskData)
          successCount++
          logger.ui.info('Task created successfully:', creation.name)
          break
        }

        case AmendmentType.WorkflowCreation: {
          const creation = amendment as WorkflowCreation
          logger.ui.info('Creating workflow from amendment:', creation)

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
            completedCumulativeMinutes: 0,
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
              completed: false,
              completedCumulativeMinutes: 0,
              status: 'pending' as const,
              stepIndex: index,
              percentComplete: 0,
            })),
            hasSteps: true as const,
            overallStatus: TaskStatus.NotStarted,
          }

          await db.createSequencedTask(workflowData)
          successCount++
          logger.ui.info('Workflow created successfully:', creation.name)
          break
        }

        default: {
          // This will cause a compile-time error if we miss any enum values
          const _exhaustiveCheck: never = amendment
          assertNever(_exhaustiveCheck)
        }
      }
    } catch (error) {
      logger.ui.error('Error applying amendment:', error)
      errorCount++
    }
  }

  if (successCount > 0) {
    Message.success(`Applied ${successCount} amendment${successCount !== 1 ? 's' : ''}`)
  }
  if (errorCount > 0) {
    Message.error(`Failed to apply ${errorCount} amendment${errorCount !== 1 ? 's' : ''}`)
  }
}
