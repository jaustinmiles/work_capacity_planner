import SwiftUI

// MARK: - Data Model

struct RadarDataPoint: Identifiable {
    let id: String        // typeId
    let label: String     // type name
    let value: Double     // normalized 0-1 (minutes / maxMinutes)
    let rawMinutes: Int
    let color: Color
    let emoji: String
}

// MARK: - Radar Chart View

/// A radar/spider chart showing relative logged time per task type.
///
/// Mirrors the desktop `RadarChart.tsx` implementation using SwiftUI Canvas.
/// Falls back to horizontal progress bars when fewer than 3 data points exist.
struct RadarChartView: View {
    let data: [RadarDataPoint]
    var size: CGFloat = 220
    var gridLevels: Int = 4
    var fillOpacity: Double = 0.35

    /// Only show data points that have logged time
    private var activeData: [RadarDataPoint] {
        data.filter { $0.rawMinutes > 0 }
    }

    var body: some View {
        if activeData.count < 3 {
            BarFallbackView(data: activeData)
        } else {
            ZStack {
                // Canvas for grid + polygon
                Canvas { context, canvasSize in
                    let center = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
                    let maxRadius = min(canvasSize.width, canvasSize.height) / 2 - 40
                    let count = activeData.count

                    // Grid circles
                    for level in 1...gridLevels {
                        let r = maxRadius * CGFloat(level) / CGFloat(gridLevels)
                        let circle = Path(ellipseIn: CGRect(
                            x: center.x - r,
                            y: center.y - r,
                            width: r * 2,
                            height: r * 2
                        ))
                        context.stroke(circle, with: .color(.gray.opacity(0.15)), lineWidth: 1)
                    }

                    // Axis lines
                    for i in 0..<count {
                        let pos = vertexPosition(index: i, total: count, radius: maxRadius, center: center)
                        var axisPath = Path()
                        axisPath.move(to: center)
                        axisPath.addLine(to: pos)
                        context.stroke(axisPath, with: .color(.gray.opacity(0.2)), lineWidth: 1)
                    }

                    // Data polygon
                    var polygonPath = Path()
                    for i in 0..<count {
                        let r = maxRadius * activeData[i].value
                        let pos = vertexPosition(index: i, total: count, radius: r, center: center)
                        if i == 0 {
                            polygonPath.move(to: pos)
                        } else {
                            polygonPath.addLine(to: pos)
                        }
                    }
                    polygonPath.closeSubpath()

                    // Fill with blended color
                    let avgColor = averageColor(from: activeData.map(\.color))
                    context.fill(polygonPath, with: .color(avgColor.opacity(fillOpacity)))
                    context.stroke(polygonPath, with: .color(avgColor), lineWidth: 2)

                    // Vertex dots
                    for i in 0..<count {
                        let r = maxRadius * activeData[i].value
                        let pos = vertexPosition(index: i, total: count, radius: r, center: center)
                        let dotSize: CGFloat = 6
                        let dotRect = CGRect(
                            x: pos.x - dotSize / 2,
                            y: pos.y - dotSize / 2,
                            width: dotSize,
                            height: dotSize
                        )
                        context.fill(Path(ellipseIn: dotRect), with: .color(activeData[i].color))
                    }
                }
                .frame(width: size, height: size)

                // Label overlay (Text can't be rendered inside Canvas)
                ForEach(Array(activeData.enumerated()), id: \.element.id) { index, point in
                    let maxRadius = size / 2 - 40
                    let labelRadius = maxRadius + 28
                    let center = CGPoint(x: size / 2, y: size / 2)
                    let pos = vertexPosition(index: index, total: activeData.count, radius: labelRadius, center: center)

                    VStack(spacing: 0) {
                        Text(point.emoji)
                            .font(.caption)
                        Text(DurationLabel.format(minutes: point.rawMinutes))
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                    }
                    .position(x: pos.x, y: pos.y)
                }
            }
            .frame(width: size, height: size)
        }
    }

    // MARK: - Math (mirrors desktop RadarChart.tsx)

    /// Calculate vertex position on the radar chart.
    /// Angle starts at -π/2 (12 o'clock) and goes clockwise.
    private func vertexPosition(index: Int, total: Int, radius: CGFloat, center: CGPoint) -> CGPoint {
        let angle = (CGFloat(index) * 2 * .pi / CGFloat(total)) - (.pi / 2)
        return CGPoint(
            x: center.x + radius * cos(angle),
            y: center.y + radius * sin(angle)
        )
    }

    /// Blend an array of SwiftUI Colors into an average.
    private func averageColor(from colors: [Color]) -> Color {
        guard !colors.isEmpty else { return .blue }
        // Use the first color with high saturation as a reasonable approximation
        // (true color blending would require UIColor conversion)
        if colors.count == 1 { return colors[0] }

        var totalR: CGFloat = 0
        var totalG: CGFloat = 0
        var totalB: CGFloat = 0
        var count: CGFloat = 0

        for color in colors {
            if let components = UIColor(color).cgColor.components, components.count >= 3 {
                totalR += components[0]
                totalG += components[1]
                totalB += components[2]
                count += 1
            }
        }

        guard count > 0 else { return .blue }
        return Color(
            red: totalR / count,
            green: totalG / count,
            blue: totalB / count
        )
    }
}

// MARK: - Data Preparation

extension RadarChartView {
    /// Convert accumulated time + task types into radar chart data points.
    /// Mirrors the desktop's `prepareRadarChartData()`.
    static func prepareData(
        accumulated: AccumulatedTimeByDate,
        taskTypes: [UserTaskType]
    ) -> [RadarDataPoint] {
        let maxValue = accumulated.byType.values.max() ?? 1
        let normalizer = max(maxValue, 1)

        return taskTypes.compactMap { type in
            let raw = accumulated.byType[type.id] ?? 0
            // Only include types that have logged time
            guard raw > 0 else { return nil }
            return RadarDataPoint(
                id: type.id,
                label: type.name,
                value: Double(raw) / Double(normalizer),
                rawMinutes: raw,
                color: type.swiftUIColor,
                emoji: type.emoji
            )
        }
    }
}

// MARK: - Bar Chart Fallback

/// Shows horizontal progress bars when fewer than 3 types exist (radar needs 3+ vertices).
private struct BarFallbackView: View {
    let data: [RadarDataPoint]

    var body: some View {
        if data.isEmpty {
            Text("No time logged yet")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
        } else {
            VStack(spacing: 8) {
                ForEach(data) { point in
                    HStack(spacing: 8) {
                        Text(point.emoji)
                            .font(.callout)
                        Text(point.label)
                            .font(.caption)
                            .frame(width: 60, alignment: .leading)

                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(.gray.opacity(0.15))
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(point.color)
                                    .frame(width: geo.size.width * point.value)
                            }
                        }
                        .frame(height: 12)

                        Text(DurationLabel.format(minutes: point.rawMinutes))
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                            .frame(width: 40, alignment: .trailing)
                    }
                }
            }
        }
    }
}
