import { describe, it, expect } from 'vitest'
import { SessionManager } from './SessionManager'

describe('SessionManager', () => {
  it('should be defined', () => {
    expect(SessionManager).toBeDefined()
  })

  it('should be a function component', () => {
    expect(typeof SessionManager).toBe('function')
  })
})
