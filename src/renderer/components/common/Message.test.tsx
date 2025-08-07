import { Message } from './Message'
import { vi } from 'vitest'

describe('Message', () => {
  it('should have success method', () => {
    expect(typeof Message.success).toBe('function')
  })

  it('should have error method', () => {
    expect(typeof Message.error).toBe('function')
  })

  it('should have info method', () => {
    expect(typeof Message.info).toBe('function')
  })

  it('should have warning method', () => {
    expect(typeof Message.warning).toBe('function')
  })

  it('should be a wrapper for Arco Message', () => {
    // The Message object should exist and have the expected methods
    expect(Message).toBeDefined()
    expect(Message.success).toBeDefined()
    expect(Message.error).toBeDefined()
    expect(Message.info).toBeDefined()
    expect(Message.warning).toBeDefined()
  })
})
