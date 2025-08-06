import { Task } from '@shared/types'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'

export interface ScheduledItem {
  id: string
  name: string
  type: 'task' | 'workflow-step' | 'async-wait'
  priority: number
  duration: number
  startTime: Date
  endTime: Date
  color: string
  workflowId?: string
  workflowName?: string
  stepIndex?: number
  isWaitTime?: boolean
  originalItem: Task | TaskStep
}

interface WorkItem {
  id: string
  name: string
  type: 'task' | 'workflow-step'
  priority: number
  duration: number
  asyncWaitTime: number
  color: string
  workflowId?: string
  workflowName?: string
  stepIndex?: number
  dependencies?: string[]
  originalItem: Task | TaskStep
}

export function scheduleItems(
  tasks: Task[],
  sequencedTasks: SequencedTask[],
  startTime: Date = new Date()
): ScheduledItem[] {
  const scheduledItems: ScheduledItem[] = []
  const workItems: WorkItem[] = []
  const completedSteps = new Set<string>()
  const asyncWaitEndTimes = new Map<Date, string>() // When async waits end
  
  // Convert all incomplete tasks to work items
  tasks
    .filter(task => !task.completed)
    .forEach(task => {
      workItems.push({
        id: task.id,
        name: task.name,
        type: 'task',
        priority: task.importance * task.urgency,
        duration: task.duration,
        asyncWaitTime: task.asyncWaitTime,
        color: '#6B7280',
        originalItem: task,
      })
    })
  
  // Convert all workflow steps to work items
  sequencedTasks
    .filter(workflow => workflow.overallStatus !== 'completed')
    .forEach((workflow, wIndex) => {
      const workflowColor = `hsl(${wIndex * 60}, 70%, 50%)`
      
      workflow.steps
        .filter(step => step.status !== 'completed')
        .forEach((step, stepIndex) => {
          workItems.push({
            id: step.id,
            name: `[${workflow.name}] ${step.name}`,
            type: 'workflow-step',
            priority: workflow.importance * workflow.urgency,
            duration: step.duration,
            asyncWaitTime: step.asyncWaitTime,
            color: workflowColor,
            workflowId: workflow.id,
            workflowName: workflow.name,
            stepIndex,
            dependencies: step.dependsOn,
            originalItem: step,
          })
        })
    })
  
  // Sort work items by priority (highest first)
  workItems.sort((a, b) => b.priority - a.priority)
  
  // Schedule items
  let currentTime = new Date(startTime)
  currentTime.setHours(9, 0, 0, 0) // Start at 9 AM
  
  while (workItems.length > 0) {
    // Check if any async waits are completing
    const finishedWaits: Date[] = []
    for (const [endTime, itemId] of asyncWaitEndTimes.entries()) {
      if (endTime <= currentTime) {
        completedSteps.add(itemId)
        finishedWaits.push(endTime)
      }
    }
    finishedWaits.forEach(time => asyncWaitEndTimes.delete(time))
    
    // Find next schedulable item
    let scheduled = false
    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i]
      
      // Check if dependencies are met (for workflow steps)
      if (item.dependencies && item.dependencies.length > 0) {
        const allDependenciesMet = item.dependencies.every(dep => 
          completedSteps.has(dep) || 
          // Also check if it's a step reference
          (dep.startsWith('step-') && item.workflowId && 
           completedSteps.has(`${item.workflowId}-step-${dep.replace('step-', '')}`)
          )
        )
        if (!allDependenciesMet) continue
      }
      
      // Schedule this item
      const endTime = new Date(currentTime.getTime() + item.duration * 60000)
      
      scheduledItems.push({
        id: item.id,
        name: item.name,
        type: item.type,
        priority: item.priority,
        duration: item.duration,
        startTime: new Date(currentTime),
        endTime: endTime,
        color: item.color,
        workflowId: item.workflowId,
        workflowName: item.workflowName,
        stepIndex: item.stepIndex,
        originalItem: item.originalItem,
      })
      
      // If item has async wait time, schedule it
      if (item.asyncWaitTime > 0) {
        const asyncEndTime = new Date(endTime.getTime() + item.asyncWaitTime * 60000)
        asyncWaitEndTimes.set(asyncEndTime, item.id)
        
        // Add visual indicator for async wait
        scheduledItems.push({
          id: `${item.id}-wait`,
          name: `⏳ Waiting: ${item.name}`,
          type: 'async-wait',
          priority: item.priority,
          duration: item.asyncWaitTime,
          startTime: endTime,
          endTime: asyncEndTime,
          color: item.color,
          workflowId: item.workflowId,
          workflowName: item.workflowName,
          isWaitTime: true,
          originalItem: item.originalItem,
        })
      } else {
        // Mark as completed immediately if no wait time
        completedSteps.add(item.id)
        if (item.workflowId && item.stepIndex !== undefined) {
          completedSteps.add(`${item.workflowId}-step-${item.stepIndex}`)
        }
      }
      
      // Remove from work items
      workItems.splice(i, 1)
      scheduled = true
      
      // Move time forward
      currentTime = endTime
      
      // Check for lunch break (12-1 PM)
      const hour = currentTime.getHours()
      if (hour === 12) {
        currentTime.setHours(13, 0, 0, 0)
      }
      
      // Check for end of day (6 PM)
      if (hour >= 18) {
        currentTime.setDate(currentTime.getDate() + 1)
        currentTime.setHours(9, 0, 0, 0)
        
        // Skip weekends
        while (currentTime.getDay() === 0 || currentTime.getDay() === 6) {
          currentTime.setDate(currentTime.getDate() + 1)
        }
      }
      
      break
    }
    
    // If nothing was scheduled, advance time to next async completion or next morning
    if (!scheduled) {
      if (asyncWaitEndTimes.size > 0) {
        // Find the earliest async completion
        const earliestCompletion = Math.min(...Array.from(asyncWaitEndTimes.keys()).map(d => d.getTime()))
        currentTime = new Date(earliestCompletion)
      } else {
        // No more items can be scheduled
        break
      }
    }
  }
  
  return scheduledItems
}