import { TaskType } from '@shared/enums'

export interface WorkSessionData {
  id: string
  taskId: string
  taskName: string
  stepId?: string
  stepName?: string
  startMinutes: number // 0-1440 (minutes since midnight)
  endMinutes: number
  type: TaskType
  color: string
  isDirty?: boolean
  isNew?: boolean
  notes?: string
  isCollapsed?: boolean
  completed?: boolean // Track if the task was completed in this session
}

// Convert time string (HH:mm) to minutes since midnight
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

// Convert minutes since midnight to time string (HH:mm)
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

// Round minutes to nearest 15-minute increment
export function roundToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

// Get color for task type
export function getTypeColor(type: TaskType): string {
  return type === TaskType.Focused ? '#165DFF' : '#00B42A'
}

// Check if two sessions overlap
export function checkOverlap(
  session: WorkSessionData,
  otherSessions: WorkSessionData[],
  excludeId?: string,
): boolean {
  return otherSessions.some(s => {
    if (s.id === excludeId || s.id === session.id) return false
    return session.startMinutes < s.endMinutes && session.endMinutes > s.startMinutes
  })
}

// Get position on clock face for given minutes
export function getClockPosition(
  minutes: number,
  radius: number,
  centerX: number = 100,
  centerY: number = 100,
): { x: number; y: number } {
  // Convert minutes to angle (0 minutes = 12 o'clock = -90 degrees)
  const hours = minutes / 60
  const angle = (hours * 30 - 90) * (Math.PI / 180)

  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  }
}

// Generate SVG arc path for clock segment
export function generateArcPath(
  startMinutes: number,
  endMinutes: number,
  innerRadius: number,
  outerRadius: number,
  centerX: number = 100,
  centerY: number = 100,
  workdayStart: number = 8,
  workdayHours: number = 12,
): string {
  // Convert minutes to hours
  const startHour = startMinutes / 60
  const endHour = endMinutes / 60
  
  // Map to 12-hour workday clock (8 AM at top)
  let startAngle: number
  let endAngle: number
  
  if (startHour >= workdayStart && startHour <= workdayStart + workdayHours) {
    // Map workday hours to full circle
    const startProgress = (startHour - workdayStart) / workdayHours
    startAngle = (startProgress * 360 - 90) * (Math.PI / 180)
  } else {
    // Outside workday - don't render
    return ''
  }
  
  if (endHour >= workdayStart && endHour <= workdayStart + workdayHours) {
    const endProgress = (endHour - workdayStart) / workdayHours
    endAngle = (endProgress * 360 - 90) * (Math.PI / 180)
  } else {
    // Clip to workday end
    endAngle = (270) * (Math.PI / 180)
  }

  const startOuterX = centerX + outerRadius * Math.cos(startAngle)
  const startOuterY = centerY + outerRadius * Math.sin(startAngle)
  const endOuterX = centerX + outerRadius * Math.cos(endAngle)
  const endOuterY = centerY + outerRadius * Math.sin(endAngle)

  const startInnerX = centerX + innerRadius * Math.cos(startAngle)
  const startInnerY = centerY + innerRadius * Math.sin(startAngle)
  const endInnerX = centerX + innerRadius * Math.cos(endAngle)
  const endInnerY = centerY + innerRadius * Math.sin(endAngle)

  const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0

  return `
    M ${startOuterX} ${startOuterY}
    A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuterX} ${endOuterY}
    L ${endInnerX} ${endInnerY}
    A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInnerX} ${startInnerY}
    Z
  `.trim()
}

// Calculate minutes from angle on clock
export function angleToMinutes(
  mouseX: number,
  mouseY: number,
  centerX: number = 100,
  centerY: number = 100,
  workdayStart: number = 8,
  workdayHours: number = 12,
): number {
  const angle = Math.atan2(mouseY - centerY, mouseX - centerX)
  const degrees = angle * (180 / Math.PI)
  const adjustedDegrees = (degrees + 90 + 360) % 360
  
  // Map from 360 degrees to 12-hour workday
  const workdayProgress = adjustedDegrees / 360
  const workdayHour = workdayStart + (workdayProgress * workdayHours)
  const minutes = Math.round(workdayHour * 60)

  return Math.max(workdayStart * 60, Math.min((workdayStart + workdayHours) * 60, minutes))
}

// Find closest session edge for dragging
export function findClosestEdge(
  minutes: number,
  sessions: WorkSessionData[],
): { sessionId: string; edge: 'start' | 'end' } | null {
  type EdgeType = 'start' | 'end'
  let closestSessionId: string | null = null
  let closestEdge: EdgeType = 'start'
  let closestDistance = Infinity
  const threshold = 30 // 30 minutes threshold for edge detection

  sessions.forEach(session => {
    const startDist = Math.abs(session.startMinutes - minutes)
    const endDist = Math.abs(session.endMinutes - minutes)

    if (startDist < threshold && startDist < closestDistance) {
      closestSessionId = session.id
      closestEdge = 'start'
      closestDistance = startDist
    }

    if (endDist < threshold && endDist < closestDistance) {
      closestSessionId = session.id
      closestEdge = 'end'
      closestDistance = endDist
    }
  })

  if (closestSessionId === null) {
    return null
  }

  return { sessionId: closestSessionId, edge: closestEdge }
}
