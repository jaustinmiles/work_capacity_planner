import CoreGraphics

/// Single source of truth for spatial UI sizing, glass, and per-state styling — the design
/// tokens that replace the magic numbers previously scattered across the four card views.
/// Centralizing every dimension here is what keeps the UI cohesive as new component kinds are
/// added (a new kind = one row here + one `SpatialCard` content view).
enum SpatialTokens {

    // MARK: - Card geometry (points; attachment content space)

    static func width(_ kind: SpatialEntityKind) -> CGFloat {
        switch kind {
        case .taskNode, .stepNode: 210
        case .typePanel: 240
        case .note: 190
        case .workflowVolume: 200
        }
    }

    static func cornerRadius(_ kind: SpatialEntityKind) -> CGFloat {
        switch kind {
        case .typePanel: 18
        case .note: 14
        case .taskNode, .stepNode, .workflowVolume: 16
        }
    }

    static func paddingH(_ kind: SpatialEntityKind) -> CGFloat {
        switch kind {
        case .typePanel: 16
        case .taskNode, .stepNode, .note, .workflowVolume: 14
        }
    }

    static func paddingV(_ kind: SpatialEntityKind) -> CGFloat {
        switch kind {
        case .typePanel: 12
        case .note, .workflowVolume: 14
        case .taskNode, .stepNode: 10
        }
    }

    /// How strongly the type/accent tint washes under the glass surface.
    static func tintWash(_ kind: SpatialEntityKind) -> Double {
        switch kind {
        case .typePanel: 0.25
        case .note: 0.30
        case .taskNode, .stepNode, .workflowVolume: 0.12
        }
    }

    // MARK: - Per-state border

    static func borderWidth(_ state: InteractionState) -> CGFloat {
        switch state {
        case .rest: 1.5
        case .hover: 2
        case .selected: 4
        case .dragging: 3
        case .disabled: 1
        }
    }

    static func borderTintOpacity(_ state: InteractionState) -> Double {
        switch state {
        case .selected, .dragging: 1.0
        case .hover: 0.8
        case .rest: 0.55
        case .disabled: 0.3
        }
    }

    // MARK: - Entity-layer geometry (meters)

    /// Flat collider depth so a card never encloses its front-offset controls (the × bug fix).
    static let cardColliderDepth: Float = 0.012
    /// How far in front of the card the × control sits — frontmost, non-enclosed hit target.
    static let controlFrontGap: Float = 0.025
    /// How far ABOVE the card's top edge the × / edit controls sit, so they clear the mid-edge
    /// connection ports on short cards (the ×/input-port overlap fix).
    static let controlTopGap: Float = 0.03

    // MARK: - Type trays (translucent backing behind each type column)

    /// Opacity of a type tray's translucent, type-tinted backing slab (nodes read as "in" the tray).
    static let trayShadeOpacity: Float = 0.14

    // MARK: - Connection ports (drag-to-connect)

    /// Half-extent of the connection port handle's collider box (meters).
    static let portColliderHalf: Float = 0.022
    /// How far in front of the card the connection port sits (frontmost, non-enclosed — same as ×).
    static let portFrontGap: Float = controlFrontGap
    /// Inset of the port from the card's right border (meters).
    static let portInset: Float = 0.018
    /// Drop-target search radius for a released port — ~one card width. (SpatialTokens.width(.taskNode)
    /// is 210 pt; RealityKit attachments default to ~1360 pt/m ⇒ ≈0.154 m; rounded forgiving.)
    static let dropTargetRadius: Float = 0.16
}
