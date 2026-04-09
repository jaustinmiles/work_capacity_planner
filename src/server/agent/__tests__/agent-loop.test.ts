/**
 * Tests for agent loop approval mechanism
 *
 * Tests the pendingApprovals map and resolveApproval function
 * which form the bridge between the SSE-based agent loop
 * and the tRPC approve/reject endpoints.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pendingApprovals, resolveApproval } from '../agent-loop'
import { ApprovalDecision } from '../../../shared/enums'

describe('agent loop approval mechanism', () => {
  beforeEach(() => {
    pendingApprovals.clear()
  })

  describe('resolveApproval', () => {
    it('should resolve a pending approval with Approved', () => {
      const mockResolve = vi.fn()
      pendingApprovals.set('proposal-1', {
        resolve: mockResolve,
        toolName: 'create_task',
        toolInput: { name: 'Test' },
        createdAt: Date.now(),
      })

      const result = resolveApproval('proposal-1', ApprovalDecision.Approved)

      expect(result).toBe(true)
      expect(mockResolve).toHaveBeenCalledWith(ApprovalDecision.Approved)
      expect(pendingApprovals.has('proposal-1')).toBe(false)
    })

    it('should resolve a pending approval with Rejected', () => {
      const mockResolve = vi.fn()
      pendingApprovals.set('proposal-2', {
        resolve: mockResolve,
        toolName: 'update_task',
        toolInput: { id: 'task-1' },
        createdAt: Date.now(),
      })

      const result = resolveApproval('proposal-2', ApprovalDecision.Rejected)

      expect(result).toBe(true)
      expect(mockResolve).toHaveBeenCalledWith(ApprovalDecision.Rejected)
      expect(pendingApprovals.has('proposal-2')).toBe(false)
    })

    it('should return false for unknown proposal IDs', () => {
      const result = resolveApproval('nonexistent', ApprovalDecision.Approved)
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

      resolveApproval('proposal-3', ApprovalDecision.Approved)
      const secondResult = resolveApproval('proposal-3', ApprovalDecision.Rejected)

      expect(secondResult).toBe(false)
      expect(mockResolve).toHaveBeenCalledTimes(1)
      expect(mockResolve).toHaveBeenCalledWith(ApprovalDecision.Approved)
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

      resolveApproval('p1', ApprovalDecision.Approved)
      expect(pendingApprovals.size).toBe(1)

      resolveApproval('p2', ApprovalDecision.Rejected)
      expect(pendingApprovals.size).toBe(0)
    })
  })
})
