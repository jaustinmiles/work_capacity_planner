import { ReactNode } from 'react'
import { Button } from '@arco-design/web-react'
import { IconMenuUnfold } from '@arco-design/web-react/icon'
import { MOBILE_LAYOUT } from '@shared/constants'

interface FloatingSidebarButtonProps {
  /** Click handler to expand sidebar */
  onClick: () => void
  /** Position on screen edge */
  position?: 'left' | 'right'
}

/**
 * Floating button to reopen a fully collapsed sidebar on mobile.
 *
 * When the sidebar collapses to 0px width on mobile devices,
 * this button provides a way to reopen it without wasting screen space
 * on a persistent icon bar.
 *
 * Features:
 * - 44px minimum touch target (WCAG accessibility)
 * - Fixed position on screen edge
 * - Semi-transparent background for visibility
 * - Subtle animation on hover
 */
export function FloatingSidebarButton({
  onClick,
  position = 'left',
}: FloatingSidebarButtonProps): ReactNode {
  const positionStyles = position === 'left'
    ? { left: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }
    : { right: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }

  return (
    <Button
      type="primary"
      icon={<IconMenuUnfold />}
      onClick={onClick}
      title="Open sidebar"
      style={{
        position: 'fixed',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 100,
        width: MOBILE_LAYOUT.FLOATING_BUTTON_SIZE,
        height: MOBILE_LAYOUT.FLOATING_BUTTON_SIZE,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '2px 2px 8px rgba(0, 0, 0, 0.15)',
        ...positionStyles,
      }}
    />
  )
}
