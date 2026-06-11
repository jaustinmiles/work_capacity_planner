import Foundation
import SwiftUI      // RealityViewContent / RealityView live in RealityKit's SwiftUI integration
import RealityKit
import os

/// Centralized logger for spatial interaction diagnostics. Capture in Console.app or
/// `xcrun simctl spawn booted log stream --predicate 'subsystem == "com.leftbrain.TaskPlannerVision"'`.
enum SpatialLog {
    static let drag = Logger(subsystem: "com.leftbrain.TaskPlannerVision", category: "drag")
}

/// Bridges RealityKit's `ManipulationComponent` drag lifecycle to the view model's transform
/// ownership + persistence. Installed once on the RealityView content.
///
/// `ManipulationComponent` (visionOS 26) is the idiomatic way to grab and move an entity: it
/// owns the entity's transform during a manipulation and handles coordinate spaces and
/// re-orientation natively, so we no longer hand-roll a translation conversion (a frequent
/// source of backward/wrong-axis drift). We only bridge its lifecycle events:
///
/// - `WillBegin` → claim `.gesture` ownership so the reconcile pass leaves the live transform
///   alone (the structural snap-back fix).
/// - `WillEnd` → clamp to the volume, commit the final position synchronously (so no reconcile
///   ever sees `.data` with a stale position), then persist asynchronously.
///
/// Movable entities are configured with `releaseBehavior = .stay` — the default `.reset` is
/// itself a snap-back-to-origin, so it must be overridden.
@MainActor
final class ManipulationBridge {
    private var subscriptions: [EventSubscription] = []

    /// Depth (z) captured at grab and held constant for the duration of the drag. Unconstrained
    /// gaze+pinch manipulation otherwise drifts the card to the volume's depth wall (logs showed
    /// every release pinned to the z clamp), and re-grabbing a wall-pinned card produces a small
    /// backward settle. Holding depth keeps the drag in the card's facing plane — predictable,
    /// board-like translation. Flip `lockDepth` to false for free 3D depth dragging.
    private var grabDepth: [String: Float] = [:]
    /// Whether to pin a card's depth during a drag. Now FALSE: with the parent-relative coordinate
    /// fix in place the earlier depth-drift is gone, and users want to push cards back / pull them
    /// forward. Flip to true only if free-depth dragging feels unstable.
    private let lockDepth = false

    /// Position captured at grab; on release we compare to decide tap vs drag. A manipulation
    /// always fires (that's the "jiggle"), so this is a coexistence-independent way to recognize
    /// a tap that GestureComponent could not deliver on a manipulable entity.
    private var grabPos: [String: SIMD3<Float>] = [:]
    private let tapThreshold: Float = 0.015   // <1.5 cm of travel = a tap, not a drag

