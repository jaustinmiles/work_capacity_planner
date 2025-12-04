/**
 * RadarChart Component
 *
 * A radar/spider chart visualization for displaying time distribution
 * across user-defined task types. Uses pure SVG without external libraries.
 *
 * Math: For n vertices, each vertex i is positioned at:
 *   x = center + radius * cos(i * 2π/n - π/2)
 *   y = center + radius * sin(i * 2π/n - π/2)
 * The -π/2 offset places the first vertex at the top (12 o'clock position).
 */

import React, { useMemo } from 'react'
import { Typography, Space, Progress } from '@arco-design/web-react'
import { useContainerQuery } from '../../hooks/useContainerQuery'

const { Text } = Typography

// ============================================================================
// Types
// ============================================================================

export interface RadarChartDataPoint {
  typeId: string
  label: string
  value: number       // Normalized 0-1 (actual/max)
  rawValue: number    // Raw minutes for tooltip
  color: string
  emoji: string
}

export interface RadarChartProps {
  data: RadarChartDataPoint[]
  size?: number
  showLabels?: boolean
  showGrid?: boolean
  fillOpacity?: number
  gridLevels?: number
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SIZE = 300
const DEFAULT_GRID_LEVELS = 4
const DEFAULT_FILL_OPACITY = 0.35
const MIN_VERTICES_FOR_RADAR = 3

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate vertex position for radar chart
 * @param index - Vertex index (0-based)
 * @param total - Total number of vertices
 * @param radius - Distance from center
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @returns {x, y} coordinates
 */
export function getVertexPosition(
  index: number,
  total: number,
  radius: number,
  centerX: number,
  centerY: number,
): { x: number; y: number } {
  const angle = (index * 2 * Math.PI) / total - Math.PI / 2
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  }
}

/**
 * Generate polygon points string for SVG
 * @param values - Array of normalized values (0-1)
 * @param maxRadius - Maximum radius
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @returns SVG points string "x1,y1 x2,y2 ..."
 */
export function generatePolygonPoints(
  values: number[],
  maxRadius: number,
  centerX: number,
  centerY: number,
): string {
  return values
    .map((value, index) => {
      const radius = value * maxRadius
      const pos = getVertexPosition(index, values.length, radius, centerX, centerY)
      return `${pos.x},${pos.y}`
    })
    .join(' ')
}

/**
 * Calculate average color from array of hex colors
 * Used for the fill color of the radar polygon
 */
