import { useState, useEffect } from 'react'
import { Card, Button, TimePicker, DatePicker, Space, Typography, Tag, Switch, InputNumber, Alert } from '@arco-design/web-react'
import { IconClockCircle, IconForward, IconRefresh, IconCalendar } from '@arco-design/web-react/icon'
import { timeProvider, getCurrentTime, isTimeOverridden } from '@shared/time-provider'
import dayjs from 'dayjs'

const { Text, Title } = Typography

export function TimeControlPanel() {
  const [isOverridden, setIsOverridden] = useState(isTimeOverridden())
  const [currentTime, setCurrentTime] = useState(getCurrentTime())
  const [selectedDate, setSelectedDate] = useState(dayjs(currentTime))
  const [selectedTime, setSelectedTime] = useState(dayjs(currentTime))
  const [advanceMinutes, setAdvanceMinutes] = useState(30)

  useEffect(() => {
    // Subscribe to time changes
    const unsubscribe = timeProvider.subscribe((newTime) => {
      setCurrentTime(newTime)
      setIsOverridden(isTimeOverridden())
    })

    // Update display every second when not overridden
    const interval = setInterval(() => {
      if (!isTimeOverridden()) {
        setCurrentTime(getCurrentTime())
      }
    }, 1000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  const handleToggleOverride = (checked: boolean) => {
    if (checked) {
      // Set to current selected date/time
      const combined = dayjs(selectedDate.format('YYYY-MM-DD') + ' ' + selectedTime.format('HH:mm:ss'))
      timeProvider.setOverride(combined.toDate())
    } else {
      timeProvider.setOverride(null)
    }
  }

  const handleDateChange = (dateString: string | undefined) => {
    if (dateString) {
      setSelectedDate(dayjs(dateString))
      if (isOverridden) {
        const combined = dayjs(dateString + ' ' + selectedTime.format('HH:mm:ss'))
        timeProvider.setOverride(combined.toDate())
      }
    }
  }

  const handleTimeChange = (timeString: string | undefined) => {
    if (timeString) {
      setSelectedTime(dayjs(timeString))
      if (isOverridden) {
        const combined = dayjs(selectedDate.format('YYYY-MM-DD') + ' ' + timeString)
        timeProvider.setOverride(combined.toDate())
      }
    }
  }

  const handleAdvanceTime = () => {
    if (isOverridden) {
      timeProvider.advanceBy(advanceMinutes)
      // Update selected date/time to match
      const newTime = getCurrentTime()
      setSelectedDate(dayjs(newTime))
      setSelectedTime(dayjs(newTime))
    }
  }

  const handleSetToNow = () => {
    const now = new Date()
    setSelectedDate(dayjs(now))
    setSelectedTime(dayjs(now))
    if (isOverridden) {
      timeProvider.setOverride(now)
    }
  }

  const quickSetTime = (hours: number, minutes: number = 0) => {
    timeProvider.setTimeToday(hours, minutes)
    const newTime = getCurrentTime()
    setSelectedDate(dayjs(newTime))
    setSelectedTime(dayjs(newTime))
  }

  // Component is already gated by DevTools access

  return (
    <Card
      title={
        <Space>
          <IconClockCircle />
          <span>Time Control (Dev)</span>
          {isOverridden && <Tag color="orange">OVERRIDE ACTIVE</Tag>}
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        {/* Current Time Display */}
        <div style={{ padding: '12px', background: 'var(--color-fill-2)', borderRadius: '4px' }}>
          <Text type="secondary">Current Application Time:</Text>
          <Title heading={4} style={{ margin: '4px 0' }}>
            {dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss')}
          </Title>
          <Text type="secondary">{dayjs(currentTime).format('dddd, MMMM D, YYYY')}</Text>
        </div>

        {/* Override Toggle */}
        <Space>
          <Switch
            checked={isOverridden}
            onChange={handleToggleOverride}
          />
          <Text>Override System Time</Text>
        </Space>

        {/* Time Controls */}
        {isOverridden && (
          <>
            <Alert
              type="warning"
              content="Time override is active. The scheduler will use this time instead of the real current time."
            />

            <Space>
              <DatePicker
                value={selectedDate.format('YYYY-MM-DD')}
                onChange={handleDateChange}
                prefix={<IconCalendar />}
              />
              <TimePicker
                value={selectedTime.format('HH:mm:ss')}
                onChange={handleTimeChange}
                prefix={<IconClockCircle />}
              />
              <Button icon={<IconRefresh />} onClick={handleSetToNow}>
                Set to Now
              </Button>
            </Space>

            {/* Quick Set Buttons */}
            <Space wrap>
              <Text type="secondary">Quick Set:</Text>
              <Button size="small" onClick={() => quickSetTime(9, 0)}>9:00 AM</Button>
              <Button size="small" onClick={() => quickSetTime(12, 0)}>12:00 PM</Button>
              <Button size="small" onClick={() => quickSetTime(15, 0)}>3:00 PM</Button>
              <Button size="small" onClick={() => quickSetTime(18, 0)}>6:00 PM</Button>
              <Button size="small" onClick={() => quickSetTime(21, 0)}>9:00 PM</Button>
              <Button size="small" onClick={() => quickSetTime(23, 0)}>11:00 PM</Button>
            </Space>

            {/* Advance Time */}
            <Space>
              <Text>Advance by:</Text>
              <InputNumber
                value={advanceMinutes}
                onChange={(value) => setAdvanceMinutes(value as number)}
                min={1}
                max={1440}
                suffix="minutes"
                style={{ width: 120 }}
              />
              <Button
                icon={<IconForward />}
                onClick={handleAdvanceTime}
                type="primary"
              >
                Advance Time
              </Button>
            </Space>
          </>
        )}

        {/* Console Commands Help */}
        <details>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            <Text type="secondary">Console Commands</Text>
          </summary>
          <div style={{ marginTop: 8, padding: 8, background: 'var(--color-fill-1)', borderRadius: 4 }}>
            <pre style={{ margin: 0, fontSize: 12 }}>
{`window.setTime(21, 0)    // Set to 9:00 PM today
window.advanceTime(30)   // Advance by 30 minutes
window.clearTime()       // Use real time
window.timeProvider      // Full API access`}
            </pre>
          </div>
        </details>
      </Space>
    </Card>
  )
}
