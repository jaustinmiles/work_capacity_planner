// swift-tools-version:6.0
import PackageDescription

// SpatialKit exists to UNIT-TEST the visionOS spatial scene's platform-agnostic pure logic
// (layout engine, volume metrics, motion/damping math) on macOS via `swift test`. The sources are
// SYMLINKS to the canonical files in the TaskPlannerVision app target — so there is no duplication
// and no Xcode project change: the app keeps using the files in place, and this package compiles
// the same files for testing. (The .xcodeproj is hand-managed + gitignored; this avoids touching it.)
let package = Package(
    name: "SpatialKit",
    platforms: [.macOS(.v14), .visionOS(.v1)],
    products: [
        .library(name: "SpatialKit", targets: ["SpatialKit"]),
    ],
    targets: [
        .target(name: "SpatialKit"),
        .testTarget(name: "SpatialKitTests", dependencies: ["SpatialKit"]),
    ]
)
