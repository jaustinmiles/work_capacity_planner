import { describe, it, expect } from 'vitest'
import { GanttChart } from './GanttChart'

describe('GanttChart', () => {
  it('should be defined', () => {
    expect(GanttChart).toBeDefined()
  })

  it('should be a function component', () => {
    expect(typeof GanttChart).toBe('function')
  })

  it('should have proper display name', () => {
    expect(GanttChart.name).toBe('GanttChart')
  })
})