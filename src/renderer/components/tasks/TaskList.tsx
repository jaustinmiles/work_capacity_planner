import React from 'react'
import { useTaskStore } from '../../store/useTaskStore'
import { TaskItem } from './TaskItem'

export function TaskList() {
  const { tasks } = useTaskStore()
  
  const incompleteTasks = tasks.filter(task => !task.completed)
  const completedTasks = tasks.filter(task => task.completed)
  
  // Sort incomplete tasks by priority (importance * urgency)
  const sortedIncompleteTasks = [...incompleteTasks].sort((a, b) => {
    const priorityA = a.importance * a.urgency
    const priorityB = b.importance * b.urgency
    return priorityB - priorityA
  })
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Active Tasks ({incompleteTasks.length})</h2>
        {sortedIncompleteTasks.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No active tasks. Add one to get started!</p>
        ) : (
          <div className="space-y-2">
            {sortedIncompleteTasks.map(task => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
      
      {completedTasks.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-600">
            Completed Tasks ({completedTasks.length})
          </h2>
          <div className="space-y-2">
            {completedTasks.map(task => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}