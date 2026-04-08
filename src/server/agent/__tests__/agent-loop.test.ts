/**
 * Tests for agent loop approval mechanism
 *
 * Tests the pendingApprovals map and resolveApproval function
 * which form the bridge between the SSE-based agent loop
 * and the tRPC approve/reject endpoints.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pendingApprovals, resolveApproval } from '../agent-loop'

describe('agent loop approval mechanism', () => {
  beforeEach(() => {
    pendingApprovals.clear()
  })

  describe('resolveApproval', () => {
    it('should resolve a pending approval with "approved"', () => {
      const mockResolve = vi.fn()
      pendingApprovals.set('proposal-1', {
        resolve: mockResolve,
        toolName: 'create_task',
        toolInput: { name: 'Test' },
        createdAt: Date.now(),
      })

      const result = resolveApproval('proposal-1', 'approved')

      expect(result).toBe(true)
      expect(mockResolve).toHaveBeenCalledWith('approved')
      expect(pendingApprovals.has('proposal-1')).toBe(false)
    })

    it('should resolve a pending approval with "rejected"', () => {
      const mockResolve = vi.fn()
      pendingApprovals.set('proposal-2', {
        resolve: mockResolve,
        toolName: 'update_task',
        toolInput: { id: 'task-1' },
        createdAt: Date.now(),
      })

      const result = resolveApproval('proposal-2', 'rejected')

      expect(result).toBe(true)
      expect(mockResolve).toHaveBeenCalledWith('rejected')
      expect(pendingApprovals.has('proposal-2')).toBe(false)
    })

    it('should return false for unknown proposal IDs', () => {
      const result = resolveApproval('nonexistent', 'approved')
      expect(result).toBe(false)
    })

    it('should not resolve the same proposal twice', () => {
      const mockResolve = vi.fn()
      pendingApprovals.set('proposal-3', {
        resolve: mockResolve,
        toolName: 'create_task',
        toolInput: {},
        createdAt: Date.now(),
      })

      resolveApproval('proposal-3', 'approved')
      const secondResult = resolveApproval('proposal-3', 'rejected')

      expect(secondResult).toBe(false)
      expect(mockResolve).toHaveBeenCalledTimes(1)
      expect(mockResolve).toHaveBeenCalledWith('approved')
    })
  })

  describe('pendingApprovals map', () => {
    it('should track multiple concurrent proposals', () => {
      pendingApprovals.set('p1', {
        resolve: vi.fn(),
        toolName: 'create_task',
        toolInput: { name: 'Task A' },
        createdAt: Date.now(),
      })
      pendingApprovals.set('p2', {
        resolve: vi.fn(),
        toolName: 'update_task',
        toolInput: { id: 'task-1' },
        createdAt: Date.now(),
      })

      expect(pendingApprovals.size).toBe(2)

      resolveApproval('p1', 'approved')
      expect(pendingApprovals.size).toBe(1)

      resolveApproval('p2', 'rejected')
      expect(pendingApprovals.size).toBe(0)
    })
  })
})
