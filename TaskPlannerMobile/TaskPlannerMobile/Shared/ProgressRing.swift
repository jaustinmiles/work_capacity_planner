import SwiftUI

/// A circular progress indicator
struct ProgressRing: View {
    let progress: Double  // 0.0 to 1.0
    var lineWidth: CGFloat = 4
    var size: CGFloat = 32
    var trackColor: Color = .gray.opacity(0.2)
    var progressColor: Color = .blue

    var body: some View {
        ZStack {
            // Background track
            Circle()
                .stroke(trackColor, lineWidth: lineWidth)

            // Progress arc
            Circle()
                .trim(from: 0, to: CGFloat(min(progress, 1.0)))
                .stroke(progressColor, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeInOut(duration: 0.3), value: progress)
        }
        .frame(width: size, height: size)
    }
}

/// Progress ring with a percentage label in the center
struct ProgressRingWithLabel: View {
    let progress: Double
    var size: CGFloat = 48
    var progressColor: Color = .blue

    var body: some View {
        ZStack {
            ProgressRing(
                progress: progress,
                lineWidth: 5,
                size: size,
                progressColor: progressColor
            )
            Text("\(Int(progress * 100))%")
                .font(.system(size: size * 0.22, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        }
    }
}
