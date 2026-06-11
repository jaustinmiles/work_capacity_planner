/**
 * Pure drop-position → time mapping math for the work logger drag gestures
 * (drag-to-create and drag-to-resize in CircularClock, LinearTimeline and
 * SwimLaneTimeline).
 *
 * The gesture components commit a session from the pointer-RELEASE event, so
 * the math that turns a release position into the persisted time range lives
 * here where it is unit-testable, instead of inline in the components.
 */

/** Minutes in one day (the timelines all operate on minutes since midnight). */
export const MINUTES_PER_DAY = 1440

/** Committed range of a finished drag-to-create gesture. */
export interface DragCreateRange {
  startMinutes: number
  endMinutes: number
}

/**
 * Resolve the committed range of a drag-to-create gesture from the anchor
 * (pointer-down) minutes and the release (pointer-up) minutes. Dragging
 * backwards is normalized so start <= end.
 *
 * Returns null when the dragged span is shorter than minDurationMinutes,
 * meaning the gesture is too small to create a session.
 */
export function resolveDragCreateRange(
  anchorMinutes: number,
  releaseMinutes: number,
  minDurationMinutes: number,
): DragCreateRange | null {
  const startMinutes = Math.min(anchorMinutes, releaseMinutes)
  const endMinutes = Math.max(anchorMinutes, releaseMinutes)
  if (endMinutes - startMinutes < minDurationMinutes) {
    return null
  }
  return { startMinutes, endMinutes }
}

/**
 * Map an x position inside the linear timeline (pixels from the left edge,
 * time-label gutter included) to minutes since midnight, clamped to one day.
 */
export function timelineXToMinutes(
  x: number,
  hourWidth: number,
  timeLabelWidth: number,
): number {
  const minutes = (x - timeLabelWidth) / (hourWidth / 60)
  return Math.max(0, Math.min(MINUTES_PER_DAY, minutes))
}

/**
 * Map an x position inside a swim lane (pixels, time-label gutter included)
 * to minutes since midnight of the focused day, clamped to the visible hour
 * range. The swim-lane view renders multiple days side by side, so
 * dayOffsetHours shifts the origin to the focused ("today") day.
 */
export function swimLanePixelsToMinutes(
  pixels: number,
  hourWidth: number,
  timeLabelWidth: number,
  dayOffsetHours: number,
  startHour: number,
  endHour: number,
): number {
  const hours = (pixels - timeLabelWidth) / hourWidth - dayOffsetHours + startHour
  return Math.max(startHour * 60, Math.min(endHour * 60, hours * 60))
}

/**
 * True when a mouse-move event reports no buttons held while a drag gesture
 * is still armed — i.e. the release happened somewhere the document never
 * observed (outside the window). The gesture must terminate at this position
 * instead of staying armed for an arbitrary later mouseup.
 */
export function isDragReleased(buttons: number): boolean {
  return buttons === 0
}
