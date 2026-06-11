import Foundation

/// The interaction state of a spatial component, driving its tokenized visual treatment
/// (border weight, tint emphasis). The full per-entity state machine that sets `.hover`/
/// `.dragging` arrives with the SceneModel (Phase D); for now cards resolve to `.rest` or
/// `.selected` (picked for merge/link).
enum InteractionState: Equatable {
    case rest
    case hover
    case selected
    case dragging
    case disabled
}
