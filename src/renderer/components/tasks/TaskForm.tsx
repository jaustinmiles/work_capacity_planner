import React, { useState } from 'react'
import { useTaskStore } from '../../store/useTaskStore'

export function TaskForm() {
  const { addTask } = useTaskStore()
  const [isOpen, setIsOpen] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused' as 'focused' | 'admin',
    asyncWaitTime: 0,
    notes: '',
  })
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.name.trim()) {
      addTask({
        ...formData,
        name: formData.name.trim(),
        dependencies: [],
        completed: false,
      })
      
      // Reset form
      setFormData({
        name: '',
        duration: 60,
        importance: 5,
        urgency: 5,
        type: 'focused',
        asyncWaitTime: 0,
        notes: '',
      })
      setIsOpen(false)
    }
  }
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'duration' || name === 'importance' || name === 'urgency' || name === 'asyncWaitTime' 
        ? parseInt(value) || 0 
        : value
    }))
  }
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add New Task
      </button>
    )
  }
  
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">New Task</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Task Name *
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter task name"
          autoFocus
          required
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <select
            id="type"
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="focused">Focused Work</option>
            <option value="admin">Admin/Meetings</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
            Duration (minutes)
          </label>
          <input
            type="number"
            id="duration"
            name="duration"
            value={formData.duration}
            onChange={handleChange}
            min="5"
            step="5"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="importance" className="block text-sm font-medium text-gray-700 mb-1">
            Importance (1-10)
          </label>
          <input
            type="range"
            id="importance"
            name="importance"
            value={formData.importance}
            onChange={handleChange}
            min="1"
            max="10"
            className="w-full"
          />
          <div className="text-center text-sm text-gray-600">{formData.importance}</div>
        </div>
        
        <div>
          <label htmlFor="urgency" className="block text-sm font-medium text-gray-700 mb-1">
            Urgency (1-10)
          </label>
          <input
            type="range"
            id="urgency"
            name="urgency"
            value={formData.urgency}
            onChange={handleChange}
            min="1"
            max="10"
            className="w-full"
          />
          <div className="text-center text-sm text-gray-600">{formData.urgency}</div>
        </div>
      </div>
      
      <div>
        <label htmlFor="asyncWaitTime" className="block text-sm font-medium text-gray-700 mb-1">
          Async Wait Time (minutes)
        </label>
        <input
          type="number"
          id="asyncWaitTime"
          name="asyncWaitTime"
          value={formData.asyncWaitTime}
          onChange={handleChange}
          min="0"
          step="5"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="0"
        />
        <p className="text-xs text-gray-500 mt-1">
          Time to wait for external processes (e.g., CI/CD, reviews)
        </p>
      </div>
      
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Additional details..."
        />
      </div>
      
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Task
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex-1 py-2 px-4 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}