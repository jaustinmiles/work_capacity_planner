import { useState, useRef, useEffect } from 'react'
import { Popover, Button, Space, Typography } from '@arco-design/web-react'
import { IconClockCircle } from '@arco-design/web-react/icon'

const { Text } = Typography

interface ClockTimePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  style?: React.CSSProperties
  disabled?: boolean
}

function ClockFace({ 
  type, 
  value, 
  onChange 
}: { 
  type: 'hours' | 'minutes'
  value: number
  onChange: (val: number) => void 
}) {
  const isHours = type === 'hours'
  const items = isHours 
    ? Array.from({ length: 24 }, (_, i) => i)
    : Array.from({ length: 12 }, (_, i) => i * 5)
  
  const radius = 80
  const innerRadius = 50
  
  const getPosition = (index: number, isInner: boolean = false) => {
    const count = isHours ? 12 : 12
    const r = isInner ? innerRadius : radius
    const angle = (index * (360 / count) - 90) * (Math.PI / 180)
    return {
      x: 100 + r * Math.cos(angle),
      y: 100 + r * Math.sin(angle)
    }
  }
  
  return (
    <svg width={200} height={200} style={{ cursor: 'pointer' }}>
      {/* Clock face circle */}
      <circle cx={100} cy={100} r={95} fill="#f5f5f5" stroke="#e5e6eb" strokeWidth={2} />
      
      {/* Center dot */}
      <circle cx={100} cy={100} r={3} fill="#165DFF" />
      
      {/* Numbers */}
      {items.map((item, index) => {
        const displayIndex = isHours ? index : index
        const displayValue = isHours 
          ? (index === 0 ? 12 : index)
          : item
        
        const isOuter = !isHours || displayIndex < 12
        const pos = getPosition(displayIndex % 12, !isOuter)
        const actualValue = isHours ? displayIndex : item
        const isSelected = value === actualValue
        
        return (
          <g key={item}>
            {/* Highlight circle for selected */}
            {isSelected && (
              <circle 
                cx={pos.x} 
                cy={pos.y} 
                r={18} 
                fill="#165DFF" 
              />
            )}
            
            {/* Clickable area */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={18}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onChange(actualValue)}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.setAttribute('fill', '#E8F3FF')
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.setAttribute('fill', 'transparent')
                }
              }}
            />
            
            {/* Number text */}
            <text
              x={pos.x}
              y={pos.y + 5}
              textAnchor="middle"
              fill={isSelected ? 'white' : '#1D2129'}
              fontSize={14}
              fontWeight={isSelected ? 'bold' : 'normal'}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {displayValue}
            </text>
          </g>
        )
      })}
      
      {/* Additional hours 13-23 for 24-hour format */}
      {isHours && Array.from({ length: 12 }, (_, i) => i + 12).map((hour, index) => {
        const pos = getPosition(index === 0 ? 0 : index, true)
        const isSelected = value === hour
        
        return (
          <g key={hour}>
            {isSelected && (
              <circle 
                cx={pos.x} 
                cy={pos.y} 
                r={15} 
                fill="#165DFF" 
              />
            )}
            
            <circle
              cx={pos.x}
              cy={pos.y}
              r={15}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onChange(hour)}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.setAttribute('fill', '#E8F3FF')
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.setAttribute('fill', 'transparent')
                }
              }}
            />
            
            <text
              x={pos.x}
              y={pos.y + 4}
              textAnchor="middle"
              fill={isSelected ? 'white' : '#86909C'}
              fontSize={12}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {hour === 0 ? '00' : hour}
            </text>
          </g>
        )
      })}
      
      {/* Hand pointing to selected value */}
      {(() => {
        const angle = isHours 
          ? ((value % 12) * 30 - 90) * (Math.PI / 180)
          : ((value / 5) * 30 - 90) * (Math.PI / 180)
        const r = isHours && value >= 12 ? innerRadius : radius
        const endX = 100 + r * Math.cos(angle) * 0.7
        const endY = 100 + r * Math.sin(angle) * 0.7
        
        return (
          <line
            x1={100}
            y1={100}
            x2={endX}
            y2={endY}
            stroke="#165DFF"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
      })()}
    </svg>
  )
}

export function ClockTimePicker({
  value = '',
  onChange,
  placeholder = 'Select time',
  style,
  disabled = false
}: ClockTimePickerProps) {
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<'hours' | 'minutes'>('hours')
  
  // Parse value into hours and minutes
  const parseValue = () => {
    if (!value || !value.includes(':')) return { hours: 0, minutes: 0 }
    const [h, m] = value.split(':').map(Number)
    return { hours: h || 0, minutes: m || 0 }
  }
  
  const { hours, minutes } = parseValue()
  
  const handleHourChange = (h: number) => {
    const m = minutes.toString().padStart(2, '0')
    const newValue = `${h.toString().padStart(2, '0')}:${m}`
    onChange?.(newValue)
    setMode('minutes')
  }
  
  const handleMinuteChange = (m: number) => {
    const h = hours.toString().padStart(2, '0')
    const newValue = `${h}:${m.toString().padStart(2, '0')}`
    onChange?.(newValue)
    setVisible(false)
  }
  
  const displayValue = value || placeholder
  
  const content = (
    <div style={{ padding: 16 }}>
      <Space direction="vertical" align="center">
        <Space>
          <Button 
            type={mode === 'hours' ? 'primary' : 'text'}
            onClick={() => setMode('hours')}
            size="large"
            style={{ fontSize: 24, fontWeight: 'bold' }}
          >
            {hours.toString().padStart(2, '0')}
          </Button>
          <Text style={{ fontSize: 24 }}>:</Text>
          <Button 
            type={mode === 'minutes' ? 'primary' : 'text'}
            onClick={() => setMode('minutes')}
            size="large"
            style={{ fontSize: 24, fontWeight: 'bold' }}
          >
            {minutes.toString().padStart(2, '0')}
          </Button>
        </Space>
        
        {mode === 'hours' ? (
          <ClockFace 
            type="hours" 
            value={hours} 
            onChange={handleHourChange}
          />
        ) : (
          <ClockFace 
            type="minutes" 
            value={minutes} 
            onChange={handleMinuteChange}
          />
        )}
        
        <Space>
          <Button size="small" onClick={() => setVisible(false)}>
            Cancel
          </Button>
          <Button 
            size="small" 
            type="primary"
            onClick={() => setVisible(false)}
          >
            OK
          </Button>
        </Space>
      </Space>
    </div>
  )
  
  return (
    <Popover
      popupVisible={visible && !disabled}
      onVisibleChange={setVisible}
      content={content}
      trigger="click"
      position="bottom"
    >
      <Button
        style={{ width: '100%', ...style }}
        disabled={disabled}
        icon={<IconClockCircle />}
      >
        {displayValue}
      </Button>
    </Popover>
  )
}