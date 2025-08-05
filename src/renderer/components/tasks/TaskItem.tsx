import React, { useState } from 'react'
import { Task } from '@shared/types'
import { useTaskStore } from '../../store/useTaskStore'

interface TaskItemProps {
  task: Task
}

export function TaskItem({ task }: TaskItemProps) {
  const { toggleTaskComplete, deleteTask, selectTask, updateTask } = useTaskStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(task.name)
  
  const priorityScore = task.importance * task.urgency
  const priorityColor = priorityScore >= 64 ? 'text-red-600' : 
                       priorityScore >= 36 ? 'text-yellow-600' : 
                       'text-green-600'
  
  const handleSave = () => {
    if (editedName.trim()) {
      updateTask(task.id, { name: editedName.trim() })
      setIsEditing(false)
    }
  }
  
  const handleCancel = () => {
    setEditedName(task.name)
    setIsEditing(false)
  }
  
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }
  
  return (
    <div className={`border rounded-lg p-4 mb-2 ${task.completed ? 'bg-gray-50 opacity-75' : 'bg-white'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => toggleTaskComplete(task.id)}
          className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
        />
        
        <div className="flex-1">
          {isEditing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') handleCancel()
                }}
                className="flex-1 px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handleSave}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h3 
              className={`font-medium cursor-pointer hover:text-blue-600 ${task.completed ? 'line-through' : ''}`}
              onClick={() => selectTask(task.id)}
            >
              {task.name}
            </h3>
          )}
          
          <div className="flex gap-4 mt-2 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDuration(task.duration)}
            </span>
            
            <span className={`font-medium ${priorityColor}`}>
              Priority: {priorityScore}
            </span>
            
            <span className="capitalize bg-gray-100 px-2 py-0.5 rounded">
              {task.type}
            </span>
            
            {task.asyncWaitTime > 0 && (
              <span className="flex items-center gap-1 text-orange-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Wait: {formatDuration(task.asyncWaitTime)}
              </span>
            )}
          </div>
          
          {task.notes && (
            <p className="mt-2 text-sm text-gray-600">{task.notes}</p>
          )}
        </div>
        
        <div className="flex gap-2">
          {!task.completed && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 text-gray-500 hover:text-blue-600"
              title="Edit task"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          
          <button
            onClick={() => deleteTask(task.id)}
            className="p-1 text-gray-500 hover:text-red-600"
            title="Delete task"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}