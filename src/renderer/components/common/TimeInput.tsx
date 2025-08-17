import { useState, useEffect } from 'react'
import { Input, Space } from '@arco-design/web-react'
import { IconClockCircle } from '@arco-design/web-react/icon'

interface TimeInputProps {
  value?: string
  onChange?: (__value: string) => void
  placeholder?: string
  style?: React.CSSProperties
  disabled?: boolean
}

export function TimeInput({
  value = '',
  onChange,
  placeholder = 'HH:MM',
  style,
  disabled = false,
}: TimeInputProps) {
  const [inputValue, setInputValue] = useState(value)
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const parseTimeInput = (input: string): string | null => {
    // Remove all non-digit characters
    const digits = input.replace(/\D/g, '')

    if (digits.length === 0) return null

    let hours = ''
    let minutes = ''

    if (digits.length <= 2) {
      // Just hour(s)
      hours = digits.padStart(2, '0')
      minutes = '00'
    } else if (digits.length === 3) {
      // H:MM or HH:M
      if (parseInt(digits.substring(0, 2)) <= 23) {
        hours = digits.substring(0, 2)
        minutes = digits.substring(2).padEnd(2, '0')
      } else {
        hours = '0' + digits[0]
        minutes = digits.substring(1, 3)
      }
    } else if (digits.length === 4) {
      // HH:MM
      hours = digits.substring(0, 2)
      minutes = digits.substring(2, 4)
    } else {
      // Too many digits
      hours = digits.substring(0, 2)
      minutes = digits.substring(2, 4)
    }

    // Validate ranges
    const h = parseInt(hours)
    const m = parseInt(minutes)

    if (h > 23) hours = '23'
    if (m > 59) minutes = '59'

    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
  }

  const formatDisplayValue = (val: string): string => {
    if (!val) return ''
    // If already in HH:MM format, return as is
    if (/^\d{2}:\d{2}$/.test(val)) return val

    const parsed = parseTimeInput(val)
    return parsed || val
  }

  const handleInputChange = (val: string) => {
    setInputValue(val)

    // Allow common formats like "9am", "2:30pm", "1430"
    let processedValue = val.toLowerCase()

    // Handle am/pm notation
    const amPmMatch = processedValue.match(/^(\d{1,2}):?(\d{0,2})\s*(am|pm)$/)
    if (amPmMatch) {
      let hours = parseInt(amPmMatch[1])
      const minutes = amPmMatch[2] || '00'
      const period = amPmMatch[3]

      if (period === 'pm' && hours < 12) hours += 12
      if (period === 'am' && hours === 12) hours = 0

      processedValue = `${hours.toString().padStart(2, '0')}:${minutes.padStart(2, '0')}`
    }

    const parsed = parseTimeInput(processedValue)
    if (parsed) {
      setIsValid(true)
      onChange?.(parsed)
    } else if (val === '') {
      setIsValid(true)
      onChange?.('')
    } else {
      setIsValid(false)
    }
  }

  const handleBlur = () => {
    const formatted = formatDisplayValue(inputValue)
    setInputValue(formatted)
    if (formatted && formatted !== value) {
      onChange?.(formatted)
    }
  }

  return (
    <Input
      value={inputValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      style={style}
      disabled={disabled}
      status={isValid ? undefined : 'error'}
      prefix={<IconClockCircle />}
      allowClear
    />
  )
}
