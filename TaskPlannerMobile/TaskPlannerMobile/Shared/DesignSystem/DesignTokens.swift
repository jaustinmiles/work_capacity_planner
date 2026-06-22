import SwiftUI

/// App-wide design tokens — the single source of truth for spacing, corner radii, and motion.
///
/// Brand-aligned with the Vision Pro spatial design: the same semantic per-type colors (via
/// `UserTaskType.swiftUIColor`) and the same calm motion vocabulary, so the product family feels
/// coherent across iPhone and Vision Pro. No magic numbers in views — reach for `DS.*`.
enum DS {

    /// Spacing scale (points). For metrics that should grow with Dynamic Type, wrap in `@ScaledMetric`.
    enum Space {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    /// Corner radii (points). `card` reads as a soft content surface; `control` for chips/buttons.
    enum Radius {
        static let control: CGFloat = 12
        static let card: CGFloat = 20
        static let sheet: CGFloat = 28
    }

    /// Motion vocabulary — calm by default for the ADHD audience. Honor Reduce Motion at call sites
    /// (`withAnimation(reduceMotion ? nil : DS.Motion.snappy)`).
    enum Motion {
        /// Calm, no-overshoot settle — layout changes, reflow.
        static let smooth: Animation = .smooth(duration: 0.35)
        /// The UI default — start/stop, selection, small state changes.
        static let snappy: Animation = .snappy(duration: 0.28)
        /// Visible overshoot — reserve for celebration (task complete).
        static let bouncy: Animation = .bouncy(duration: 0.5)
    }
}
