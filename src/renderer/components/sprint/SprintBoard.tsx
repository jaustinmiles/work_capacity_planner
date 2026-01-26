/**
 * SprintBoard
 *
 * Main Kanban-style board for sprint management.
 * Three columns: Backlog | Sprint | Completed
 *
 * Drag and drop between columns to:
 * - Move from Backlog → Sprint: Sets inActiveSprint: true
 * - Move from Sprint → Backlog: Sets inActiveSprint: false
 * - Move to Completed: Marks task as completed
 */

import React, { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Typography, Space, Switch, Alert } from '@arco-design/web-react'
import { IconThunderbolt } from '@arco-design/web-react/icon'
import { SprintColumn, type SprintColumnId } from './SprintColumn'
import { SprintTaskCard } from './SprintTaskCard'
import { useTaskStore } from '../../store/useTaskStore'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { Message } from '../common/Message'
import { logger } from '@/logger'
import type { Task } from '@shared/types'

const { Title, Text } = Typography

export function SprintBoard(): React.ReactElement {
  const { isMobile } = useResponsive()

  const {
    tasks,
    sprintModeEnabled,
    setSprintModeEnabled,
    addTaskToSprint,
    removeTaskFromSprint,
    toggleTaskComplete,
  } = useTaskStore()

  // Active drag state
  const [activeId, setActiveId] = useState<string | null>(null)

  // Configure sensors for pointer and keyboard interaction
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before starting drag
      },
    }),
    useSensor(KeyboardSensor),
  )

  // Log when tasks change from the store
  logger.ui.info(`SprintBoard render: ${tasks.length} tasks from store`, {}, 'sprint-board-render')

  // Categorize tasks by column directly from store tasks
  const { backlogTasks, sprintTasks, completedTasks } = useMemo(() => {
    const backlog: Task[] = []
    const sprint: Task[] = []
    const completed: Task[] = []

    for (const task of tasks) {
      if (task.archived) continue // Skip archived tasks

      if (task.completed) {
        completed.push(task)
      } else if (task.inActiveSprint) {
        sprint.push(task)
      } else {
        backlog.push(task)
      }
    }

    // Sort by priority (importance × urgency) descending
    const sortByPriority = (a: Task, b: Task): number =>
      (b.importance * b.urgency) - (a.importance * a.urgency)

    backlog.sort(sortByPriority)
    sprint.sort(sortByPriority)
    completed.sort((a, b) => {
      // Sort completed by completion date, most recent first
      const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return dateB - dateA
    })

    logger.ui.info(`SprintBoard categorized: backlog=${backlog.length}, sprint=${sprint.length}, completed=${completed.length}`, {}, 'sprint-board-render')

    return { backlogTasks: backlog, sprintTasks: sprint, completedTasks: completed.slice(0, 10) }
  }, [tasks])

  // Use tasks directly for lookups (removed allItems indirection)
  const allItems = tasks

  // Find which column a task belongs to
  const findTaskColumn = useCallback((taskId: string): SprintColumnId | null => {
    if (backlogTasks.some(t => t.id === taskId)) return 'backlog'
    if (sprintTasks.some(t => t.id === taskId)) return 'sprint'
    if (completedTasks.some(t => t.id === taskId)) return 'completed'
    return null
  }, [backlogTasks, sprintTasks, completedTasks])

  // Get the active task being dragged
  const activeTask = useMemo((): Task | undefined => {
    if (!activeId) return undefined
    return allItems.find(t => t.id === activeId)
  }, [activeId, allItems])

  // Handle drag start
  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(event.active.id as string)
  }

  // Handle drag end - update task state based on destination column
  const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const taskId = active.id as string
    const sourceColumn = findTaskColumn(taskId)

    // Log raw event data for debugging with explicit strings
    const overIdStr = String(over.id)
    const activeIdStr = String(active.id)
    logger.ui.info(`Sprint drag: active=${activeIdStr}, over=${overIdStr}, source=${sourceColumn}`, {}, 'sprint-board-drag-debug')

    // Determine destination column
    // The 'over' could be a column ID or another task ID
    let destColumn: SprintColumnId
    if (['backlog', 'sprint', 'completed'].includes(overIdStr)) {
      destColumn = overIdStr as SprintColumnId
      logger.ui.info(`Dropped directly on column: ${destColumn}`, {}, 'sprint-board-drag-debug')
    } else {
      // Dropped on a task - find its column by checking which list contains it
      const overTask = allItems.find(t => t.id === overIdStr)
      if (!overTask) {
        logger.ui.info(`Over task not found: ${overIdStr}`, {}, 'sprint-board-drag-debug')
        return
      }

      // Determine column based on task's state
      let overColumn: SprintColumnId
      if (overTask.completed) {
        overColumn = 'completed'
      } else if (overTask.inActiveSprint) {
        overColumn = 'sprint'
      } else {
        overColumn = 'backlog'
      }

      logger.ui.info(`Dropped on task ${overTask.name}, task.inActiveSprint=${overTask.inActiveSprint}, resolved column=${overColumn}`, {}, 'sprint-board-drag-debug')
      destColumn = overColumn
    }

    // No change needed if same column
    if (sourceColumn === destColumn) {
      logger.ui.info('Same column, no action needed', { sourceColumn, destColumn }, 'sprint-board-drag-debug')
      return
    }

    const task = allItems.find(t => t.id === taskId)
    if (!task) return

    logger.ui.info('Sprint board drag complete', {
      taskId,
      taskName: task.name,
      from: sourceColumn,
      to: destColumn,
    }, 'sprint-board-drag')

    try {
      // Handle the state change based on source and destination
      if (sourceColumn === 'completed') {
        // Moving OUT of completed - uncomplete first
        await toggleTaskComplete(taskId)

        if (destColumn === 'sprint') {
          await addTaskToSprint(taskId)
          Message.success(`Restored "${task.name}" to sprint`)
        } else {
          // destColumn === 'backlog'
          await removeTaskFromSprint(taskId)
          Message.success(`Restored "${task.name}" to backlog`)
        }
      } else if (destColumn === 'sprint') {
        await addTaskToSprint(taskId)
        Message.success(`Added "${task.name}" to sprint`)
      } else if (destColumn === 'backlog') {
        await removeTaskFromSprint(taskId)
        Message.success(`Moved "${task.name}" to backlog`)
      } else if (destColumn === 'completed') {
        await toggleTaskComplete(taskId)
        Message.success(`Marked "${task.name}" as complete`)
      }
    } catch (error) {
      logger.ui.error('Failed to update task in sprint board', {
        error: error instanceof Error ? error.message : String(error),
        taskId,
        destColumn,
      }, 'sprint-board-error')
      Message.error('Failed to update task')
    }
  }

  // Responsive layout: stack columns on mobile
  const columnDirection = isMobile ? 'column' : 'row'
  const columnGap = isMobile ? 16 : 24

  return (
    <div style={{ padding: isMobile ? 0 : 8 }}>
      {/* Header with Sprint Mode Toggle */}
      <div style={{
        marginBottom: 20,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div>
          <Title heading={4} style={{ margin: 0 }}>
            <IconThunderbolt style={{ marginRight: 8, color: '#165DFF' }} />
            Sprint Board
          </Title>
          <Text type="secondary" style={{ marginTop: 4, display: 'block' }}>
            Drag tasks between columns to manage your sprint
          </Text>
        </div>

        <Space>
          <Text>Sprint Mode:</Text>
          <Switch
            checked={sprintModeEnabled}
            onChange={setSprintModeEnabled}
            checkedText="On"
            uncheckedText="Off"
          />
        </Space>
      </div>

      {/* Sprint Mode Alert */}
      {sprintModeEnabled && (
        <Alert
          type="info"
          content="Sprint mode is active. Only tasks in the Sprint column will appear in your schedule and timeline."
          style={{ marginBottom: 20 }}
          showIcon
          closable
        />
      )}

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: columnDirection,
            gap: columnGap,
            alignItems: 'stretch',
          }}
        >
          <SprintColumn
            id="backlog"
            title="Backlog"
            tasks={backlogTasks}
            activeId={activeId}
          />
          <SprintColumn
            id="sprint"
            title="Sprint"
            tasks={sprintTasks}
            activeId={activeId}
          />
          <SprintColumn
            id="completed"
            title="Completed"
            tasks={completedTasks}
            activeId={activeId}
          />
        </div>

        {/* Drag overlay - shows the card being dragged */}
        <DragOverlay>
          {activeTask ? (
            <SprintTaskCard task={activeTask} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
