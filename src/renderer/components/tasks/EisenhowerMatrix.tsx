import React from 'react'
import { useTaskStore } from '../../store/useTaskStore'
import { Task } from '@shared/types'

export function EisenhowerMatrix() {
  const { tasks, selectTask } = useTaskStore()
  
  // Only show incomplete tasks in the matrix
  const incompleteTasks = tasks.filter(task => !task.completed)
  
  // Categorize tasks into quadrants
  const categorizeTask = (task: Task) => {
    if (task.importance >= 7 && task.urgency >= 7) return 'do-first'
    if (task.importance >= 7 && task.urgency < 7) return 'schedule'
    if (task.importance < 7 && task.urgency >= 7) return 'delegate'
    return 'eliminate'
  }
  
  const quadrants = {
    'do-first': incompleteTasks.filter(task => categorizeTask(task) === 'do-first'),
    'schedule': incompleteTasks.filter(task => categorizeTask(task) === 'schedule'),
    'delegate': incompleteTasks.filter(task => categorizeTask(task) === 'delegate'),
    'eliminate': incompleteTasks.filter(task => categorizeTask(task) === 'eliminate'),
  }
  
  const quadrantInfo = {
    'do-first': {
      title: 'Do First',
      subtitle: 'Important & Urgent',
      color: 'bg-red-50 border-red-200',
      textColor: 'text-red-700',
    },
    'schedule': {
      title: 'Schedule',
      subtitle: 'Important & Not Urgent',
      color: 'bg-blue-50 border-blue-200',
      textColor: 'text-blue-700',
    },
    'delegate': {
      title: 'Delegate',
      subtitle: 'Not Important & Urgent',
      color: 'bg-yellow-50 border-yellow-200',
      textColor: 'text-yellow-700',
    },
    'eliminate': {
      title: 'Eliminate',
      subtitle: 'Not Important & Not Urgent',
      color: 'bg-gray-50 border-gray-200',
      textColor: 'text-gray-700',
    },
  }
  
  const TaskCard = ({ task }: { task: Task }) => (
    <div
      className="p-2 bg-white rounded shadow-sm cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => selectTask(task.id)}
    >
      <h4 className="text-sm font-medium truncate">{task.name}</h4>
      <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
        <span>{task.duration}m</span>
        <span className="capitalize">{task.type}</span>
      </div>
    </div>
  )
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Eisenhower Matrix</h2>
      
      <div className="grid grid-cols-2 gap-4 h-[600px]">
        {/* Axis labels */}
        <div className="col-span-2 text-center mb-2">
          <span className="text-sm font-medium text-gray-600">← Less Urgent → More Urgent →</span>
        </div>
        
        <div className="row-span-2 flex items-center -ml-8">
          <span className="text-sm font-medium text-gray-600 -rotate-90 whitespace-nowrap">
            ← Less Important → More Important →
          </span>
        </div>
        
        {/* Quadrants */}
        <div className="grid grid-cols-2 gap-4 col-span-1 row-span-2">
          {(['schedule', 'do-first', 'eliminate', 'delegate'] as const).map((quadrant) => {
            const info = quadrantInfo[quadrant]
            const tasks = quadrants[quadrant]
            
            return (
              <div
                key={quadrant}
                className={`border-2 rounded-lg p-4 ${info.color} overflow-y-auto`}
              >
                <div className="mb-3">
                  <h3 className={`font-semibold ${info.textColor}`}>{info.title}</h3>
                  <p className="text-xs text-gray-600">{info.subtitle}</p>
                </div>
                
                <div className="space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No tasks</p>
                  ) : (
                    tasks.map(task => <TaskCard key={task.id} task={task} />)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      <div className="mt-4 text-sm text-gray-600">
        <p>Tasks are categorized based on their importance and urgency scores (7+ is considered high).</p>
      </div>
    </div>
  )
}