import { ReactNode, useMemo } from 'react'
import { Button, Dropdown, Menu, Space } from '@arco-design/web-react'
import { IconMore } from '@arco-design/web-react/icon'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { MOBILE_LAYOUT } from '@shared/constants'

/**
 * Priority levels for action buttons
 * Lower number = higher priority (shown first on narrow screens)
 */
export type ButtonPriority = 1 | 2 | 3

export interface ActionButtonConfig {
  /** Unique key for the button */
  key: string
  /** Icon element to display */
  icon: ReactNode
  /** Button label (shown on desktop) */
  label: string
  /** Click handler */
  onClick: () => void
  /** Priority level: 1 = always visible, 2 = visible on compact+, 3 = desktop only */
  priority: ButtonPriority
  /** Button type for visual styling */
  buttonType?: 'primary' | 'secondary' | 'text' | 'outline'
  /** Whether button is currently active/selected */
  isActive?: boolean
  /** Optional title/tooltip */
  title?: string
}

interface ActionButtonOverflowMenuProps {
  buttons: ActionButtonConfig[]
}

/**
 * Responsive action button bar that collapses low-priority buttons
 * into an overflow dropdown menu on smaller screens.
 *
 * Ensures all navigation actions remain accessible regardless of viewport size,
 * solving the issue where buttons like "Sessions" get cut off on mobile.
 */
export function ActionButtonOverflowMenu({ buttons }: ActionButtonOverflowMenuProps): ReactNode {
  const { isMobile, isCompact } = useResponsive()

  // Determine how many buttons to show inline based on breakpoint
  const visibleCount = useMemo(() => {
    if (isMobile) return MOBILE_LAYOUT.NAV_VISIBLE_BUTTONS_MOBILE
    if (isCompact) return MOBILE_LAYOUT.NAV_VISIBLE_BUTTONS_COMPACT
    return MOBILE_LAYOUT.NAV_VISIBLE_BUTTONS_DESKTOP
  }, [isMobile, isCompact])

  // Sort buttons by priority (1 first) then split into visible/overflow
  const sortedButtons = useMemo(() => {
    return [...buttons].sort((a, b) => a.priority - b.priority)
  }, [buttons])

  const visibleButtons = sortedButtons.slice(0, visibleCount)
  const overflowButtons = sortedButtons.slice(visibleCount)

  // Build dropdown menu for overflow buttons
  const overflowMenu = useMemo(() => {
    if (overflowButtons.length === 0) return null

    return (
      <Menu>
        {overflowButtons.map((btn) => (
          <Menu.Item key={btn.key} onClick={btn.onClick}>
            <Space size="small">
              {btn.icon}
              <span>{btn.label}</span>
            </Space>
          </Menu.Item>
        ))}
      </Menu>
    )
  }, [overflowButtons])

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {/* Render visible buttons */}
      {visibleButtons.map((btn) => (
        <Button
          key={btn.key}
          type={btn.isActive ? 'primary' : (btn.buttonType ?? 'text')}
          icon={btn.icon}
          onClick={btn.onClick}
          title={btn.title ?? btn.label}
          style={{
            minWidth: isMobile ? MOBILE_LAYOUT.FLOATING_BUTTON_SIZE : undefined,
            minHeight: MOBILE_LAYOUT.FLOATING_BUTTON_SIZE,
          }}
        >
          {!isMobile && btn.label}
        </Button>
      ))}

      {/* Render overflow dropdown if there are hidden buttons */}
      {overflowMenu && (
        <Dropdown droplist={overflowMenu} position="br" trigger="click">
          <Button
            type="text"
            icon={<IconMore />}
            title="More actions"
            style={{
              minWidth: MOBILE_LAYOUT.FLOATING_BUTTON_SIZE,
              minHeight: MOBILE_LAYOUT.FLOATING_BUTTON_SIZE,
            }}
          />
        </Dropdown>
      )}
    </div>
  )
}
