/**
 * Handlers for workflow-related amendments
 */

import type {
  WorkflowCreation,
  StepAddition,
  StepRemoval,
  DependencyChange,
} from '@shared/amendment-types'
import { EntityType, TaskStatus } from '@shared/amendment-types'
import { StepStatus } from '@shared/enums'
import { generateUniqueId, validateWorkflowDependencies } from '@shared/step-id-utils'
import type { HandlerContext } from './types'
import { Message } from '../../components/common/Message'
import { logger } from '@/logger'
import {
  applyForwardDependencyChanges,
  applyReverseDependencyChanges,
} from '../dependency-utils'
import { findStepIndexByName } from './step-utils'
import { resolveTaskType } from './task-type-utils'

export async function handleWorkflowCreation(
  amendment: WorkflowCreation,
  ctx: HandlerContext,
): Promise<void> {
  const totalDuration = amendment.steps.reduce((sum, step) => sum + step.duration, 0)

  // STEP 1: Generate unique IDs for all steps first (name → ID map)
  const stepNameToId = new Map<string, string>()
  amendment.steps.forEach((step) => {
    const stepId = generateUniqueId('step')
    stepNameToId.set(step.name.toLowerCase(), stepId)
  })

  // STEP 2: Build steps with proper ID-based dependencies
  // Track unresolved dependencies to surface warnings to user
  const unresolvedDepsPerStep: Array<{ stepName: string; unresolvedDeps: string[] }> = []

  const steps = amendment.steps.map((step, index) => {
    const stepId = stepNameToId.get(step.name.toLowerCase())
    if (!stepId) {
      throw new Error(`Step ID not found for "${step.name}" - this should not happen`)
    }
    const unresolvedDeps: string[] = []

    // Convert dependency names to IDs
    const dependencyIds = (step.dependsOn || []).map(depName => {
      const depId = stepNameToId.get(depName.toLowerCase())
      if (!depId) {
        unresolvedDeps.push(depName)
        logger.ui.warn(`Dependency "${depName}" not found in workflow "${amendment.name}"`, {
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
    logger.ui.error(`Invalid dependencies in workflow "${amendment.name}"`, {
      errors: validationResult.errors,
    }, 'dependency-validation')
    Message.error(`Workflow "${amendment.name}": ${validationResult.errors[0]}`)
    ctx.markFailed(`Invalid dependencies: ${validationResult.errors[0]}`)
    return
  }

  const workflowData = {
    name: amendment.name,
    notes: amendment.description || '',
    importance: amendment.importance || 5,
    urgency: amendment.urgency || 5,
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

  await ctx.db.createSequencedTask(workflowData)
  Message.success(`Created workflow: ${amendment.name} (${steps.length} steps)`)
}

export async function handleStepAddition(
  amendment: StepAddition,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.workflowTarget.id) {
    try {
      await ctx.db.addStepToWorkflow(amendment.workflowTarget.id, {
        name: amendment.stepName,
        duration: amendment.duration,
        type: amendment.stepType,
        afterStep: amendment.afterStep,
        beforeStep: amendment.beforeStep,
        dependencies: amendment.dependencies,
        asyncWaitTime: amendment.asyncWaitTime || 0,
      })
      // UI refresh will be triggered by DATA_REFRESH_NEEDED event at end of applyAmendments
    } catch (error) {
      logger.ui.error('Failed to add step to workflow', {
        error: error instanceof Error ? error.message : String(error),
        stepName: amendment.stepName,
      }, 'step-add-error')
      Message.error(`Failed to add step "${amendment.stepName}" to workflow`)
      ctx.markFailed(`Failed to add step: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    Message.warning(`Cannot add step to ${amendment.workflowTarget.name} - workflow not found`)
    ctx.markFailed(`Workflow not found: ${amendment.workflowTarget.name}`)
  }
}

export async function handleStepRemoval(
  amendment: StepRemoval,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.workflowTarget.id) {
    try {
      const workflow = await ctx.db.getSequencedTaskById(amendment.workflowTarget.id)
      if (workflow && workflow.steps) {
        const stepIndex = findStepIndexByName(workflow.steps, amendment.stepName)

        if (stepIndex !== -1) {
          const removedStep = workflow.steps[stepIndex]
          if (!removedStep) return // Satisfy noUncheckedIndexedAccess
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

          await ctx.db.updateSequencedTask(amendment.workflowTarget.id, {
            steps: updatedSteps,
            duration: newDuration,
          })

          Message.success(`Removed step "${amendment.stepName}"`)
        } else {
          Message.warning(`Step "${amendment.stepName}" not found in workflow`)
          ctx.markFailed(`Step not found: ${amendment.stepName}`)
        }
      } else {
        Message.warning('Workflow not found or has no steps')
        ctx.markFailed('Workflow not found or has no steps')
      }
    } catch (error) {
      logger.ui.error('Failed to remove step', {
        error: error instanceof Error ? error.message : String(error),
        stepName: amendment.stepName,
      }, 'step-remove-error')
      Message.error(`Failed to remove step "${amendment.stepName}"`)
      ctx.markFailed(`Failed to remove step: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    Message.warning(`Cannot remove step from ${amendment.workflowTarget.name} - workflow not found`)
    ctx.markFailed(`Workflow not found: ${amendment.workflowTarget.name}`)
  }
}

export async function handleDependencyChange(
  amendment: DependencyChange,
  ctx: HandlerContext,
): Promise<void> {
  if (amendment.target.id) {
    try {
      if (amendment.stepName) {
        // This is a workflow step dependency change
        // Capture stepName for use after async calls (TypeScript narrowing doesn't persist)
        const targetStepName = amendment.stepName

        // Get the workflow
        const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
        if (workflow && workflow.steps) {
          // Find the step
          const stepIndex = workflow.steps.findIndex(s =>
            s.name.toLowerCase() === amendment.stepName.toLowerCase(),
          )

          if (stepIndex !== -1) {
            const step = workflow.steps[stepIndex]
            if (!step) return // Satisfy noUncheckedIndexedAccess

            // Apply forward dependency changes using shared utility
            const forwardResult = applyForwardDependencyChanges(step, amendment, workflow.steps)

            // Update the step in the workflow
            workflow.steps[stepIndex] = step

            // Apply reverse dependency changes using shared utility
            const reverseResult = applyReverseDependencyChanges(step, amendment, workflow.steps)

            // Check if any changes were actually made
            const totalChanges = forwardResult.added.length + forwardResult.removed.length +
              reverseResult.added.length + reverseResult.removed.length
            const totalNotFound = forwardResult.notFound.length + reverseResult.notFound.length

            if (totalChanges === 0 && totalNotFound > 0) {
              // Nothing was changed and we have unresolved dependencies
              const notFoundNames = [...forwardResult.notFound, ...reverseResult.notFound]
              Message.warning(`Could not find steps: ${notFoundNames.join(', ')}`)
              ctx.markFailed(`Steps not found: ${notFoundNames.join(', ')}`)
              return
            }

            if (totalChanges === 0) {
              // No changes were made (possibly all dependencies already existed/removed)
              logger.ui.info('No dependency changes needed', { stepName: amendment.stepName })
              // Still show success since this is not an error - dependencies are already as requested
              Message.success(`Dependencies for "${step.name}" already up to date`)
              return
            }

            // Save the workflow with all updates
            const updatedWorkflow = await ctx.db.updateSequencedTask(amendment.target.id, { steps: workflow.steps })

            // VERIFY: Check that the database actually returned a result
            if (!updatedWorkflow) {
              ctx.markFailed(`Database returned no result when updating "${step.name}"`)
              return
            }

            // VERIFY: Find the updated step and check its dependencies
            const updatedStep = updatedWorkflow.steps?.find(s =>
              s.name.toLowerCase() === targetStepName.toLowerCase(),
            )
            if (!updatedStep) {
              ctx.markFailed(`Step "${step.name}" not found after update`)
              return
            }

            // VERIFY: Check that dependsOn actually changed
            const expectedDeps = JSON.stringify([...step.dependsOn].sort())
            let actualDeps = JSON.stringify([...(updatedStep.dependsOn || [])].sort())
            if (expectedDeps !== actualDeps) {
              // Retry once before failing (user preference)
              logger.ui.warn('Step dependencies mismatch on first attempt, retrying...', {
                expected: step.dependsOn,
                actual: updatedStep.dependsOn,
              }, 'dependency-verify-retry')

              const retryWorkflow = await ctx.db.updateSequencedTask(amendment.target.id, { steps: workflow.steps })
              const retryStep = retryWorkflow?.steps?.find(s =>
                s.name.toLowerCase() === targetStepName.toLowerCase(),
              )
              actualDeps = JSON.stringify([...(retryStep?.dependsOn || [])].sort())

              if (expectedDeps !== actualDeps) {
                ctx.markFailed(`Step dependencies were not saved correctly after retry. Expected: ${step.dependsOn.join(', ')}, Got: ${retryStep?.dependsOn?.join(', ') || 'none'}`)
                return
              }
            }

            Message.success(`Updated dependencies for "${step.name}"`)
          } else {
            Message.warning(`Step "${amendment.stepName}" not found in workflow`)
            ctx.markFailed(`Step not found: ${amendment.stepName}`)
          }
        } else {
          Message.warning(`Workflow ${amendment.target.name} not found or has no steps`)
          ctx.markFailed(`Workflow not found or has no steps: ${amendment.target.name}`)
        }
      } else {
        // This is a task/workflow level dependency change
        // First, build a set of valid entity IDs for validation
        const allTasks = await ctx.db.getTasks()
        const allWorkflows = await ctx.db.getSequencedTasks()
        const validEntityIds = new Set<string>([
          ...allTasks.map(t => t.id),
          ...allWorkflows.map(w => w.id),
          ...allWorkflows.flatMap(w => w.steps?.map(s => s.id) || []),
          ...Array.from(ctx.createdTaskMap.values()), // Include newly created tasks
        ])

        // Validate dependencies before applying
        const validateDependencyIds = (depIds: string[]): { valid: string[]; invalid: string[] } => {
          const valid: string[] = []
          const invalid: string[] = []
          for (const depId of depIds) {
            // Resolve from createdTaskMap first (for batch-created tasks)
            const resolvedId = ctx.createdTaskMap.get(depId) || depId
            if (validEntityIds.has(resolvedId)) {
              valid.push(resolvedId)
            } else {
              invalid.push(depId)
            }
          }
          return { valid, invalid }
        }

        if (amendment.target.type === EntityType.Workflow) {
          // Update workflow dependencies
          const workflow = await ctx.db.getSequencedTaskById(amendment.target.id)
          if (workflow) {
            const originalDeps = [...(workflow.dependencies || [])]
            let currentDeps = workflow.dependencies || []

            if (amendment.addDependencies && amendment.addDependencies.length > 0) {
              const { valid, invalid } = validateDependencyIds(amendment.addDependencies)
              if (invalid.length > 0) {
                Message.warning(`Some dependencies could not be resolved: ${invalid.join(', ')}`)
                logger.ui.warn('Invalid dependencies in workflow update', {
                  workflowId: amendment.target.id,
                  invalid,
                }, 'invalid-dependencies')
              }
              const toAdd = valid.filter(d => !currentDeps.includes(d))
              currentDeps = [...currentDeps, ...toAdd]
            }

            if (amendment.removeDependencies && amendment.removeDependencies.length > 0) {
              const depsToRemove = amendment.removeDependencies
              currentDeps = currentDeps.filter(d => !depsToRemove.includes(d))
            }

            // Check if any changes are needed
            const hasChanges = JSON.stringify(originalDeps.sort()) !== JSON.stringify(currentDeps.sort())
            if (!hasChanges) {
              Message.success(`Dependencies for "${amendment.target.name}" already up to date`)
              return
            }

            const updatedWorkflow = await ctx.db.updateSequencedTask(amendment.target.id, { dependencies: currentDeps })

            // VERIFY: Check that the database actually returned a result
            if (!updatedWorkflow) {
              ctx.markFailed(`Database returned no result when updating "${amendment.target.name}"`)
              return
            }

            // VERIFY: Check that dependencies actually changed
            const expectedDeps = JSON.stringify([...currentDeps].sort())
            let actualDeps = JSON.stringify([...(updatedWorkflow.dependencies || [])].sort())
            if (expectedDeps !== actualDeps) {
              // Retry once before failing (user preference)
              logger.ui.warn('Workflow dependencies mismatch on first attempt, retrying...', {
                expected: currentDeps,
                actual: updatedWorkflow.dependencies,
              }, 'dependency-verify-retry')

              const retryWorkflow = await ctx.db.updateSequencedTask(amendment.target.id, { dependencies: currentDeps })
              actualDeps = JSON.stringify([...(retryWorkflow?.dependencies || [])].sort())

              if (expectedDeps !== actualDeps) {
                ctx.markFailed(`Workflow dependencies were not saved correctly after retry. Expected: ${currentDeps.join(', ')}, Got: ${retryWorkflow?.dependencies?.join(', ') || 'none'}`)
                return
              }
            }

            Message.success(`Updated dependencies for "${amendment.target.name}"`)
          } else {
            ctx.markFailed(`Workflow "${amendment.target.name}" not found`)
          }
        } else {
          // Update task dependencies
          const task = await ctx.db.getTaskById(amendment.target.id)
          if (task) {
            const originalDeps = [...(task.dependencies || [])]
            let currentDeps = task.dependencies || []

            if (amendment.addDependencies && amendment.addDependencies.length > 0) {
              const { valid, invalid } = validateDependencyIds(amendment.addDependencies)
              if (invalid.length > 0) {
                Message.warning(`Some dependencies could not be resolved: ${invalid.join(', ')}`)
                logger.ui.warn('Invalid dependencies in task update', {
                  taskId: amendment.target.id,
                  invalid,
                }, 'invalid-dependencies')
              }
              const toAdd = valid.filter(d => !currentDeps.includes(d))
              currentDeps = [...currentDeps, ...toAdd]
            }

            if (amendment.removeDependencies && amendment.removeDependencies.length > 0) {
              const depsToRemove = amendment.removeDependencies
              currentDeps = currentDeps.filter(d => !depsToRemove.includes(d))
            }

            // Check if any changes are needed
            const hasChanges = JSON.stringify(originalDeps.sort()) !== JSON.stringify(currentDeps.sort())
            if (!hasChanges) {
              Message.success(`Dependencies for "${amendment.target.name}" already up to date`)
              return
            }

            const updatedTask = await ctx.db.updateTask(amendment.target.id, { dependencies: currentDeps })

            // VERIFY: Check that the database actually returned a result
            if (!updatedTask) {
              ctx.markFailed(`Database returned no result when updating "${amendment.target.name}"`)
              return
            }

            // VERIFY: Check that dependencies actually changed
            const expectedDeps = JSON.stringify([...currentDeps].sort())
            let actualDeps = JSON.stringify([...(updatedTask.dependencies || [])].sort())
            if (expectedDeps !== actualDeps) {
              // Retry once before failing (user preference)
              logger.ui.warn('Task dependencies mismatch on first attempt, retrying...', {
                expected: currentDeps,
                actual: updatedTask.dependencies,
              }, 'dependency-verify-retry')

              const retryTask = await ctx.db.updateTask(amendment.target.id, { dependencies: currentDeps })
              actualDeps = JSON.stringify([...(retryTask?.dependencies || [])].sort())

              if (expectedDeps !== actualDeps) {
                ctx.markFailed(`Task dependencies were not saved correctly after retry. Expected: ${currentDeps.join(', ')}, Got: ${retryTask?.dependencies?.join(', ') || 'none'}`)
                return
              }
            }

            Message.success(`Updated dependencies for "${amendment.target.name}"`)
          } else {
            ctx.markFailed(`Task "${amendment.target.name}" not found`)
          }
        }
      }
    } catch (error) {
      logger.ui.error('Failed to update dependencies', {
        error: error instanceof Error ? error.message : String(error),
        targetName: amendment.target.name,
      }, 'dependencies-update-error')
      Message.error(`Failed to update dependencies for ${amendment.target.name}`)
      ctx.markFailed(`Failed to update dependencies: ${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    Message.warning(`Cannot update dependencies for ${amendment.target.name} - not found`)
    ctx.markFailed(`Target not found: ${amendment.target.name}`)
  }
}
