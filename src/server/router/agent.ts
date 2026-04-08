/**
 * Agent Router
 *
 * tRPC router for agent approval/rejection endpoints.
 * The main chat endpoint is a raw Express SSE handler (see agent-chat-handler.ts)
 * because tRPC v10 doesn't natively support SSE streaming.
 */

import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { resolveApproval } from '../agent/agent-loop'

export const agentRouter = router({
  /**
   * Approve a pending write tool proposal.
   * Called when the user clicks "Apply" on a ProposedActionCard.
   */
  approveAction: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(({ input }) => {
      const resolved = resolveApproval(input.proposalId, 'approved')
      return { resolved }
    }),

  /**
   * Reject a pending write tool proposal.
   * Called when the user clicks "Skip" on a ProposedActionCard.
   */
  rejectAction: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(({ input }) => {
      const resolved = resolveApproval(input.proposalId, 'rejected')
      return { resolved }
    }),
})

export type AgentRouter = typeof agentRouter
