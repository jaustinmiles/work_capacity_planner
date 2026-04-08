/**
 * Agent Types
 *
 * Shared type definitions for the AI agent system.
 * Used by both server (agent loop) and renderer (stream handler, UI).
 */

// ============================================================================
// SSE Event Types — server emits these, client consumes them
// ============================================================================

/**
 * Text content streaming from Claude's response
 */
export interface AgentTextDeltaEvent {
  type: 'text_delta'
  content: string
}

/**
 * Agent is executing a read tool (informational, shown as inline indicator)
 */
export interface AgentToolStatusEvent {
  type: 'tool_status'
  toolName: string
  toolCallId: string
  status: 'executing' | 'completed' | 'error'
  /** Human-readable label like "Checking your tasks..." */
  label: string
  /** Duration in ms (set on 'completed' status) */
  durationMs?: number
}

/**
 * Agent wants to execute a write tool — needs user approval
 */
export interface AgentProposedActionEvent {
  type: 'proposed_action'
  proposalId: string
  toolName: string
  toolInput: Record<string, unknown>
  preview: ActionPreview
}

/**
 * Result of a user-approved or user-rejected action
 */
export interface AgentActionResultEvent {
  type: 'action_result'
  proposalId: string
  status: 'applied' | 'rejected' | 'error' | 'timeout'
  /** Result data from the executed tool (on 'applied') */
  result?: unknown
  /** Error message (on 'error') */
  error?: string
}

/**
 * Agent has finished its response
 */
export interface AgentDoneEvent {
  type: 'done'
  /** Total tool calls made in this turn */
  toolCallCount: number
  /** Total API round-trips in the agentic loop */
  loopIterations: number
}

/**
 * Error in the agent loop
 */
export interface AgentErrorEvent {
  type: 'error'
  message: string
  code?: string
}

/**
 * Union of all SSE event types the agent can emit
 */
export type AgentSSEEvent =
  | AgentTextDeltaEvent
  | AgentToolStatusEvent
  | AgentProposedActionEvent
  | AgentActionResultEvent
  | AgentDoneEvent
  | AgentErrorEvent

// ============================================================================
// Action Preview — human-readable description of a proposed write operation
// ============================================================================

export interface ActionPreview {
  /** Short title like "Create Task" */
  title: string
  /** One-line summary like '"Review Q4 numbers" — 60min, importance 7' */
  description: string
  /** Structured details for the UI to render */
  details: Record<string, unknown>
}

// ============================================================================
// Tool Classification
// ============================================================================

/** Read tools execute immediately; write tools require user approval */
export type ToolCategory = 'read' | 'write'

export interface ToolRegistration {
  name: string
  category: ToolCategory
  /** Human-readable label shown in UI during execution */
  statusLabel: string
}

// ============================================================================
// Agent Chat Types
// ============================================================================

export interface AgentChatInput {
  userMessage: string
  conversationId: string
}

export interface AgentApprovalInput {
  proposalId: string
}

/**
 * Stored record of a tool call within a conversation message.
 * Persisted alongside chat messages for conversation history.
 */
export interface StoredToolCall {
  toolCallId: string
  toolName: string
  toolInput: Record<string, unknown>
  category: ToolCategory
  /** For write tools: the approval status */
  approvalStatus?: 'approved' | 'rejected' | 'timeout'
  /** The result returned by the tool (truncated for storage) */
  result?: unknown
  /** Error if the tool failed */
  error?: string
}

/**
 * Agent message format for conversation persistence.
 * Extends the existing ChatMessage model with tool call data.
 */
export interface AgentMessageRecord {
  role: 'user' | 'assistant'
  content: string
  /** Tool calls made during this assistant message */
  toolCalls?: StoredToolCall[]
}