    /// Subscribe once to the manipulation lifecycle for the whole scene.
    func install(on content: RealityViewContent, viewModel: SpatialSceneViewModel) {
        guard subscriptions.isEmpty else { return }

        subscriptions.append(content.subscribe(to: ManipulationEvents.WillBegin.self) { [weak self] event in
            let id = event.entity.name
            // A connection PORT starts a connect-drag (rubber-band) — it does NOT move the card or
            // claim card ownership; the port entity itself is what the user drags.
            if let owner = SpatialSceneView.controlOwnerId(id, role: "port") {
                SpatialLog.drag.debug("WillBegin port owner=\(owner, privacy: .public)")
                viewModel.beginConnectDrag(sourceId: owner)
                return
            }
            self?.grabDepth[id] = event.entity.position.z   // parent-relative (volume-local)
            self?.grabPos[id] = event.entity.position
            SpatialLog.drag.debug("WillBegin id=\(id, privacy: .public)")
            viewModel.claim(id, .gesture)
        })

        // Hold depth constant each manipulation frame so translation stays in the facing plane —
        // BUT not for controls (a dragged port must reach targets at any depth).
        subscriptions.append(content.subscribe(to: ManipulationEvents.DidUpdateTransform.self) { [weak self] event in
            guard let self else { return }
            if event.entity.name.hasPrefix(SpatialSceneView.controlPrefix) { return }
            // Lock cards upright: ManipulationComponent's primary manipulation otherwise rolls/tilts the
            // card (including z-roll about the view axis). Cards are flat, forward-facing panels, so
            // re-assert identity orientation each frame (secondaryRotationBehavior=.none only disables
            // the two-handed rotation). DidUpdateTransform fires AFTER the component writes the transform.
            event.entity.orientation = simd_quatf(real: 1, imag: .zero)
            guard self.lockDepth, let z = self.grabDepth[event.entity.name] else { return }
            var p = event.entity.position
            if abs(p.z - z) > 0.0005 {
                p.z = z
                event.entity.position = p
            }
        })

        subscriptions.append(content.subscribe(to: ManipulationEvents.WillEnd.self) { [weak self] event in
            let id = event.entity.name
            self?.grabDepth[id] = nil
            let start = self?.grabPos[id]
            self?.grabPos[id] = nil

            // A control ("ctl::…"). A PORT release = a connect-drop attempt (find the nearest node);
            // any other control (× badge) routes its tap (dismiss).
            if id.hasPrefix(SpatialSceneView.controlPrefix) {
                if let sourceId = SpatialSceneView.controlOwnerId(id, role: "port") {
                    let releasePos = event.entity.position(relativeTo: nil)   // world frame
                    let target = self?.nearestNode(to: releasePos, excluding: sourceId, in: content, viewModel: viewModel)
                    viewModel.endConnectDrag()              // clears the rubber-band next reconcile
                    event.entity.removeFromParent()         // drop the displaced port; reconcile rebuilds it
                    if let target {
                        SpatialLog.drag.debug("port drop \(sourceId, privacy: .public) → \(target, privacy: .public)")
                        viewModel.requestConnectDrop(sourceId: sourceId, targetId: target)
                    }
                } else {
                    viewModel.requestTap(id)
                }
                return
            }

            // Parent-relative throughout, so positions match the layout engine's and reconcile's
            // volume-local frame (VolumeMetrics.clamp is also local).
            let p = VolumeMetrics.standard.clamp(event.entity.position)
            event.entity.position = p
            let moved = start.map { simd_distance($0, p) } ?? .greatestFiniteMagnitude

            if moved < (self?.tapThreshold ?? 0.015) {
                // TAP (near-zero travel): route the action, select-pop, release ownership so the
                // layout tween settles it back; NO commit, NO bounce.
                SpatialLog.drag.debug("WillEnd   id=\(id, privacy: .public) TAP")
                if !viewModel.reduceMotion {
                    event.entity.components.set(PulseComponent(style: .pop,
                                                               duration: SpatialMotion.pulseDuration,
                                                               amplitude: SpatialMotion.popAmplitude))
                }
                viewModel.claim(id, .data)
                viewModel.requestTap(id)
            } else {
                // DRAG: commit the new position + settle-bounce.
                let pos = String(format: "%.3f, %.3f, %.3f", p.x, p.y, p.z)
                SpatialLog.drag.debug("WillEnd   id=\(id, privacy: .public) DRAG pos=(\(pos, privacy: .public))")
                viewModel.commitDrag(id: id, x: Double(p.x), y: Double(p.y), z: Double(p.z))
                if !viewModel.reduceMotion {
                    event.entity.components.set(PulseComponent(style: .bounce,
                                                               duration: SpatialMotion.pulseDuration,
                                                               amplitude: SpatialMotion.bounceAmplitude))
                }
                Task { await viewModel.persistTransform(id: id) }
            }
        })
    }

    /// Nearest connectable node entity to `worldPos` within the drop radius, excluding the source
    /// and edges/controls. World frame on both sides, so card-local vs content-root never enters the
    /// distance math. Reuses the same live positions the EdgeSystem reads. (Nearest-by-distance, not
    /// raycast — an indirect-pinch-held port has no stable aim vector.)
    private func nearestNode(to worldPos: SIMD3<Float>, excluding sourceId: String,
                             in content: RealityViewContent, viewModel: SpatialSceneViewModel) -> String? {
        var best: (id: String, distance: Float)?
        for entity in content.entities where !entity.name.hasPrefix(SpatialSceneView.edgePrefix) {
            let id = entity.name
            guard id != sourceId, viewModel.isConnectableNode(id) else { continue }
            let d = simd_distance(entity.position(relativeTo: nil), worldPos)
            if d <= SpatialTokens.dropTargetRadius, best == nil || d < best!.distance {
                best = (id, d)
            }
        }
        return best?.id
    }
}
