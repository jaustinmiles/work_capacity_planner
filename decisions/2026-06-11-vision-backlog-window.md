# Vision Pro: Backlog / New Task Type panels — movability fix

## Context

Feedback: "Vision Pro Backlog and New Task Type Panels Immovable — Cannot move these panels
around, and the new task type panel spawns way too far overhead."

The Backlog tray was a **scene ornament** (`.ornament(attachmentAnchor: .scene(.trailing))`),
and the "New Task Type" form was a **sheet presented from inside that ornament**. Ornaments are
anchored to the volume by the system and cannot be repositioned by the user; sheets presented
from ornament contexts are placed by the system at odd offsets (the "spawns way too far
overhead" symptom).

## Options

1. **Promote the Backlog panel (with its New Task Type button) to its own `WindowGroup`.**
   Windows are natively user-movable on visionOS, and sheets center over their window. Matches
   the established precedent (the AI chat is already its own window) and the data-loading
   doctrine (each surface fetches what it needs, syncing via `SpatialRoot.sceneReloadToken`).
2. **Make the in-scene type-panel ENTITIES draggable** (`isMovable += .typePanel`). The
   manual-position plumbing would support it (relayout only places origin-placeholder entities),
   BUT the tray backing slabs and task columns are laid out by computed lane, so a dragged panel
   header would separate from its column/shading — a half-broken interaction.
3. Keep ornaments and only fix the sheet position. Doesn't address "cannot move".

## Decision

Option 1. The Backlog ornament becomes `BacklogWindowView` in its own window
(`SpatialWindowID.backlog`), opened from the volume toolbar. It fetches its own task list,
classifies via the shared `SpatialTaskClassifier`, and syncs with the volume bidirectionally
through `sceneReloadToken`. The New Task Type sheet now centers over the window. The Endeavors
and Done ornaments are unchanged (not part of the feedback).

## Tradeoffs

- The window doesn't follow the volume when the volume is moved — that's the point (the user
  places it), but it's a behavior change from the docked tray.
- Option 2 (draggable type panels) deliberately NOT done: without column/tray-slab follow logic
  it creates a detached header. If users ask to rearrange type columns, implement lane
  reordering in the layout engine instead.

## Reversibility

High — the old ornament was a ~50-line view; restoring it is a small revert. The window adds an
id + WindowGroup and no schema/server changes.
