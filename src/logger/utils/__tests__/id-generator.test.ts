import { describe, it, expect } from 'vitest'
import {
  generateCorrelationId,
  generateSessionId,
  generateRequestId,
} from '../id-generator'

describe('id-generator', () => {
  describe('generateCorrelationId', () => {
    it('should generate unique IDs without prefix', () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/)
    })

    it('should include prefix when provided', () => {
      const id = generateCorrelationId('test')

      expect(id).toMatch(/^test-\d+-[a-z0-9]+$/)
    })

    it('should generate IDs with timestamp component', () => {
      const before = Date.now()
      const id = generateCorrelationId()
      const after = Date.now()

      const timestamp = parseInt(id.split('-')[0]!)
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId()
      const id2 = generateSessionId()

      expect(id1).not.toBe(id2)
    })

    it('should start with session- prefix', () => {
      const id = generateSessionId()

      expect(id).toMatch(/^session-\d+-[a-z0-9]+$/)
    })
  })

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId()
      const id2 = generateRequestId()

      expect(id1).not.toBe(id2)
    })

    it('should start with req- prefix', () => {
      const id = generateRequestId()

      expect(id).toMatch(/^req-\d+-[a-z0-9]+$/)
    })
  })
})
