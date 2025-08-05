import React from 'react'
import { useTaskStore } from '../../store/useTaskStore'

export function WeeklyCalendar() {
  const { tasks } = useTaskStore()
  const incompleteTasks = tasks.filter(task => !task.completed)
  
  // Calculate total work capacity needed
  const totalFocusedMinutes = incompleteTasks
    .filter(task => task.type === 'focused')
    .reduce((sum, task) => sum + task.duration, 0)
  
  const totalAdminMinutes = incompleteTasks
    .filter(task => task.type === 'admin')
    .reduce((sum, task) => sum + task.duration, 0)
  
  const focusedHours = Math.floor(totalFocusedMinutes / 60)
  const focusedMins = totalFocusedMinutes % 60
  
  const adminHours = Math.floor(totalAdminMinutes / 60)
  const adminMins = totalAdminMinutes % 60
  
  // Calculate days needed (4 hours focused + 3 hours admin per day)
  const daysNeeded = Math.ceil(Math.max(
    totalFocusedMinutes / 240, // 4 hours = 240 minutes
    totalAdminMinutes / 180    // 3 hours = 180 minutes
  ))
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">Weekly Calendar</h2>
      
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium text-blue-900 mb-2">Workload Summary</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-blue-700">Focused Work:</p>
            <p className="font-semibold text-blue-900">
              {focusedHours}h {focusedMins > 0 && `${focusedMins}m`}
            </p>
          </div>
          <div>
            <p className="text-blue-700">Admin/Meetings:</p>
            <p className="font-semibold text-blue-900">
              {adminHours}h {adminMins > 0 && `${adminMins}m`}
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-blue-200">
          <p className="text-blue-700">Estimated days to complete:</p>
          <p className="font-semibold text-blue-900">{daysNeeded} working days</p>
        </div>
      </div>
      
      <div className="text-center py-12 text-gray-500">
        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-lg font-medium mb-2">Calendar View Coming Soon</p>
        <p className="text-sm">
          This will show your tasks scheduled across the week based on available capacity.
        </p>
      </div>
    </div>
  )
}