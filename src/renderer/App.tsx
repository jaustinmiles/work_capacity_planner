import React, { useState } from 'react'
import { TaskList } from './components/tasks/TaskList'
import { TaskForm } from './components/tasks/TaskForm'
import { EisenhowerMatrix } from './components/tasks/EisenhowerMatrix'
import { WeeklyCalendar } from './components/calendar/WeeklyCalendar'
import { Navigation } from './components/layout/Navigation'

function App() {
  const [activeView, setActiveView] = useState<'tasks' | 'matrix' | 'calendar'>('tasks')
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Work Capacity Planner
          </h1>
        </div>
      </header>
      
      <Navigation activeView={activeView} onViewChange={setActiveView} />
      
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            {activeView === 'tasks' && (
              <>
                <div className="mb-6">
                  <TaskForm />
                </div>
                <TaskList />
              </>
            )}
            
            {activeView === 'matrix' && (
              <>
                <div className="mb-6">
                  <TaskForm />
                </div>
                <EisenhowerMatrix />
              </>
            )}
            
            {activeView === 'calendar' && (
              <WeeklyCalendar />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App