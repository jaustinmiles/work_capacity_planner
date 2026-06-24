/**
 * QuickChatBar — one-shot AI command input floating over the deep work board.
 *
 * Flow-state companion to the full chat view: the user fires short commands
 * ("create a task X", "make step A not depend on B") and the quick-mode agent
 * (fast model, auto-applied writes, no clarifying back-and-forth) executes
 * them immediately. The board reloads when a command applied changes.
 *
 * All orchestration lives in quick-chat-service; this component renders state.
 */

import { useCallback, useRef, useState } from 'react'
import { Input, Spin } from '@arco-design/web-react'
import { IconThunderbolt } from '@arco-design/web-react/icon'
import { ensureQuickChatConversation, sendQuickCommand } from '../../services/quick-chat-service'
import { useDeepWorkBoardStore } from '../../store/useDeepWorkBoardStore'
import { ActionResultStatus } from '@shared/enums'
import { logger } from '@/logger'

export function QuickChatBar() {
  const loadBoards = useDeepWorkBoardStore((s) => s.loadBoards)

  const [command, setCommand] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [statusLine, setStatusLine] = useState('')

  // Refs survive the SSE callback lifetime without re-rendering per event.
  const conversationIdRef = useRef<string | null>(null)
  const responseRef = useRef('')
  const appliedCountRef = useRef(0)

  const submit = useCallback(async () => {
    const userMessage = command.trim()
    if (!userMessage || isRunning) return

    setCommand('')          // clear immediately so the next command can be typed back-to-back
    setIsRunning(true)
    setStatusLine('')
    responseRef.current = ''
    appliedCountRef.current = 0

    try {
      conversationIdRef.current ??= await ensureQuickChatConversation()
    } catch (error) {
      setIsRunning(false)
      setStatusLine('Quick chat unavailable — check the server connection.')
      logger.ui.error('Quick chat conversation setup failed', { error: String(error) }, 'quick-chat-setup')
      return
    }

    sendQuickCommand(userMessage, conversationIdRef.current, {
      onTextDelta: (content) => {
        responseRef.current += content
        setStatusLine(responseRef.current)
      },
      onToolStatus: () => {},
      onProposedAction: () => {},
      onActionResult: (event) => {
        if (event.status === ActionResultStatus.Applied) {
          appliedCountRef.current += 1
        }
      },
      onNoToolWarning: () => {},
      onDone: () => {
        setIsRunning(false)
        if (appliedCountRef.current > 0) {
          // The agent changed data — re-pull the board so nodes/edges reflect it.
          loadBoards().catch((error) => {
            logger.ui.error('Board reload after quick command failed', { error: String(error) }, 'quick-chat-reload')
          })
        }
      },
      onError: (message) => {
        setIsRunning(false)
        setStatusLine(message)
      },
    })
  }, [command, isRunning, loadBoards])

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(560px, calc(100% - 32px))',
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {(statusLine || isRunning) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            fontSize: 13,
            color: '#4e5969',
          }}
        >
          {isRunning && <Spin size={14} />}
          <span style={{ whiteSpace: 'pre-wrap' }}>{statusLine || 'Working on it…'}</span>
        </div>
      )}
      {/* Not disabled while running — the user can type the NEXT command back-to-back;
          submit() simply ignores Enter until the current one finishes. */}
      <Input
        prefix={<IconThunderbolt />}
        placeholder="Quick command — create, edit, connect… (Enter to run)"
        value={command}
        onChange={setCommand}
        onPressEnter={submit}
        style={{
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}
      />
    </div>
  )
}
