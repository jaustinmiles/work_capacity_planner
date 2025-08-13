import { describe, it, expect } from 'vitest'
import { TaskTimeLoggingModal } from '../TaskTimeLoggingModal'

describe('TaskTimeLoggingModal', () => {
  it('should be defined', () => {
    expect(TaskTimeLoggingModal).toBeDefined()
  })

  it('should be a function component', () => {
    expect(typeof TaskTimeLoggingModal).toBe('function')
  })
})