export function getAverageColor(colors: string[]): string {
  if (colors.length === 0) return '#808080'
  if (colors.length === 1) return colors[0]

  let r = 0, g = 0, b = 0
  let validCount = 0

  colors.forEach(color => {
    const hex = color.replace('#', '')
    if (hex.length === 6) {
      r += parseInt(hex.substring(0, 2), 16)
      g += parseInt(hex.substring(2, 4), 16)
      b += parseInt(hex.substring(4, 6), 16)
      validCount++
    }
  })

  if (validCount === 0) return '#808080'

  r = Math.round(r / validCount)
  g = Math.round(g / validCount)
  b = Math.round(b / validCount)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Format minutes for display
 */
export function formatMinutesDisplay(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

// ============================================================================
// Sub-Components
// ============================================================================

interface GridProps {
  levels: number
  maxRadius: number
  centerX: number
  centerY: number
  vertexCount: number
}

/**
 * Renders the concentric grid circles and axis lines
 */
function RadarGrid({ levels, maxRadius, centerX, centerY, vertexCount }: GridProps): React.ReactElement {
  const gridCircles = useMemo(() => {
    const circles: React.ReactElement[] = []
    for (let i = 1; i <= levels; i++) {
      const radius = (maxRadius * i) / levels
      circles.push(
        <circle
          key={`grid-${i}`}
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="#e5e5e5"
          strokeWidth={1}
          strokeDasharray={i < levels ? '4,4' : undefined}
        />,
      )
    }
    return circles
  }, [levels, maxRadius, centerX, centerY])

  const axisLines = useMemo(() => {
    const lines: React.ReactElement[] = []
    for (let i = 0; i < vertexCount; i++) {
      const pos = getVertexPosition(i, vertexCount, maxRadius, centerX, centerY)
      lines.push(
        <line
          key={`axis-${i}`}
          x1={centerX}
          y1={centerY}
          x2={pos.x}
          y2={pos.y}
          stroke="#e5e5e5"
          strokeWidth={1}
        />,
      )
    }
    return lines
  }, [vertexCount, maxRadius, centerX, centerY])

  return (
    <g className="radar-grid">
      {gridCircles}
      {axisLines}
    </g>
  )
}

interface LabelsProps {
  data: RadarChartDataPoint[]
  maxRadius: number
  centerX: number
  centerY: number
  fontSize: number
}

/**
 * Renders labels at each vertex of the radar chart
 */
function RadarLabels({ data, maxRadius, centerX, centerY, fontSize }: LabelsProps): React.ReactElement {
  const labelRadius = maxRadius + 20 // Offset labels beyond the chart

  const labels = useMemo(() => {
    return data.map((point, index) => {
      const pos = getVertexPosition(index, data.length, labelRadius, centerX, centerY)

      // Adjust text anchor based on position
      let textAnchor: 'start' | 'middle' | 'end' = 'middle'
      if (pos.x < centerX - 10) textAnchor = 'end'
      else if (pos.x > centerX + 10) textAnchor = 'start'

      // Adjust vertical alignment
      let dy = '0.35em'
      if (pos.y < centerY - 10) dy = '0.9em'
      else if (pos.y > centerY + 10) dy = '-0.3em'

      return (
        <text
          key={`label-${point.typeId}`}
          x={pos.x}
          y={pos.y}
          textAnchor={textAnchor}
          dy={dy}
          fontSize={fontSize}
          fill="#4E5969"
        >
          {point.emoji} {point.label}
        </text>
      )
    })
  }, [data, labelRadius, centerX, centerY, fontSize])

  return <g className="radar-labels">{labels}</g>
}

interface BarChartFallbackProps {
  data: RadarChartDataPoint[]
  width: number
  height: number
}

/**
 * Fallback visualization when there are fewer than 3 data points
 * Displays horizontal progress bars instead
 */
function BarChartFallback({ data, width, height }: BarChartFallbackProps): React.ReactElement {
  if (data.length === 0) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text type="secondary">No task types defined</Text>
      </div>
    )
  }

  return (
    <div style={{ width, padding: '16px' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          (Radar chart requires 3+ task types)
        </Text>
        {data.map(point => (
          <div key={point.typeId}>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text>
                {point.emoji} {point.label}
              </Text>
              <Text>{formatMinutesDisplay(point.rawValue)}</Text>
            </Space>
            <Progress
              percent={Math.round(point.value * 100)}
              color={point.color}
              showText={false}
            />
          </div>
        ))}
      </Space>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function RadarChart({
  data,
  size = DEFAULT_SIZE,
  showLabels = true,
  showGrid = true,
  fillOpacity = DEFAULT_FILL_OPACITY,
  gridLevels = DEFAULT_GRID_LEVELS,
}: RadarChartProps): React.ReactElement {
  // Responsive sizing
  const { ref: containerRef, width: containerWidth } = useContainerQuery<HTMLDivElement>()

  // Calculate actual size based on container
  const actualSize = useMemo(() => {
    if (containerWidth && containerWidth > 0) {
      return Math.min(containerWidth - 40, size)
    }
    return size
  }, [containerWidth, size])

  // Chart dimensions
  const padding = showLabels ? 50 : 20
  const centerX = actualSize / 2
  const centerY = actualSize / 2
  const maxRadius = (actualSize - padding * 2) / 2
  const fontSize = Math.max(10, Math.floor(actualSize / 25))

  // Generate polygon points for data (must be before early return per React hooks rules)
  const polygonPoints = useMemo(() => {
    if (data.length < MIN_VERTICES_FOR_RADAR) return ''
    const values = data.map(d => d.value)
    return generatePolygonPoints(values, maxRadius, centerX, centerY)
  }, [data, maxRadius, centerX, centerY])

  // Calculate fill color (average of all colors with values > 0)
  const fillColor = useMemo(() => {
    const activeColors = data.filter(d => d.value > 0).map(d => d.color)
    return activeColors.length > 0 ? getAverageColor(activeColors) : '#808080'
  }, [data])

  // Generate vertex dots for each data point
  const vertexDots = useMemo(() => {
    if (data.length < MIN_VERTICES_FOR_RADAR) return []
    return data.map((point, index) => {
      const radius = point.value * maxRadius
      const pos = getVertexPosition(index, data.length, radius, centerX, centerY)
      return (
        <g key={`dot-${point.typeId}`}>
          <circle
            cx={pos.x}
            cy={pos.y}
            r={4}
            fill={point.color}
            stroke="#fff"
            strokeWidth={2}
          />
          <title>
            {point.emoji} {point.label}: {formatMinutesDisplay(point.rawValue)}
          </title>
        </g>
      )
    })
  }, [data, maxRadius, centerX, centerY])

  // Handle insufficient data for radar chart - fallback to bar chart
  if (data.length < MIN_VERTICES_FOR_RADAR) {
    return (
      <div ref={containerRef} style={{ width: '100%', maxWidth: size }}>
        <BarChartFallback data={data} width={actualSize} height={actualSize} />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        maxWidth: size,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <svg
        width={actualSize}
        height={actualSize}
        viewBox={`0 0 ${actualSize} ${actualSize}`}
        style={{ overflow: 'visible' }}
      >
        {/* Grid background */}
        {showGrid && (
          <RadarGrid
            levels={gridLevels}
            maxRadius={maxRadius}
            centerX={centerX}
            centerY={centerY}
            vertexCount={data.length}
          />
        )}

        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill={fillColor}
          fillOpacity={fillOpacity}
          stroke={fillColor}
          strokeWidth={2}
        />

        {/* Vertex dots */}
        {vertexDots}

        {/* Labels */}
        {showLabels && (
          <RadarLabels
            data={data}
            maxRadius={maxRadius}
            centerX={centerX}
            centerY={centerY}
            fontSize={fontSize}
          />
        )}
      </svg>
    </div>
  )
}

// ============================================================================
// Helper to prepare data from WorkStatusWidget state
// ============================================================================

export interface PrepareRadarDataInput {
  accumulatedByType: Record<string, number>
  userTaskTypes: Array<{
    id: string
    name: string
    emoji: string
    color: string
  }>
}

/**
 * Prepares data for the RadarChart from WorkStatusWidget state
 * Normalizes values based on the maximum accumulated time
 */
export function prepareRadarChartData(input: PrepareRadarDataInput): RadarChartDataPoint[] {
  const { accumulatedByType, userTaskTypes } = input

  // Find maximum value for normalization
  const values = userTaskTypes.map(type => accumulatedByType[type.id] || 0)
  const maxValue = Math.max(...values, 1) // Prevent division by zero

  return userTaskTypes.map(type => {
    const rawValue = accumulatedByType[type.id] || 0
    return {
      typeId: type.id,
      label: type.name,
      value: rawValue / maxValue,
      rawValue,
      color: type.color,
      emoji: type.emoji,
    }
  })
}
