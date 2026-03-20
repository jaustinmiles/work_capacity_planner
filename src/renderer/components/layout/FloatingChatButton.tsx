import { ReactNode } from 'react'
import { Button } from '@arco-design/web-react'
import { IconMessage } from '@arco-design/web-react/icon'
import { MOBILE_LAYOUT } from '@shared/constants'

interface FloatingChatButtonProps {
  /** Click handler to open chat sidebar */
  onClick: () => void
  /** Whether the button is visible (hidden when chat sidebar is open) */
  visible: boolean
}

/**
 * Floating chat button fixed to the bottom-right corner.
 * Hides when the chat sidebar is open, reappears when it closes.
 */
export function FloatingChatButton({
  onClick,
  visible,
}: FloatingChatButtonProps): ReactNode {
  if (!visible) return null

  return (
    <Button
      type="primary"
      icon={<IconMessage />}
      onClick={onClick}
      title="Open Chat"
      shape="circle"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 100,
        width: MOBILE_LAYOUT.FLOATING_BUTTON_SIZE,
        height: MOBILE_LAYOUT.FLOATING_BUTTON_SIZE,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      }}
    />
  )
}
