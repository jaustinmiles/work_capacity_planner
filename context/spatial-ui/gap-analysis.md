# Spatial UI — Gap Analysis

_Code-grounded comparison of the current `TaskPlannerVision/Spatial` code vs researched best practice (7 subsystem agents). **57 gaps total** — 🔴 8 critical, 🟠 27 high, 🟡 17 medium, ⚪ 5 low._

| Subsystem | 🔴 | 🟠 | 🟡 | ⚪ |
|---|---|---|---|---|
| transform-state-ownership | 2 | 4 | 1 | 0 |
| gestures-input-routing | 1 | 3 | 2 | 1 |
| hover-highlight-focus | 1 | 3 | 3 | 1 |
| collision-hittest | 1 | 5 | 2 | 1 |
| animation | 1 | 4 | 4 | 2 |
| materials-visual-design | 0 | 3 | 4 | 0 |
| architecture-scalability | 2 | 5 | 1 | 0 |

## transform-state-ownership

**Current approach:** p

### 🔴 CRITICAL — reconcile re-asserts every card's stored position every update pass - root cause of drag snap-back

The update closure is the de-facto transform owner: each pass it overwrites every non-dragged card with the stale stored model position (only written on onEnded). Any observed change firing the closure mid-drag yanks the card back; a raced reconcile on release leaves the snap-back. WWDC25 274: never mutate observed entity state in the update closure.

- **Evidence:** SpatialSceneView.swift:246-250: if entity.id != draggingID then card.position = clamp(stored positionX/Y/Z); called from the update closure (25-26) which reads viewModel.renderedEntities (231).
- **Best practice:** Encode ownership (a TransformAuthorityComponent (model,gesture,animating) or visionOS 26 ManipulationComponent, which owns the transform during manipulation). Reconcile owns IDENTITY only, writing a transform once on first add or explicit relayout.
- **Fix:** Delete the re-assert at 246-250. Use ManipulationComponent.configureEntity + releaseBehavior stay, persist in WillEnd, clamp in DidUpdateTransform. If keeping the gesture, write the transform only in the gesture closure; reconcile places only when card.parent==nil.

### 🔴 CRITICAL — State draggingID guard cannot reliably suppress the re-assert mid-drag

The only guard is a SwiftUI State var draggingID set in the gesture onChanged. State mutated in a gesture closure is not reliably visible to the update closure before the next reconcile (the developer's failed fix; update is body evaluation, not gesture timing), so the guard races and the card is re-stamped to its stale position.

- **Evidence:** SpatialSceneView.swift:20 @State var draggingID; set at 108 (onChanged); read at 246 (reconcile); cleared at 114 (onEnded).
- **Best practice:** Encode ownership where the update closure can reliably read it: a Component on the entity or an Observable view model field. With ManipulationComponent the component owns the transform, so there is nothing to guard.
- **Fix:** Delete draggingID (20, 108, 114, 246). With ManipulationComponent transfer is automatic; otherwise use an entity-local marker component or @Observable activeDragID. Removing the re-assert (gap 1) makes the guard moot.

### 🟠 HIGH — Drag-end persistence writes the observed entities array, re-firing update on release

endDrag calls updateLocalPosition, mutating the Observable entities array and re-firing the update closure. draggingID is cleared to nil (114) BEFORE the async endDrag Task runs (118), so the next reconcile re-asserts card.position from the just-written model value; any clamp/float/relayout difference makes the card jump on release.

- **Evidence:** SpatialSceneView.swift:112-118: onEnded sets draggingID=nil (114) then Task endDrag (118). SpatialSceneViewModel.swift:353-357 endDrag to updateLocalPosition (344-349) writes entities[idx].positionX/Y/Z.
- **Best practice:** On release the entity transform is already authoritative; persist without re-pushing a model value onto the entity the same frame.
- **Fix:** Persist from ManipulationEvents WillEnd; stop reconcile re-asserting transforms (gap 1).

### 🟠 HIGH — Edges and ports are deleted and fully rebuilt from scratch every reconcile pass

drawEdges removes every edge/port entity and re-creates new ModelEntity meshes plus materials for every edge and link each pass - immediate-mode in a retained-mode engine: O(edges) churn, flicker, poor scaling. Reconcile runs on every model mutation.

- **Evidence:** SpatialSceneView.swift:311-314 removes all edge-prefixed entities; 316-339 rebuilds posByEntity and re-adds every edge via addEdge (342-374): new ModelEntity (355-358) plus two sphere ports per edge (365-373). Called unconditionally at 270.
- **Best practice:** Make edges persistent stably-keyed entities updated in place from live positions in an EdgeSystem. Gate full rebuild behind edgesDirty.
- **Fix:** Create edge/port entities once keyed by composite id; add only new and remove only gone. Reposition endpoints in an EdgeSystem update from live positions. Stop the teardown at 311-314.

### 🟠 HIGH — reconcile is one monolithic pass with a single broad observation dependency

reconcile does five jobs and reads renderedEntities plus links and step, so the whole pass re-runs on ANY observed mutation. No dirty-set - one stale write triggers a full-scene rebuild that fights live interaction.

- **Evidence:** SpatialSceneView.swift:230-271: removal (235-236), add/position (239-250), collision (253-264), controls (267), edges (270). Reads renderedEntities (231); drawEdges reads step (327), links (335).
- **Best practice:** Split by lifetime: reconcile handles identity only; continuous behavior lives in Systems via marker components + EntityQuery.
- **Fix:** Make reconcile identity-only; move edges and transform glide to Systems.

### 🟠 HIGH — Two unsynchronized write paths for the same transform; no single source of truth

Position is written authoritatively in two unsynchronized places: the live entity transform (gesture, 110) and stored positionX/Y/Z. Reconcile copies model to entity while the gesture copies entity to model on release. relayout persists only for entities at the origin, so the origin doubles as both sentinel and legal coordinate.

- **Evidence:** Live: SpatialSceneView.swift:110 setPosition. Model: VM 139-141, 344-349, 354, 523. Reconcile model-to-entity at 246-250. Sentinel: VM:137 isPlaceholder tests abs(axis)less than 1e-4.
- **Best practice:** One source of truth, unidirectional. Do not overload the origin as a sentinel.
- **Fix:** Make the entity transform the runtime source of truth; replace the origin sentinel (VM 137-138) with an explicit placement flag.

### 🟡 MEDIUM — CollisionComponent regenerated from visualBounds every pass instead of once

Each pass, for every entity, the code recomputes visualBounds and resets InputTargetComponent, HoverEffectComponent, and a fresh CollisionComponent box - needless work, and recursive-visualBounds is a documented feedback/drift trap.

- **Evidence:** SpatialSceneView.swift:253-264: per pass sets InputTargetComponent, HoverEffectComponent, computes card.visualBounds(recursive false), then sets CollisionComponent; inside the loop at 239.
- **Best practice:** Set Input/Collision/Hover once at creation; recompute collision only on real size change.
- **Fix:** Wire components in a one-time factory step gated on card.parent==nil; cache the box size.

---

## gestures-input-routing

**Current approach:** All input is routed through two top-level SwiftUI gestures attached to the RealityView in `SpatialSceneView.body` — `.gesture(dragGesture)` and `.gesture(tapGesture)` (SpatialSceneView.swift:32-33). Both use `DragGesture()/TapGesture().targetedToAnyEntity()` (lines 103, 126), so a single handler receives hits for EVERY entity in the scene (cards, the × badge, edge lines, port spheres) and must disambiguate after the fact. Disambiguation is done by parsing the hit entity's `name` string: a `ctl::<role>::<ownerId>` prefix marks control children and `edge::` marks edges (controlPrefix line 83, controlRole parser lines 86-91, isControlOrEdge lines 93-95, edgePrefix line 376). The drag handler hand-rolls translation math: on first `onChanged` it captures `value.entity.position(relativeTo: nil)` into a `@State dragStart`, converts `value.translation3D` via `value.convert(..., from: .local, to: .scene)`, adds the delta, clamps, and calls `setPosition(..., relativeTo: nil)` (lines 104-111); on `onEnded` it persists via `viewModel.endDrag` (lines 112-119). Drag ownership is signalled with a second `@State draggingID` (line 20) that `reconcile` reads to skip re-asserting the dragged card's position (line 246). Tap routing branches on string role first, then looks up the entity in the view model and dispatches by connect/link mode and entity kind (lines 127-147). Connect (merge) and link modes are SwiftUI `@State` booleans + source-id holders toggled from toolbar buttons (lines 14-17, 64-70) and consumed in two-tap state machines (handleConnectTap lines 165-173, handleLinkTap lines 176-184). No `ManipulationComponent`, `GestureComponent`, `allowedInputTypes`, or gesture composition/exclusivity exists anywhere in the target (grep confirmed).

### 🔴 CRITICAL — Hand-rolled translation-grab drag instead of ManipulationComponent, and the @State draggingID guard cannot reliably suppress reconcile

The drag is a custom DragGesture that captures a start position into @State (dragStart), applies a converted translation delta, and writes the entity transform every onChanged; reconcile is told to back off via a separate @State draggingID. This is the documented root cause of the drag snap-back: @State mutated inside a RealityKit gesture .onChanged is not reliably visible to the RealityView update/reconcile closure before the next pass, so reconcile re-asserts the stale view-model position and the card jerks back. The platform now owns this entirely via ManipulationComponent (visionOS 26), which holds the transform during the gesture so no app-side ownership flag is needed.

- **Evidence:** SpatialSceneView.swift:104-111 (onChanged: `let start = dragStart ?? value.entity.position(relativeTo: nil)` / `if dragStart == nil { dragStart = start }` / `if draggingID != value.entity.name { draggingID = value.entity.name }` / `value.entity.setPosition(VolumeMetrics.standard.clamp(start + delta), relativeTo: nil)`); the guard it depends on is read in reconcile at SpatialSceneView.swift:246 (`if entity.id != draggingID { card.position = ... }`); declarations at lines 19-20. grep confirms zero ManipulationComponent usage in the target.
- **Best practice:** visionOS 26 ManipulationComponent.configureEntity(entity, hoverEffect:, allowedInputTypes:, collisionShapes:) provides pick-up/move/rotate/scale where RealityKit owns the transform during manipulation; set releaseBehavior = .stay (default .reset is itself a snap-back) and persist on ManipulationEvents.WillEnd. Apple (WWDC25 274) is explicit that transforms must be owned by exactly one authority at a time and must not be re-asserted from the update closure.
- **Fix:** Adopt ManipulationComponent for all movable entities (taskNode/stepNode/note/workflowVolume). Call ManipulationComponent.configureEntity once at entity creation, set releaseBehavior = .stay and dynamics to translate-only where appropriate, clamp to VolumeMetrics inside a ManipulationEvents.DidUpdateTransform subscription, and call viewModel.endDrag from WillEnd reading the final entity transform. Delete dragGesture, dragStart, draggingID, and the reconcile position-skip — there is then nothing for reconcile to fight.

### 🟠 HIGH — Single .targetedToAnyEntity() gesture pair forces stringly-typed name-prefix disambiguation

Because both gestures target ANY entity, the handlers must reverse-engineer the hit entity's role by parsing its `name`. Roles are encoded as `ctl::<role>::<ownerId>` and `edge::` string prefixes and re-parsed on every interaction. This stringly-typed dispatch is fragile (a name collision or a missing prefix silently misroutes), centralizes all interaction logic into two megafunctions, overloads `entity.name` as both stable id AND role carrier, and does not scale as new entity kinds/controls are added.

- **Evidence:** SpatialSceneView.swift:83 (`static let controlPrefix = "ctl::"`), 86-91 (controlRole splits on `::`), 93-95 (isControlOrEdge), 105 (`guard !isControlOrEdge(value.entity.name)` in drag), 115 (same in onEnded), 130 (`if let role = controlRole(name)` in tap), 281 (`"\(Self.controlPrefix)dismiss::\(entity.id)"`), 359/370 (`"\(Self.edgePrefix)line"`/`port`), 376 (edgePrefix). Note entity.name is simultaneously the id (line 243 `card.name = entity.id`).
- **Best practice:** visionOS 26 GestureComponent attaches a SwiftUI gesture directly to a single entity, reporting values in that entity's coordinate space, so each card/control carries its own handler and identity/role live in typed custom Components (Component-conforming structs) read via value.entity.components[...], not parsed from names. CollisionFilter/CollisionGroup masks route hit-testing by category.
- **Fix:** Introduce a typed SpatialRoleComponent (kind + ownerId) on every entity and replace name parsing with component lookups. Where possible attach per-entity GestureComponents (card tap-to-edit, × tap-to-dismiss) so dispatch is intrinsic. Stop using entity.name for role; keep it solely as the stable id. For ad-hoc hit queries use CollisionGroup masks (e.g. .node/.control/.edge) instead of prefix checks.

### 🟠 HIGH — Drag and tap are independent top-level gestures with no composition/exclusivity, inviting tap/drag conflicts

DragGesture and TapGesture are added as two separate .gesture() modifiers with no Exclusively/Simultaneously/Sequenced relationship and no minimum-distance/duration gating. On visionOS indirect input a pinch-move can register as both a small drag and a tap, so a card edit (tap) can fire after a tiny drag, or a drag can be swallowed by tap recognition. There is no explicit precedence, so resolution is left to SwiftUI defaults rather than designed.

- **Evidence:** SpatialSceneView.swift:32-33 (`.gesture(dragGesture)` then `.gesture(tapGesture)` as separate modifiers); dragGesture (101-120) and tapGesture (124-148) share `.targetedToAnyEntity()` over the same entities with no composition operator and no `minimumDistance`/threshold.
- **Best practice:** visionOS interaction stacks (Apple, MRTK3/XRI) treat tap vs drag as a designed precedence: compose gestures (e.g. ExclusiveGesture or a drag with a minimum translation distance before it claims the entity) so a sub-threshold movement is a tap and a supra-threshold movement is a drag. With ManipulationComponent, move is system-owned and a separate per-entity TapGesture handles selection cleanly.
- **Fix:** After adopting ManipulationComponent for move, keep only a per-entity TapGesture (via GestureComponent) for edit/select; the system separates manipulation from tap. If a custom DragGesture is retained as a fallback, give it a minimumDistance so taps win below threshold, and compose drag/tap with ExclusiveGesture rather than two unrelated .gesture() modifiers.

### 🟠 HIGH — The × dismiss control's tap is routed by name parsing while its collider is enclosed by the parent card collider, so it is never reliably hit

The × badge has no own gesture; its click depends on the global tapGesture matching `ctl::dismiss::<id>` (name parsing). But the badge is a child only +0.006 m in front of a parent card whose CollisionComponent is inflated to depth max(z,0.03) (~3 cm), so the parent collider encloses the child and the gaze/pinch hit resolves to the parent first — the badge's tap (and its SwiftUI .hoverEffect highlight) effectively never fire. This is a gesture-routing defect (input precedence) not just a visual one: the routing layer assumes the child is independently hittable when the collision hierarchy guarantees it is not.

- **Evidence:** SpatialSceneView.swift:130-132 (× action only reachable when global tap matches `controlRole(name)` with role=="dismiss"), 281 (control name), 288-292 (badge positioned at parent center+extents with z `+ 0.006`), 302 (child collider box `[0.05,0.05,0.02]`), 259-260 (parent collider depth `max(e.z, 0.03)`), 264 (parent CollisionComponent set); SwiftUI hover at 463-465 cannot activate because the parent swallows the hit.
- **Best practice:** InputTargetComponent/CollisionComponent are hierarchical and resolve geometrically: a parent collider that encloses a child swallows the child's hover/tap (Apple DTS, forum 747256). The child control needs its own non-overlapping collider clearly offset beyond the parent box (or the parent collider depth must be shallow/inset), its own HoverEffectComponent, and ideally its own GestureComponent rather than relying on a global gesture + name parse.
- **Fix:** Give the × its own GestureComponent (TapGesture) so its tap is intrinsic and not name-routed; move the badge far enough in +z (or out to the side) that the parent collider does not contain it, and/or stop inflating the card collider depth to max(z,0.03). Add a real HoverEffectComponent on the badge entity. Then remove the controlRole tap branch from the global dispatcher.

### 🟡 MEDIUM — Drag coordinate conversion mixes .local/.scene with relativeTo:nil and is brittle to user re-orientation

The drag converts translation `from: .local, to: .scene` but reads and writes the entity position `relativeTo: nil` (world). Mixing the entity's local space with scene/world for the delta is the kind of hand-rolled coordinate math that breaks when the user turns: DragGesture translation stays relative to the original facing direction, so far/rotated cards drift incorrectly. The clamp is also applied to a world-space sum without accounting for the entity's parent frame.

- **Evidence:** SpatialSceneView.swift:106 (`value.entity.position(relativeTo: nil)`), 109 (`let delta = value.convert(value.translation3D, from: .local, to: .scene)`), 110 (`value.entity.setPosition(VolumeMetrics.standard.clamp(start + delta), relativeTo: nil)`).
- **Best practice:** visionOS 26 provides the Unified Coordinate Conversion API (CoordinateSpace3D on Entity/Scene, GeometryProxy3D.coordinateSpace3D()) to replace manual point-to-meter/axis math, and ManipulationComponent handles re-orientation during a drag automatically (the exact case manual translation deltas get wrong).
- **Fix:** Prefer ManipulationComponent so this math disappears. If a manual drag must remain, use a single consistent space (convert and write in the same coordinate space, accounting for the entity's parent) and the CoordinateSpace3D API rather than ad-hoc .local→.scene with relativeTo:nil; clamp in the same space the position is stored in.

### 🟡 MEDIUM — Connect/link modes are SwiftUI @State two-tap state machines coupled into the global tap dispatcher

Merge (connect) and link are modal booleans plus source-id holders held as view @State and consumed inside the single global tapGesture, which must branch connectMode → linkMode → kind. This couples a transient interaction mode into the same name-parsing dispatcher as every other tap, makes the tap handler grow with each new mode, and provides no in-scene affordance on candidate entities beyond an isHighlighted flag derived from isPicked. There is also no guard preventing a drag from being interpreted while in connect/link mode, nor cross-cancellation if a sheet opens mid-mode.

- **Evidence:** SpatialSceneView.swift:14-17 (connectMode/connectSourceID/linkMode/linkSourceID @State), 64-70 (toolbar toggles), 136-147 (tap branches on connectMode/linkMode/kind), 165-173 (handleConnectTap), 176-184 (handleLinkTap), 186-188 (isPicked feeds only NodeCardView.isHighlighted at 413/423).
- **Best practice:** Cross-engine UI architecture (MRTK3/XRI, unidirectional MVU) models interaction modes/selection as explicit, observed state reduced from intents, with the visual feedback driven by an observed state→style mapping rather than baked into the dispatcher. A four-state vocabulary (hover/select/focus/activate) plus per-entity gestures keeps modes out of one megafunction.
- **Fix:** Lift connect/link into an explicit interaction-mode state on the @Observable view model with intents (.pickedSource, .completedConnect, etc.), drive candidate highlight/hover via an observed state machine (HoverEffectComponent + selection lift), and route picks through per-entity gestures rather than the global tap switch. Ensure entering a mode disables manipulation/tap-to-edit so a pick can't be misread as a drag or edit.

### ⚪ LOW — No allowedInputTypes / input-type policy on interactive entities

InputTargetComponent is added to cards and the badge with no allowedInputTypes specified (defaults to all). Indirect (gaze+pinch) is the comfortable primary modality and some controls/edges should be excluded from input entirely. Edges/ports are created as plain ModelEntities with no InputTargetComponent (good) but are still matched by the global gesture via name-prefix exclusion (isControlOrEdge) rather than being structurally non-interactive, meaning a routing mistake re-includes them.

- **Evidence:** SpatialSceneView.swift:253 (`card.components.set(InputTargetComponent())` with no allowedInputTypes), 301 (badge InputTargetComponent, same), 355-373 (edge `line`/`port` ModelEntities have no InputTargetComponent but rely on isControlOrEdge name checks at 105/115 to be ignored).
- **Best practice:** Set InputTargetComponent.allowedInputTypes deliberately (e.g. .indirect for cards) per Apple's input guidance, and make decorative geometry structurally non-interactive (no InputTargetComponent + excluded via CollisionGroup mask) so routing correctness does not depend on string-prefix exclusion.
- **Fix:** Specify allowedInputTypes on interactive entities (default .indirect for cards/controls), and route gestures by CollisionGroup mask so edges/ports are excluded by category rather than by name-prefix checks — eliminating the isControlOrEdge guard.

---

## hover-highlight-focus

**Current approach:** Hover/highlight/focus/selection in the Vision target is almost entirely absent as a real subsystem; what exists is fragmentary and split across two layers that do not talk to each other.

1. RealityKit-level "hover": In `reconcile()`, every rendered card gets a bare `HoverEffectComponent()` set fresh on every update pass (SpatialSceneView.swift:254), and every dismiss-× child entity gets a bare `HoverEffectComponent()` once at creation (SpatialSceneView.swift:303). These are default-style (spotlight) components with no GroupID, no `.highlight`/`.shader` style, and no app-readable state. They are purely the system gaze glow.

2. The × control "highlight" is attempted in SwiftUI, not RealityKit: `DismissBadge` (SpatialSceneView.swift:457-467) puts a `.hoverEffect { effect, isActive, _ in effect.scaleEffect(isActive ? 1.3 : 1.0) }` (lines 463-465) INSIDE the `ViewAttachmentComponent(rootView: DismissBadge())` (line 300). This 2D SwiftUI hover effect only fires if the badge entity actually receives the system gaze hit.

3. The × badge's collision is enclosed by the parent card's collision. The parent card collision box is `ShapeResource.generateBox(size: boxSize)` with `boxSize.z = max(e.z, 0.03)` (SpatialSceneView.swift:260) — i.e. at least 3 cm deep, centered on the card. The badge is parented to the card (SpatialSceneView.swift:304) and positioned only `+0.006` (6 mm) in front of the card face (SpatialSceneView.swift:291), with its own 2-cm-deep collision box `[0.05, 0.05, 0.02]` (SpatialSceneView.swift:302). The badge front face sits at roughly card-front + 0.006 + 0.01 = +0.016 m, while the parent card collision front face extends to +0.015 m (half of 0.03) — so the badge is essentially co-located with / engulfed by the parent's collision volume.

4. App-level selection state: the ONLY app-visible "highlight" is `isHighlighted` on `NodeCardView` (NodeCardView.swift:10, 43-44), which is wired solely to `isPicked(entity.id)` (SpatialSceneView.swift:413, 423). `isPicked` (SpatialSceneView.swift:186-188) returns true only when the id equals `connectSourceID` or `linkSourceID` — i.e. it is exclusively the "first card picked during a Merge/Link operation" border. There is no general selection, no hover state, no focus state, no edit-target highlight. `selectedEntityID`/`selectedNoteID` (SpatialSceneView.swift:12, 18) drive a `.sheet` but never feed any visual highlight on the card itself. The view model (`@Observable`, SpatialSceneViewModel.swift:11-12) exposes no hover/selection/focus fields at all.

There is no state machine, no shared vocabulary (rest/hover/selected/dragging/disabled), and the two highlight mechanisms (RealityKit gaze glow vs SwiftUI scale-on-hover vs SwiftUI picked-border) are uncoordinated.

### 🔴 CRITICAL — × dismiss control never highlights: parent card collision encloses the badge so gaze never resolves to it

The dismiss × badge is a child of the card and is positioned only 6 mm in front of the card face, while the parent card's collision box is forced to at least 30 mm deep and centered on the card. The badge's own 20 mm-deep collider therefore sits inside (or co-planar with) the parent's collision volume. Per Apple DTS (forum 747256), when a parent collision shape with an InputTargetComponent fully encompasses a child's collision shape, the parent is hit first and the child becomes unreachable — so the system gaze ray resolves to the card, not the badge, and the badge's hover/tap never fires. This is the literal root cause of bug #2.

- **Evidence:** SpatialSceneView.swift:260 sets parent collision depth `max(e.z, 0.03)` (>=30mm) centered on the card; SpatialSceneView.swift:253 sets the parent `InputTargetComponent()`; SpatialSceneView.swift:291 offsets the badge only `bounds.center.z + bounds.extents.z/2 + 0.006` (6mm forward); SpatialSceneView.swift:302 gives the badge a 20mm-deep collider `[0.05,0.05,0.02]`; SpatialSceneView.swift:304 parents the badge to the card. The badge front (~+0.016m) is inside the parent collision front (~+0.015m).
- **Best practice:** An interactive child control must have its own CollisionComponent that is NOT enclosed by an ancestor's collision volume; hit/hover resolves geometrically and the enclosing parent wins. Either shrink the parent card collider z-depth to the actual card thickness (do not inflate to 0.03), push the control clearly outside the parent box (>=2-3 cm of real z-separation, not 6 mm), or set the parent card's `InputTargetComponent.isEnabled=false` and make a dedicated card-body child the drag target so the badge is independently hit-testable.
- **Fix:** Stop inflating the parent collider depth: size it to the card's real thickness (e.g. ~0.01m) instead of `max(e.z, 0.03)`. Offset the × badge to a real z-gap clear of the parent box (e.g. +0.025-0.03m) and/or move it outside the card's xy footprint. Add a distinct `HoverEffectComponent.GroupID` to the badge so its activation is isolated from the card. Verify the badge is the frontmost collider for gaze with a debug wireframe / `scene.raycast`.

### 🟠 HIGH — × highlight is driven by a SwiftUI .hoverEffect buried in a ViewAttachment instead of a RealityKit HoverEffectComponent style

`DismissBadge` relies on `.hoverEffect { effect, isActive, _ in effect.scaleEffect(...) }` inside the attachment's rootView to scale the ×. Even once the enclosure bug (gap above) is fixed so the badge receives gaze, a SwiftUI 2D `.hoverEffect` scales the attachment's flat SwiftUI content in its own 2D space and is not a dependable RealityKit-visible signal for an entity-targeted control; research repeatedly flags this exact pattern (SwiftUI scaleEffect inside ViewAttachmentComponent) as unreliable for placed entities. The badge already carries a bare `HoverEffectComponent()` (the system gaze glow), but nothing maps gaze to the intended scale/jitter feedback in a RealityKit-owned way.

- **Evidence:** SpatialSceneView.swift:463-465 `.hoverEffect { effect, isActive, _ in effect.scaleEffect(isActive ? 1.3 : 1.0) }` inside `DismissBadge` (SpatialSceneView.swift:457-467); SpatialSceneView.swift:300 wraps it via `ViewAttachmentComponent(rootView: DismissBadge())`; SpatialSceneView.swift:303 adds a plain `HoverEffectComponent()` with no style.
- **Best practice:** Drive control highlight with a RealityKit `HoverEffectComponent` style: `.highlight(HighlightHoverEffectStyle(color:strength:))` for a tint, or `.shader(...)` (ShaderGraph HoverState 0->1) for animated glow/jitter. For an entity-transform 'pop'/jitter, animate via `Entity.animate` reacting to hover, not a SwiftUI scaleEffect on flat content.
- **Fix:** Replace the bare `HoverEffectComponent()` on the badge with `HoverEffectComponent(.highlight(...))` (or `.shader`) so the control visibly responds in 3D, and keep the SwiftUI .hoverEffect only as a secondary 2D cue. If a true scale 'jitter' is wanted, drive it with `Entity.animate(.spring)` on the badge entity transform.

### 🟠 HIGH — No app-level hover/selection/focus state machine — the entire interaction-feedback layer is missing

There is no shared interaction-state vocabulary (rest/hover/selected/dragging/disabled) anywhere in the Vision target. The only app-visible highlight (`isHighlighted`) is exclusively the merge/link picked border; `selectedEntityID`/`selectedNoteID` only open a sheet and never highlight their card; dragging produces no visual state; nothing reflects edit-target, focus, or general selection. Research (MRTK3 'interactables are pure state + a separate visual driver', WWDC25 274 Observable entities) is unanimous that visuals should be a pure function of an observed interaction-state, decoupled from interaction logic. As the UI grows (new entity kinds, new controls), each will need ad-hoc highlight code with no central authority — exactly the unscalable foundation the developer flagged.

- **Evidence:** Selection highlight is only `isPicked` (SpatialSceneView.swift:186-188) -> `isHighlighted` (SpatialSceneView.swift:413, 423; NodeCardView.swift:10, 43-44). `selectedEntityID`/`selectedNoteID` (SpatialSceneView.swift:12,18) only feed `.sheet` (SpatialSceneView.swift:34-43) with no card highlight. The `@Observable` view model (SpatialSceneViewModel.swift:11-12) exposes no hover/selection/focus state. Grep across the target for `onHover`/`HoverState`/`isHovered`/`@FocusState`/`HoverEffectGroup` returns nothing.
- **Best practice:** Introduce an explicit per-entity interaction state (rest/hover/selected/dragging/disabled) as a RealityKit Component or an @Observable view-model field, with a small visual-driver layer that maps state -> visuals (glass level, border, HoverEffectComponent style, jitter). Cards/controls become variants of one primitive parameterized by tokens + state.
- **Fix:** Add an `InteractionStateComponent` (or `@Observable` selection/hover fields) as the single source of truth; build a NodeStateSystem (or a SwiftUI visual driver reading observed state) that maps state to NodeCardView styling and HoverEffectComponent style. Rename/replace the merge-only `isHighlighted` with a richer `selectionRole` so the picked border is just one state, not the only one.

### 🟠 HIGH — Card HoverEffectComponent/InputTarget/CollisionComponent re-created on every reconcile pass, churning hover state

Inside the per-entity loop in `reconcile()`, the card's `InputTargetComponent`, `HoverEffectComponent`, and `CollisionComponent` are re-`.set` on EVERY update pass (which fires on any Observable change), and the collision shape is regenerated from `card.visualBounds(recursive:false)` each time. `reconcile` runs from the RealityView update closure, which is not a per-frame tick but re-fires on every observed change. Re-setting hover/input/collision components mid-interaction can reset in-flight hover/highlight state and is pure churn; it also fights the locked 'don't mutate observed entity state in update' rule. For a hover subsystem this means hover feedback can be interrupted whenever any unrelated state changes.

- **Evidence:** SpatialSceneView.swift:253 `card.components.set(InputTargetComponent())`, :254 `card.components.set(HoverEffectComponent())`, :255-264 regenerates `visualBounds` and `card.components.set(CollisionComponent(...))` — all unconditionally inside `for entity in rendered` (SpatialSceneView.swift:239) which runs from the update closure (SpatialSceneView.swift:25-26).
- **Best practice:** Set InputTarget/Hover/Collision ONCE at entity creation (or only when geometry truly changes); reconcile should be identity-only (add/remove/attach). Continuous concerns belong in Systems. Never re-assert input/hover/collision components on every observed change.
- **Fix:** Move the InputTargetComponent/HoverEffectComponent/CollisionComponent setup into a one-time entity factory keyed on `card.parent == nil` (new entity). Only rebuild the collision shape when the card's intrinsic size actually changes, and cache it. Keep hover style assignment out of the per-pass loop.

### 🟡 MEDIUM — Card hover glow conveys nothing actionable and is not isolated from the × control (no GroupID)

Every card gets a default-style `HoverEffectComponent()` (the subtle spotlight) but no GroupID, and the × badge also gets a default `HoverEffectComponent()`. Without explicit GroupIDs, hover effects propagate hierarchically/ambiguously between the card and its child control, so even after the enclosure fix the two will not cleanly activate independently. Also, the card's hover glow gives the user no information about what a card press will do (edit vs connect vs link vs expand) — there is no mode-aware hover feedback, which matters for the ADHD audience where hover is the only pre-gesture affordance.

- **Evidence:** SpatialSceneView.swift:254 `card.components.set(HoverEffectComponent())` (no style, no GroupID); SpatialSceneView.swift:303 `badge.components.set(HoverEffectComponent())` (no style, no GroupID). No `HoverEffectGroup`/`GroupID` anywhere in the target (grep empty).
- **Best practice:** Assign distinct `HoverEffectComponent.GroupID`s to the card and its controls so each highlights independently (visionOS 2+), and use `.highlight` with a type-tinted color so hover communicates the entity's type/affordance. Hover feedback should reflect the active mode (merge/link/edit).
- **Fix:** Give the card and the × badge distinct GroupIDs. Replace the card's bare hover with `HoverEffectComponent(.highlight(HighlightHoverEffectStyle(color: typeTint, strength:)))`. Optionally vary the hover style/tint when `connectMode`/`linkMode` is active so hover signals 'tap to merge/link'.

### 🟡 MEDIUM — Picked-for-merge highlight (isHighlighted) is recomputed per reconcile pass and conflated with the only selection concept

`isPicked` is read inside `card(for:)` to set `isHighlighted`, but `connectSourceID`/`linkSourceID` are SwiftUI `@State` on the view, and the card view is rebuilt through the attachments ForEach / reconcile path. The picked border is therefore the single, overloaded notion of 'highlight' in the whole app — it cannot represent hover, drag, edit-target, or multi-select, and its border uses a hardcoded `Color.accentColor` / `lineWidth 5` rather than a tokenized selection style. This blocks any scalable selection/focus model.

- **Evidence:** SpatialSceneView.swift:413 & :423 pass `isHighlighted: isPicked(entity.id)`; `isPicked` (SpatialSceneView.swift:186-188) keys off `@State connectSourceID`/`linkSourceID` (SpatialSceneView.swift:15,17). NodeCardView.swift:43-44 hardcodes `Color.accentColor` and `lineWidth: isHighlighted ? 5 : 1.5`.
- **Best practice:** Model selection/highlight as an enum (e.g. .none/.pickedForMerge/.pickedForLink/.selected/.editing) sourced from observed state, with tokenized colors/line widths per state, so the same card primitive renders any feedback state consistently.
- **Fix:** Replace the boolean `isHighlighted` with a `selectionRole` enum and a token-driven border style; source it from an @Observable selection field in the view model rather than transient view @State so it survives reconcile and supports hover/edit/select states beyond merge/link.

### 🟡 MEDIUM — Edges and the × control are torn down and rebuilt every reconcile pass, destroying any hover/animation state

`drawEdges` removes every `edge::`-prefixed entity and re-adds all lines/ports from scratch on each reconcile pass, and `updateDismissControl` runs each pass too. Any in-flight hover highlight or animation on these entities is destroyed and recreated, so hover/selection feedback on ports/edges/controls cannot persist. Although edges/ports are non-interactive today, this teardown pattern blocks ever giving them hover/selection affordances and thrashes the scene as the graph grows.

- **Evidence:** SpatialSceneView.swift:312-314 `for edge in content.entities where edge.name.hasPrefix(Self.edgePrefix) { content.remove(edge) }` then re-adds in :330, :337, :355-373; called unconditionally from reconcile (SpatialSceneView.swift:270). `updateDismissControl` (SpatialSceneView.swift:267) also runs every pass.
- **Best practice:** Edges/ports/controls should be persistent, stably-keyed entities updated in place (endpoints repositioned by a System reading live positions); reconcile should diff add/remove, not rebuild. This preserves hover/selection/animation state.
- **Fix:** Key each edge by a stable composite id (source+target+kind), diff against existing edge entities, and reposition endpoints in place. Create the × badge once and only reposition it; never re-set its hover/input components per pass.

### ⚪ LOW — No reduce-motion / accessibility gating for hover/highlight feedback

The intended playful 'jitter on highlight' and the existing scale-on-hover have no `accessibilityReduceMotion` guard, and there is no `accessibilityReduceTransparency` consideration for the glass/highlight. For the stated neurodivergent/ADHD audience, hover/highlight feedback should be present and clear but motion must degrade to a crossfade when Reduce Motion is on.

- **Evidence:** SpatialSceneView.swift:463-465 scales on hover with no reduce-motion check; grep for `accessibilityReduceMotion`/`accessibilityReduceTransparency` across the target returns nothing.
- **Best practice:** Gate any hover/selection motion behind `accessibilityReduceMotion` with a crossfade/static fallback; respect `accessibilityReduceTransparency` for glass; keep highlight (a non-motion cue) always on.
- **Fix:** Read `@Environment(\.accessibilityReduceMotion)` (and reduce-transparency) in the visual driver; when set, substitute jitter/scale with a tint/opacity crossfade and keep the static highlight border/tint.

---

## collision-hittest

**Current approach:** Collision and hit-testing are rebuilt from scratch inside the imperative `reconcile(content:attachments:)` on every RealityView `update` pass (`SpatialSceneView.swift:230-271`). For every rendered entity each pass the code: sets a fresh `InputTargetComponent()` and `HoverEffectComponent()` with no configuration, measures the card's own quad with `card.visualBounds(recursive: false, relativeTo: card)` (`SpatialSceneView.swift:255`), derives a box `SIMD3(e.x, e.y, max(e.z, 0.03))` with a fixed-fallback `SIMD3(0.22, 0.12, 0.05)` (`SpatialSceneView.swift:259-261`), and assigns a brand-new `CollisionComponent(shapes:[shape])` (`SpatialSceneView.swift:263-264`). The dismiss "x" control is a child entity of the card with its own `InputTargetComponent`, a fixed `CollisionComponent(shapes:[.generateBox(size:[0.05,0.05,0.02])])`, and an unconfigured `HoverEffectComponent` (`SpatialSceneView.swift:300-304`), positioned at the card's top-left corner only `+0.006` m in front of the card face (`SpatialSceneView.swift:291`). There is a single top-level `DragGesture().targetedToAnyEntity()` and `TapGesture().targetedToAnyEntity()` (`SpatialSceneView.swift:32-33, 101-148`); hit results are disambiguated by parsing the hit entity's `name` string for `ctl::` / `edge::` prefixes (`SpatialSceneView.swift:83-95, 105, 130`). Edges/ports are full-mesh `ModelEntity`s deleted and re-added every pass with no collision/input (`SpatialSceneView.swift:311-374`). There is no `CollisionGroup`/`CollisionFilter`, no `allowedInputTypes`, no `InputTargetComponent.isEnabled`, no `HoverEffectComponent` style/`GroupID`, no `ManipulationComponent`/`GestureComponent`, and no RealityKit System — confirmed by a target-wide grep returning zero matches for all of those APIs.

### 🔴 CRITICAL — Parent card collision box encloses the child x control, swallowing its hover and tap

The card's CollisionComponent is a box of depth max(e.z,0.03) centered on bounds.center, so for a flat SwiftUI attachment (native e.z≈0) it spans center.z±0.015. The x badge is placed at bounds.center.z + extents.z/2 + 0.006 ≈ center.z+0.006 with its own 0.02-deep box, so the badge collider occupies roughly [center.z-0.004, center.z+0.016] — almost entirely inside the parent's [center.z-0.015, center.z+0.015] box and only barely protruding 0.001 m past its front face. Apple DTS confirmed an enclosing parent collider with an InputTargetComponent is always hit first, so the badge never reliably receives gaze/hover/tap. This is the root of bug #2.

- **Evidence:** Parent box depth: SpatialSceneView.swift:260 `? SIMD3(e.x, e.y, max(e.z, 0.03))`; parent collision set: SpatialSceneView.swift:263-264; badge z-offset of only +0.006: SpatialSceneView.swift:291 `bounds.center.z + bounds.extents.z / 2 + 0.006`; badge box depth 0.02: SpatialSceneView.swift:302 `.generateBox(size: [0.05, 0.05, 0.02])`.
- **Best practice:** Apple DTS (forums 747256): a parent collision shape that fully encompasses a child's, with an InputTargetComponent, makes the child unhittable because the parent is always hit first. Hit resolution is by collision geometry, not by a few-mm z difference. Controls need their own collider not enclosed by the parent and a clear separation.
- **Fix:** Give the x control a real geometric gap: offset it to at least +0.02–0.03 m in front of the card face (not +0.006), AND shrink the card's collision depth so it does not extend toward the viewer past the control (use a thin depth like 0.005–0.01 centered on the card, or offset the card box backward). Combined with a non-overlapping child box this lets the child be hit first. Long term, replace nested-control collision with input/role separation (see CollisionGroup gap).

### 🟠 HIGH — Card collision depth is inflated to max(z,0.03) for a flat 2D card, creating the enclosing volume in the first place

A SwiftUI attachment is a flat quad with near-zero z extent, but the code forces a minimum 3 cm depth via max(e.z,0.03). This artificially thickens the card into a slab that protrudes 0.015 m toward the viewer and 0.015 m behind, which is exactly what swallows the forward-offset child control and also makes overlapping cards/edges intersect in z. There is no functional reason a flat card needs 3 cm of collision depth for indirect gaze targeting.

- **Evidence:** SpatialSceneView.swift:260 `? SIMD3(e.x, e.y, max(e.z, 0.03))` and the inline comment at SpatialSceneView.swift:251-252 acknowledging child controls must not inflate bounds.
- **Best practice:** Collision shapes should match the actual hit region (ShapeResource.generateBox sized to the quad), and a flat card should have a thin/flush collider. Hierarchical input/collision precedence is geometric, so a deep parent slab is the failure mode to avoid (research: 'flatten the parent collider z so it doesn't enclose the child').
- **Fix:** Use a thin depth (e.g. 0.004–0.008 m) for card colliders, sized from token-defined card dimensions rather than max(z,0.03). If a graspable thickness is wanted, offset the card collider backward so its front face stays behind any forward-mounted controls.

### 🟠 HIGH — CollisionComponent (and the x-control collider) is regenerated from visualBounds every reconcile pass — the recursive-visualBounds feedback trap and per-frame churn

reconcile runs on every observed @Observable change and unconditionally calls visualBounds + builds a new ShapeResource + sets a new CollisionComponent for every rendered entity each pass. Even with recursive:false this is per-pass allocation/replacement of collision shapes; it also recomputes the child badge position from the same per-pass bounds. visualBounds-driven collision regeneration is the documented feedback/drift trap (project memory: recursive visualBounds feedback loop) and invalidates any in-flight hover/hit state mid-interaction. Generating shapes every pass is pure churn since the card's intrinsic size almost never changes.

- **Evidence:** reconcile loops all entities every pass: SpatialSceneView.swift:239-268; bounds measured each pass: SpatialSceneView.swift:255; new CollisionComponent set each pass: SpatialSceneView.swift:263-264; badge re-derived from per-pass bounds: SpatialSceneView.swift:288-292.
- **Best practice:** Set collision once at entity creation (or only when the card's intrinsic size actually changes), cache the shape, and never regenerate from visualBounds every frame. update is not a tick and must not rebuild scene side-effects each pass; continuous/derived work belongs in a System (research + Apple WWDC25 274).
- **Fix:** Compute the collision box once from token-defined card dimensions when the entity is first added; store it. Stop calling visualBounds in the hot path. Move any genuinely dynamic collision updates into a System gated by an explicit size-changed flag.

### 🟠 HIGH — No CollisionGroup / CollisionFilter — gesture routing relies on parsing entity name strings instead of collision masks

There is zero use of CollisionGroup/CollisionFilter anywhere in the target. Cards, the x control, ports, and edge lines all share the default collision group, so the single top-level targetedToAnyEntity gesture hits everything and the code must disambiguate by string-prefix parsing of entity.name ('ctl::', 'edge::'). Edge/port meshes have no input target but still participate in the default collision space; cards and controls compete in the same group with no precedence. This is brittle, unscalable, and gives no mechanism to make controls win over cards or to exclude decorative geometry from hit-testing.

- **Evidence:** Grep across TaskPlannerVision for CollisionGroup/CollisionFilter returns no matches. Name-prefix routing: SpatialSceneView.swift:83-95 (controlPrefix/controlRole/isControlOrEdge), used in drag at SpatialSceneView.swift:105 and tap at SpatialSceneView.swift:130. Edge prefix dispatch: SpatialSceneView.swift:312, 376.
- **Best practice:** Use CollisionGroup as an OptionSet with CollisionFilter(group:mask:) to categorize entities (.node, .control, .edge) and route gestures/raycasts by mask, so controls and nodes are distinct categories and edges/ports are excluded from input — far more robust than name parsing (research: 'route gestures by CollisionGroup/CollisionFilter instead of name parsing').
- **Fix:** Define named CollisionGroups (node, control, edge). Assign each entity a CollisionFilter. Mask the card drag gesture to .node and the control tap to .control; give edges/ports no InputTargetComponent and (optionally) an edge group excluded from all input masks. Carry role/ownerId in a typed component, not the entity name.

### 🟠 HIGH — No input-target precedence: InputTargetComponent is unconfigured (no isEnabled, no allowedInputTypes) on both parent and child

Every InputTargetComponent is created with the no-arg initializer. The parent card is left fully input-enabled even in the region occupied by the child control, and nothing makes the child take precedence. There is no use of InputTargetComponent.isEnabled (to make the card's control region pass-through) and no allowedInputTypes (to scope direct vs indirect input). Because descendant input precedence is governed by isEnabled/allowedInputTypes plus geometry, the parent keeps swallowing the child.

- **Evidence:** Parent input target, unconfigured: SpatialSceneView.swift:253 `card.components.set(InputTargetComponent())`. Child input target, unconfigured: SpatialSceneView.swift:301 `badge.components.set(InputTargetComponent())`. Grep shows no isEnabled or allowedInputTypes anywhere in the target.
- **Best practice:** A descendant's allowedInputTypes overrides ancestors and isEnabled=false hides a subtree from gestures (Apple 'Responding to gestures on an entity'). The recommended decomposition is to set the container parent's InputTargetComponent.isEnabled=false and make a dedicated child the drag target so sibling controls are independently hit-testable.
- **Fix:** Either (a) make the card body a dedicated child hit target and set the wrapper parent's InputTargetComponent.isEnabled=false so the x sibling is reachable, or (b) configure allowedInputTypes and ensure the control's collider is geometrically separated. Set allowedInputTypes to .indirect for gaze+pinch cards.

### 🟠 HIGH — Hover/highlight on the x control is driven only by a SwiftUI .hoverEffect inside the attachment, not a RealityKit-visible HoverEffectComponent style

The badge's highlight is a SwiftUI .hoverEffect { effect.scaleEffect(isActive ? 1.3 : 1.0) } inside DismissBadge's attachment rootView, while the entity carries only a plain unconfigured HoverEffectComponent(). The SwiftUI effect only fires if the system actually hover-hit-tests the badge entity — which it does not, because the parent collider swallows it. Even if it did, the default HoverEffectComponent is .spotlight and cannot scale/jitter; there is no .highlight/.shader style and no HoverEffectComponent.GroupID to decouple the control's hover from the card.

- **Evidence:** SwiftUI hoverEffect in attachment: SpatialSceneView.swift:463-465. Unconfigured HoverEffectComponent on the badge: SpatialSceneView.swift:303; on the card: SpatialSceneView.swift:254. Grep shows no .highlight/.shader/GroupID usage in the target.
- **Best practice:** Hover must be a RealityKit HoverEffectComponent with an explicit style (.highlight or .shader); HoverEffectComponent only affects its own entity (not children) and propagates ambiguously without a GroupID. visionOS 2/26 GroupID lets the control activate independently of the card (research bug #2 fix).
- **Fix:** Put a HoverEffectComponent(.highlight(...)) on the control entity with its own HoverEffectComponent.GroupID distinct from the card's, after first fixing the collider geometry so the control is actually hit-tested. Keep the SwiftUI scale as a secondary visual but do not rely on it as the RealityKit hover signal.

### 🟡 MEDIUM — Edge and port meshes have no collision/input but are deleted and re-created every pass, thrashing the collision/hit-test scene graph

drawEdges removes every edge:: entity and rebuilds all line + port ModelEntities from scratch on every reconcile pass. While edges/ports correctly carry no InputTargetComponent, the per-pass teardown/rebuild churns the scene graph that the hit-tester traverses, allocates fresh meshes/materials each pass, and (combined with the per-pass card collision rebuild) amplifies the update-loop instability. As the graph grows this is O(edges) churn per observed change.

- **Evidence:** Per-pass edge teardown: SpatialSceneView.swift:312-314; full rebuild of lines/ports: SpatialSceneView.swift:326-339, 355-373; drawEdges called every reconcile: SpatialSceneView.swift:270.
- **Best practice:** Edges should be persistent, stably-keyed entities updated in place (endpoints repositioned) by an EdgeSystem reading live positions, not delete-and-re-add each pass; decorative geometry should be excluded from input via an edge CollisionGroup with no input mask (research: 'rebuild edges incrementally').
- **Fix:** Create edge/port entities once keyed by sourceId+targetId, diff against the live set, and reposition endpoints in a System. If any collision is added to edges, put them in an .edge CollisionGroup excluded from all input masks so they never participate in hit-testing.

### 🟡 MEDIUM — Hardcoded magic collision dimensions duplicate card geometry instead of deriving from one source of truth

Collision and control dimensions are scattered magic numbers: parent fallback box 0.22x0.12x0.05, min depth 0.03, badge box 0.05x0.05x0.02, badge inset 0.02, badge z-offset 0.006, edge thickness 0.004, port radius 0.011. None reference the actual card sizes (NodeCardView 210pt, others 190–240pt) or VolumeMetrics; the card's real meter size is only ever discovered via visualBounds. This guarantees the collider and the visual can disagree and makes the enclosing-depth bug hard to reason about.

- **Evidence:** Fallback box: SpatialSceneView.swift:261 `SIMD3(0.22, 0.12, 0.05)`; min depth: SpatialSceneView.swift:260; badge box/inset/offset: SpatialSceneView.swift:302, 287, 291; edge/port dims: SpatialSceneView.swift:356, 367. Card widths: NodeCardView.swift:38 (210), TypePanelCardView.swift:21 (240), NoteCardView.swift:10 (190).
- **Best practice:** Centralize spatial dimensions (card size in meters, collider depth, control size/offset, edge thickness) in one nonisolated token source feeding both the SwiftUI frame and the collision sizing, so the collider always matches the rendered card (research: token-driven design system; VolumeMetrics precedent).
- **Fix:** Add a nonisolated SpatialTokens with per-kind card meter dimensions, collider depth, and control size/offset; size the SwiftUI .frame and the CollisionComponent from the same tokens, eliminating the visualBounds measurement entirely.

### ⚪ LOW — No raycast/manual hit-test path and no graceful handling when collision shape generation is invalid

All hit-testing goes through the two targetedToAnyEntity gestures; there is no scene.raycast path for precise frontmost/filtered queries (e.g. resolving the nearest node ignoring controls). When bounds are invalid the card silently falls back to a fixed 0.22x0.12x0.05 box that may not match the real card, and the dismiss control is dropped entirely (children removed) when valid is false — meaning a card that briefly fails to measure loses its control with no recovery beyond the next pass.

- **Evidence:** Only gesture-based hit-testing: SpatialSceneView.swift:32-33, 101-148; no raycast in target (grep). Invalid-bounds fallback box: SpatialSceneView.swift:259-261; control dropped when !valid: SpatialSceneView.swift:282-285.
- **Best practice:** For filtered/frontmost resolution use scene.raycast(...,mask:) with CollisionGroup masks; collision shapes should be derived from known dimensions so there is no invalid-bounds branch at all (research: raycast with masks; deterministic shape sizing).
- **Fix:** Once colliders derive from tokens (not visualBounds) the valid/invalid branch disappears. Where precise frontmost-node resolution is needed (e.g. connect/link targeting), add scene.raycast filtered to the .node CollisionGroup instead of relying on gesture target order.

---

## animation

**Current approach:** There is no animation layer at all. Every entity transform is hard-assigned, so all motion is an instantaneous teleport. The core path is `reconcile(content:attachments:)` (SpatialSceneView.swift:230-271), which on every RealityView `update` pass directly sets `card.position = VolumeMetrics.standard.clamp(SIMD3(entity.positionX, positionY, positionZ))` (SpatialSceneView.swift:246-250). The data-model position IS the presented position — there is no separate target-vs-presented transform, no interpolation, no follow/lerp/spring. A repo-wide grep for `animate`, `move(to:`, `content.animate`, `withAnimation`, `AnimationResource`, `playAnimation`, `FromToBy`, `easeIn/Out`, `spring`, `.transition` returns ZERO hits in TaskPlannerVision (the only matches are unrelated: `UpdateEntityTransformInput` and a single SwiftUI `.scaleEffect`). Drag writes position imperatively with no release settle (SpatialSceneView.swift:104-118). Entity removal is instant `content.remove` (235-236). Edges are deleted and rebuilt from scratch each pass (311-374). Workflow expand/collapse toggles `isRendered` and sets new positions with no transition (SpatialSceneViewModel.swift:438-500). The only animation-like code is `DismissBadge`'s SwiftUI `.hoverEffect { effect.scaleEffect(isActive ? 1.3 : 1.0) }` (SpatialSceneView.swift:463-465), which the research shows does not visibly animate a placed RealityKit entity. `sizeMultiplier`/`scaleProperty` are computed in the view model (SpatialSceneViewModel.swift:287-301) but never applied to any entity, so even scale changes have no path. `reduceMotion` is never referenced anywhere.

### 🔴 CRITICAL — No target-vs-presented transform separation: positions are hard-set, never interpolated

The scene has a single transform value per entity (the data-model position) written directly to the live entity each reconcile pass. There is no 'target pose' vs 'presented pose' distinction, so there is nowhere for an animation to live — any change to a position is, by construction, an instantaneous jump. This is the architectural root that blocks ALL transitions: create, layout reflow, return-to-tray, expand/collapse, and drag-release all teleport because the only mechanism is direct assignment.

- **Evidence:** SpatialSceneView.swift:246-250 — `if entity.id != draggingID { card.position = VolumeMetrics.standard.clamp(SIMD3(Float(entity.positionX), Float(entity.positionY), Float(entity.positionZ))) }`. Layout output flows straight into `entities[idx].positionX/Y/Z` (SpatialSceneViewModel.swift:139-141) then into `card.position` with no intermediate target. Repo-wide grep for `animate`/`move(to:` in TaskPlannerVision returns nothing.
- **Best practice:** Engines separate 'where it should be' (target, owned by data/layout) from 'where it is drawn' (presented, interpolated). visionOS 26 provides this via `Entity.animate(.easeInOut(duration:)) { entity.transform = target }` and `content.animate { }`; pre-26 fallback `entity.move(to:relativeTo:duration:timingFunction:)`. Set the TARGET, let RealityKit interpolate (WWDC25 274; Rory Driscoll frame-rate-independent damping; theorangeduck critically-damped spring).
- **Fix:** Introduce an explicit target transform per entity distinct from the live entity transform. In reconcile, when an entity's target changes and it is NOT under gesture ownership, drive it with `entity.animate(.easeInOut(duration: token))` (or `move(to:)`) instead of `card.position = ...`. This converts every layout move into a smooth glide and is the prerequisite for all other animation gaps.

### 🟠 HIGH — Cards teleport into existence on create with no entrance transition

A newly created entity (task/note/panel/step) is added at its final position with no fade-in, scale-up, or fly-in. New cards pop instantly, jarring in a spatial workspace and offering no spatial cue that something was created — important for the ADHD audience that benefits from clear affordances.

- **Evidence:** SpatialSceneView.swift:242-244 — `if card.parent == nil { content.add(card) }` immediately followed by the hard position set at 246-250; no opacity ramp, no initial-small-then-grow, no `content.animate` around the add. createTask/createNote (SpatialSceneViewModel.swift:306-341) append the entity and reconcile renders it at full size instantly.
- **Best practice:** Entrance transitions (scale 0.85→1.0 + opacity 0→1, or fly-from-spawn) should run via `Entity.animate(.spring(...))` right after the add, owned by the animation authority until complete (WWDC25 274 implicit Transform animation).
- **Fix:** After `content.add(card)` for a newly-added entity, set an initial small scale/zero opacity and call `entity.animate(.spring(duration: token.entrance))` to grow/fade to target. Gate behind a 'just created' flag so it fires once, not every reconcile pass.

### 🟠 HIGH — Entity removal is an instant delete with no exit transition

Dismiss/return-to-tray/remove drops the entity with no shrink/fade-out. Cards vanish abruptly. Combined with teleport-on-create, the scene has no continuity of object identity — things blink in and out.

- **Evidence:** SpatialSceneView.swift:235-236 — `let stale = content.entities.filter { !liveIDs.contains($0.name) }; for entity in stale { content.remove(entity) }`. Remove paths (SpatialSceneViewModel.swift:510-518 `remove`, 522-526 `returnToTray`) mutate the model and let the next reconcile pass delete the entity outright with no animation hook.
- **Best practice:** Exit should animate (scale→0.85, opacity→0, or fly-to-tray) before removal, deferring removal to animation completion. With animation owning the transform, run `entity.animate` then remove in the completion. Return-to-tray specifically should fly the card to its tray slot rather than disappear.
- **Fix:** Split removal into mark-for-exit + animate-out + remove-on-completion. In reconcile, for entities transitioning to removed/un-rendered, play an exit animation and remove the RealityKit entity only when it finishes. For returnToTray, animate the card to its computed tray position before/instead of teleporting it home.

### 🟠 HIGH — Layout reflow (relayout / return-to-tray) repositions cards with no glide

When `relayout()` assigns new positions (a returned task gets a fresh column slot, or the type-cluster repacks), affected cards jump to the new coordinates on the next reconcile pass. A layout change looks like the scene shattering and reassembling.

- **Evidence:** SpatialSceneViewModel.swift:139-141 writes new layout positions into `entities[idx].positionX/Y/Z`; SpatialSceneView.swift:246-250 then hard-sets `card.position`. `returnToTray` (522-526) zeroes the position and calls `relayout()`, producing an instant jump to the new slot.
- **Best practice:** Auto-flow layout changes should animate cards to new slots via `Entity.animate(.easeOut(duration:))` / `content.animate`, treating layout output as a target the presented transform glides toward (WWDC25 274; the 'fly to type-cluster slot' recommendation).
- **Fix:** Once target-vs-presented separation exists, layout changes animate automatically because reconcile drives entities toward targets with `entity.animate` instead of assigning position. Specifically ensure return-to-tray animates from the card's current (hand-moved) position to its new column slot.

### 🟠 HIGH — Workflow expand/collapse pops step nodes in and out with no transition

Tapping a workflow volume materializes/positions step nodes (expand) or hides them (collapse) by toggling `isRendered` and setting row positions, with zero animation. Steps appear/disappear instantly and the volume does not visibly 'open'. This is the marquee spatial interaction and it has no motion design.

- **Evidence:** SpatialSceneViewModel.swift:438-465 `toggleWorkflowVolume`: collapse path sets `isRendered:false` (450-451) → reconcile deletes instantly; expand path sets positions + `isRendered:true` (454-459) → reconcile adds + hard-positions instantly. `WorkflowVolumeCardView` takes `isExpanded` (WorkflowVolumeCardView.swift:7) but it is hardcoded `false` at the call site (SpatialSceneView.swift:404), so the visual never reflects expansion.
- **Best practice:** Expand should animate steps emerging from the volume (start at the volume's position, fly out to row slots, fade/scale in); collapse reverses it, via `Entity.animate(.spring)`; the volume card animates its expanded state. A textbook 'pop-out' for `content.animate`.
- **Fix:** On expand, create step entities at the volume's position then animate them to `stepRowPositions` with a staggered spring; on collapse, animate them back into the volume before removing/hiding. Wire the real expanded state into `WorkflowVolumeCardView(isExpanded:)` (currently hardcoded false) so the card animates its own appearance.

### 🟡 MEDIUM — Drag has no release settle / inertia / snap animation

On drag-end the card is left exactly where the gesture last set it; there is no settle animation, no inertia, and no animated snap into bounds if clamped. Movement feels dead and abrupt, a comfort issue per the HIG/ergonomics research.

- **Evidence:** SpatialSceneView.swift:112-119 `onEnded` only clears `dragStart`/`draggingID` and fires `viewModel.endDrag`; no `entity.animate` on release. During drag, clamping (line 110 `value.entity.setPosition(VolumeMetrics.standard.clamp(start + delta))`) is a hard clamp with no animated resistance.
- **Best practice:** Use a release spring (`entity.animate(.spring)`) so the card settles, and animate an out-of-bounds clamp back into the volume. visionOS 26 ManipulationComponent provides inertia/settle for free (`dynamics.inertia`, `releaseBehavior=.stay`); adopting it removes the hand-rolled drag and gives settle by default (WWDC25 287; Step Into Vision Manipulation deep dive).
- **Fix:** Either adopt ManipulationComponent (inertia + settle built in) or, if keeping the custom gesture, on `onEnded` animate the final clamped position with a short spring and treat the animation as a temporary transform-ownership claim so reconcile doesn't fight it.

### 🟡 MEDIUM — No hover 'pop' / highlight animation on cards or controls

The requested playful hover pop and jitter-on-highlight do not exist. Cards have a static default `HoverEffectComponent()` with no transform response, and the dismiss badge's hover uses a SwiftUI `.scaleEffect` that does not animate the placed entity. There is no animated scale, glow ramp, or jitter on gaze.

- **Evidence:** SpatialSceneView.swift:254 `card.components.set(HoverEffectComponent())` (no style, no animation); SpatialSceneView.swift:303 badge `HoverEffectComponent()`; DismissBadge SpatialSceneView.swift:463-465 `.hoverEffect { effect, isActive, _ in effect.scaleEffect(isActive ? 1.3 : 1.0) }` — a SwiftUI-layer effect the research confirms does not scale the entity. No System reads hover state to drive a transform.
- **Best practice:** Drive hover/highlight as a RealityKit-visible animation: a low-amplitude `entity.animate(.spring)` scale pop on hover, and/or a `.shader` HoverEffectComponent intensity ramp; jitter via a custom System integrating `context.deltaTime` (clean base + sine offset) so it animates continuously (WWDC25 274/287; WWDC24 10152). System hover is privacy-applied, so the animated visual must be declared up front.
- **Fix:** Add a Jitter/Highlight System keyed by a HoverStateComponent that applies a spring scale pop and small sinusoidal jitter on hover, plus a HoverEffectComponent(.highlight/.shader) for tint/glow. Replace the badge's SwiftUI scaleEffect with an entity-level animated effect. Keep amplitude low and gate behind reduceMotion.

### 🟡 MEDIUM — Edges and ports are deleted and recreated every reconcile pass — cannot animate, and thrash

All edge lines and port spheres are torn down and rebuilt from scratch each reconcile pass. Because the entities are destroyed each pass, there is no stable identity to animate — edges cannot smoothly follow moving nodes, cannot fade in/out when a dependency/link is added/removed, and the rebuild flickers, worsening as the graph grows.

- **Evidence:** SpatialSceneView.swift:311-314 — `for edge in content.entities where edge.name.hasPrefix(Self.edgePrefix) { content.remove(edge) }` then `addEdge` recreates a fresh `ModelEntity` line + two sphere ports (342-374) every pass. New edge entities every frame means in-flight animation/hover state is lost.
- **Best practice:** Edges should be persistent, stably-keyed entities updated in place by an EdgeSystem reading live node positions, so endpoints animate as nodes move and edges fade in/out on add/remove (WWDC23 10080; R3F mutate-not-recreate; the EdgeSystem recommendation).
- **Fix:** Key each edge by a stable composite id (sourceId+targetId+kind), diff against existing edge entities (add/remove/reposition only deltas), and reposition endpoints from live transforms inside a System. This removes per-pass thrash and makes edge add/remove animatable (opacity ramp) and node-follow smooth.

### 🟡 MEDIUM — Scale changes (scaleProperty / sizeMultiplier) have no apply path at all — let alone an animated one

The view model computes a `sizeMultiplier` per entity from `scaleProperty` (Uniform/Duration/Importance/Urgency), but it is never read in the view and no entity scale is ever set. Switching the scale property does nothing, so there is no animated scale transition when the user changes the mapping — a place a transition clearly SHOULD exist.

- **Evidence:** SpatialSceneViewModel.swift:287-301 defines `sizeMultiplier(for:)`; it has no callers in SpatialSceneView.swift. No `card.scale` / `card.transform.scale` assignment exists anywhere (only `entity.scale` is passed through to the persistence DTO at SpatialSceneViewModel.swift:371).
- **Best practice:** Node scale from a chosen property should be applied to the entity and animated on change via `entity.animate(.easeInOut)` so resizing the whole scene by importance/urgency is a smooth, legible transition rather than absent or a jump (WWDC25 274 implicit scale animation).
- **Fix:** Read `sizeMultiplier(for:)` in reconcile, apply it as the entity's scale (combined with VolumeMetrics constraints), and when `scaleProperty` changes animate every affected node from its old scale to the new one with `entity.animate`.

### ⚪ LOW — No animation duration/easing tokens or design-system motion vocabulary

There are no centralized motion tokens (durations, easings, spring parameters, amplitudes). Since no animations exist, every future animation would hardcode its own timing, producing an inconsistent feel as the UI grows — the opposite of the scalable design system the developer wants.

- **Evidence:** No motion constants exist in the Spatial target; the only token-like authority is `VolumeMetrics` (Layout/VolumeMetrics.swift) which covers spatial bounds, not motion. Timing values would have to be invented per call site (none exist yet).
- **Best practice:** Centralize motion as tokens (entrance/exit/reflow/hover durations + easing/spring curves + jitter amplitude/frequency) in one nonisolated source of truth, mirroring `VolumeMetrics` for space (MRTK3/Material-3 token model; the SpatialTokens recommendation).
- **Fix:** Add a `SpatialMotion` (or extend a SpatialTokens) nonisolated enum holding durations/easings/spring params/jitter constants, and have every `entity.animate` call read from it so the whole scene shares one motion language.

### ⚪ LOW — reduceMotion accessibility is never consulted, so animations would have no fallback

Nothing in the spatial target reads `accessibilityReduceMotion`. The research is explicit that vection-inducing motion and jitter must be gated behind Reduce Motion with a crossfade/static fallback, especially for the neurodivergent/ADHD audience. As animations are added, the absence of any reduceMotion plumbing means they will violate the accessibility requirement by default.

- **Evidence:** Repo-wide grep finds no `reduceMotion`/`accessibilityReduceMotion`/`reduceTransparency` usage in TaskPlannerVision. All animation gaps above, when fixed, need this hook which currently does not exist.
- **Best practice:** Read `@Environment(\.accessibilityReduceMotion)` and substitute a crossfade/instant-with-opacity fallback for spatial motion and disable jitter entirely when enabled (WWDC23 10078/10034).
- **Fix:** Thread a `reduceMotion` flag (from the environment) into the animation layer/tokens so every animation either runs its curve or falls back to a crossfade, and the JitterSystem is suppressed, when Reduce Motion is on.

---

## materials-visual-design

**Current approach:** The Vision target has NO design-system/token layer — confirmed: no tokens/theme/style/design file exists anywhere under TaskPlannerVision/ (find returned nothing). Each of the four card views hardcodes its own visual constants inline and independently. NodeCardView.swift:38 frame width 210, :39 .regularMaterial in .rect(cornerRadius:16), :41/:44 stroke radius 16 + lineWidth 1.5 (or 5 when highlighted), :43 type color at opacity(0.5) or Color.accentColor, :16 icon fill opacity(0.9), :17 icon circle 34pt, :36/:37 padding 14/10. TypePanelCardView.swift:21 width 240, :22 type color opacity(0.25) tint layered UNDER :23 .regularMaterial, :25 radius 18, :26 stroke opacity(0.7) lineWidth 2, :19/:20 padding 16/12. NoteCardView.swift:10 width 190, :12 hardcoded .yellow.opacity(0.35) tint under :13 .regularMaterial, :14 radius 14, :11 padding 14 — note color is literally `.yellow`, not a token. WorkflowVolumeCardView.swift:18 width 200, :19 .thinMaterial radius 16, :21 .tint.opacity(0.6) lineWidth 1.5, :17 padding 14. Color source of truth is split: cards derive tint from UserTaskType.swiftUIColor (a hex string, UserTaskType.swift:15-17), but edges are drawn as RealityKit ModelEntity boxes/spheres with UnlitMaterial(color: UIColor.systemTeal/.systemOrange) (SpatialSceneView.swift:330,337,357,368) — a completely different color system unrelated to type colors. Selection/component-state styling exists only as the ad-hoc isHighlighted bool on NodeCardView (:10,:43-44); the other three cards have no hover/selected/dragging/disabled visual states. Glass is used inconsistently: .regularMaterial (Node, TypePanel), .thinMaterial (WorkflowVolume), raw color-over-material (Note, TypePanel) — never the spatially-aware .glassBackgroundEffect() used elsewhere (SpatialSceneView.swift:211 for the mode banner). No accessibility material adaptation (no reduceTransparency/increaseContrast handling anywhere in the target).

### 🟠 HIGH — No design-token layer — all visual constants are scattered magic numbers across four files

Every card view hardcodes its own dimensions, corner radii, opacities, line widths, and paddings inline with no shared source of truth. There is no SpatialTokens/Theme type anywhere in the Vision target (find for token/theme/design/style files returned nothing). The same conceptual value is duplicated and inconsistent: corner radius is 16 (NodeCardView.swift:39,41), 18 (TypePanelCardView.swift:22,23,25), 14 (NoteCardView.swift:12,13), 16 (WorkflowVolumeCardView.swift:19,21); card width is 210 / 240 / 190 / 200; border lineWidth is 1.5 / 2 / 1.5; tint opacity is 0.5 / 0.25 / 0.35 / 0.6 / 0.9. Changing any global aspect of the look (a brand radius, a glass level, the selected-border weight) requires editing four files and risks drift. This is exactly the failure that token systems (Material 3, MRTK3 theming) exist to prevent, and the project's own VolumeMetrics already establishes the 'single authority, no scattered magic numbers' precedent for the meters domain.

- **Evidence:** NodeCardView.swift:38 frame(width:210), :39/:41 cornerRadius 16, :44 lineWidth 1.5/5; TypePanelCardView.swift:21 width 240, :22/:23/:25 cornerRadius 18, :26 lineWidth 2; NoteCardView.swift:10 width 190, :12/:13 cornerRadius 14; WorkflowVolumeCardView.swift:18 width 200, :19/:21 cornerRadius 16, :21 lineWidth 1.5. No tokens/theme file exists under TaskPlannerVision/.
- **Best practice:** Centralize all design decisions as tokens in one source of truth (Material 3 design tokens; MRTK3 Data Binding & Theming themes whole hierarchies from one profile). Apple HIG seeds concrete spatial values (~60pt min target, concentric corner radius = inner + padding, glass material levels with vibrancy tiers). The project's own VolumeMetrics.swift:9 ('Every position... goes through this type — no scattered magic numbers elsewhere') is the model to mirror for the visual domain.
- **Fix:** Create a nonisolated `SpatialTokens` enum (Foundation/SwiftUI only, like VolumeMetrics) holding cardWidth-per-kind, cornerRadius, padding, borderWidth (rest/selected), tint opacities, glass material level per tier, and motion durations/easings. Every card view and the collision sizing reads from it. Make it unit-testable and the only place these numbers live.

### 🟠 HIGH — No shared component/state styling layer — selection state is an ad-hoc per-view bool, hover/dragging/disabled states don't exist

There is no reusable card primitive and no per-entity visual state machine. Selection highlight is a one-off `isHighlighted` Bool implemented only on NodeCardView (border swaps to accentColor, lineWidth jumps 1.5→5). The other three card kinds (TypePanel, Note, WorkflowVolume) have NO highlighted/hover/selected/dragging/disabled visual treatment at all, so connect/link 'picked' feedback and any future focus/drag affordance cannot be expressed uniformly. Each card re-implements its background+overlay+border stack by hand (4 near-identical but subtly different HStack/VStack + .background + .overlay blocks), which is duplicate logic that will diverge further as kinds are added.

- **Evidence:** NodeCardView.swift:10 `var isHighlighted: Bool = false`, :43-44 border color/width branch on it. TypePanelCardView.swift, NoteCardView.swift, WorkflowVolumeCardView.swift have no equivalent state parameter — only NodeCardView can show a picked/selected state. Each view independently composes .background+.overlay(RoundedRectangle.strokeBorder) (NodeCardView.swift:39-46, TypePanelCardView.swift:22-27, WorkflowVolumeCardView.swift:19-22).
- **Best practice:** MRTK3: interactables are pure state; a separate visual driver maps interaction state (rest/hover/selected/dragging/disabled + analog 'selectedness') to visuals, so every interactive element gets consistent feedback by declaring a state→style mapping instead of bespoke logic. Visuals should be a function of an observed state value, not hand-coded per card.
- **Fix:** Introduce a `SpatialCard` container view (or ViewModifier) that takes a `kind`, a `tint`, and an `interactionState` enum and applies tokenized glass + border + tint + corner radius. All four card bodies become content-only and wrap in this primitive. Selection/hover/dragging become a single enum applied uniformly, fed from a RealityKit state component rather than parsed/branched per view.

### 🟠 HIGH — Split color source of truth — type-driven SwiftUI colors vs. hardcoded UIColor edges

Card tints come from the canonical, user-configurable UserTaskType hex color via swiftUIColor, but derived edges/ports are drawn with RealityKit UnlitMaterial using fixed UIColor.systemTeal (dependency edges) and UIColor.systemOrange (links) — colors that have no relationship to the type palette and aren't tokenized. Two unrelated color systems describe the same scene, so edges can never reflect type/semantic color, and the link/dependency semantic colors are buried as literals in the draw routine rather than named tokens. The note card is worse: its color is the literal SwiftUI `.yellow` (NoteCardView.swift:12), not even a named app color. This violates the project's own CLAUDE.md rule ('Colors: use getTypeColor() utilities... Zero hardcoded strings/colors in production code').

- **Evidence:** NodeCardView.swift:43 & TypePanelCardView.swift:22,26 use type.swiftUIColor (hex-backed, UserTaskType.swift:15). NoteCardView.swift:12 uses literal `.yellow.opacity(0.35)`. SpatialSceneView.swift:330 `addEdge(..., color: .systemTeal, ...)`, :337 `.systemOrange`, :357/:368 `UnlitMaterial(color: color)` — a UIColor pipeline disconnected from swiftUIColor.
- **Best practice:** One color source of truth, exposed as semantic tokens; for color-accurate RealityKit meshes use UnlitMaterial(applyPostProcessToneMap:false) so mesh colors match SwiftUI exactly (tone mapping shifts UI colors by default). Semantic roles (dependency, link, note) should be named tokens, not inline UIColor/.yellow literals.
- **Fix:** Define semantic color tokens (dependencyEdge, linkEdge, noteAccent, selection) once and derive BOTH the SwiftUI Color and the RealityKit UIColor from the same token (Color↔UIColor bridge). Replace `.systemTeal`/`.systemOrange`/`.yellow` literals with tokens. Set applyPostProcessToneMap:false on edge/port materials so they match the card palette.

### 🟡 MEDIUM — Inconsistent glass usage — three different material treatments, none using spatially-aware glassBackgroundEffect

The four cards use three different glass strategies with no rationale tied to elevation/hierarchy: NodeCardView and TypePanelCardView use .regularMaterial, WorkflowVolumeCardView uses .thinMaterial, and Note + TypePanel stack a flat color layer UNDER the material (color .rect THEN .regularMaterial .rect). None use .glassBackgroundEffect() — the spatially-aware, environment-grounding glass — even though the same file's mode banner does (SpatialSceneView.swift:211). Material level should encode elevation per HIG (thin=interactive, regular=section, thick=recede); here the level is essentially arbitrary, so depth/hierarchy isn't communicated and the look is incohesive. Layering a solid tint color beneath the material also fights vibrancy and reduces the adaptive-contrast benefit of glass.

- **Evidence:** NodeCardView.swift:39 .regularMaterial; TypePanelCardView.swift:22 color-fill THEN :23 .regularMaterial; NoteCardView.swift:12 .yellow fill THEN :13 .regularMaterial; WorkflowVolumeCardView.swift:19 .thinMaterial. Contrast with SpatialSceneView.swift:211 .glassBackgroundEffect() (used only for the banner).
- **Best practice:** HIG Materials: glass is adaptive and grounds content in the room; map material level to elevation tier and prefer .glassBackgroundEffect() for spatial surfaces; avoid stacking lighter materials/solid fills that defeat vibrancy. Use vibrancy tiers (.primary/.secondary/.tertiary) rather than solid color fills for contrast.
- **Fix:** Adopt .glassBackgroundEffect() (or a tokenized material-level mapping) consistently across all card kinds, with the level chosen by an elevation token per kind (panel=section, node/note=interactive, volume=recede). Replace solid color-under-material tints with a thin tinted glass or a subtle stroke so vibrancy is preserved.

### 🟡 MEDIUM — SwiftUI point widths are decoupled from the meters layout/collision system

Card widths are fixed in SwiftUI points (210/240/190/200) while placement, clamping, and collision sizing live in the meters-based VolumeMetrics/SpatialLayoutEngine. Nothing ties a card's rendered point size to its physical extent: the collision box is reverse-engineered each pass from card.visualBounds (SpatialSceneView.swift:255-264) rather than derived from the same width token, and the layout engine spaces clusters in meters with no knowledge of how wide a card actually is. This makes spacing, overlap avoidance, and target-size guarantees (HIG ~60pt min) impossible to reason about from one place, and forces the fragile recursive-bounds measurement the code already guards against (comment at :251-252).

- **Evidence:** Hardcoded point widths NodeCardView.swift:38 (210), TypePanelCardView.swift:21 (240), NoteCardView.swift:10 (190), WorkflowVolumeCardView.swift:18 (200). Collision derived from measured bounds at SpatialSceneView.swift:255-264 with a fallback SIMD3(0.22,0.12,0.05); VolumeMetrics.swift defines all spacing in meters with no card-size input.
- **Best practice:** Tokens should bridge the point and meter domains so layout spacing, rendered size, and collision shapes all derive from one card-dimension token (HIG min-target sizing in a known unit). RealityView attachments are 1 point = 1 meter at scale 1, so card point size is knowable up front and need not be measured per frame.
- **Fix:** Put per-kind card dimensions in SpatialTokens and feed them to (a) the SwiftUI .frame, (b) the collision box generation, and (c) the layout engine's spacing, so size is declared once. This also removes the per-pass visualBounds measurement (and its drift risk) for the collision shape.

### 🟡 MEDIUM — No accessibility material/contrast adaptation; selection relies on color/opacity only

There is no handling of Reduce Transparency or Increase Contrast anywhere in the Vision target, so the glass-heavy cards have no opaque/high-contrast fallback for users who need it. Selection and type identity are communicated almost entirely through color and opacity (e.g. type color at opacity 0.5, accentColor border), which is insufficient for low-vision/color-blind users and degrades badly over busy passthrough. The note card's only differentiator is a translucent yellow wash. For a stated neurodivergent/ADHD audience that benefits from clear, redundant affordances, color-only state is a real defect.

- **Evidence:** No reduceTransparency/accessibilityReduceTransparency/increaseContrast references in TaskPlannerVision/ (grep returned nothing). State/identity conveyed by color+opacity only: NodeCardView.swift:43-44 (border color/width), TypePanelCardView.swift:22/26 (tint+stroke), NoteCardView.swift:12 (.yellow wash).
- **Best practice:** HIG: prefer system materials + vibrancy that adapt automatically and honor Reduce Transparency / Increase Contrast; never rely on color alone for state; provide redundant cues (shape, label, weight). Liquid Glass adapts to these settings automatically when used as intended.
- **Fix:** Route glass through a token that swaps to an opaque/high-contrast surface when accessibilityReduceTransparency/increaseContrast is set, and add a non-color selection cue (e.g. a lift/scale, a checkmark, or a thicker tokenized border) so state is conveyed redundantly. Keep text on system styles + vibrancy tiers instead of solid color washes.

### 🟡 MEDIUM — DismissBadge hover uses SwiftUI .hoverEffect inside an attachment that the parent collision swallows; no shared control styling

The × control's highlight is a SwiftUI .hoverEffect { scaleEffect } inside its ViewAttachmentComponent rootView (DismissBadge), but the parent card's CollisionComponent encloses the badge (parent depth max(z,0.03)=30mm vs badge only +0.006z=6mm in front), so gaze/hover resolves to the parent and the badge's effect never fires. This is a visual-design defect too: the control's appearance and feedback are bespoke and not part of any shared control style, and the badge color is a fixed white/black palette (foregroundStyle(.white,.black.opacity(0.55))) unrelated to tokens. As more controls are added (ports, menus) each will re-invent its own visuals and hit the same hierarchy trap.

- **Evidence:** SpatialSceneView.swift:457-466 DismissBadge uses .hoverEffect { effect.scaleEffect(isActive ? 1.3 : 1.0) } and a hardcoded .foregroundStyle(.white, .black.opacity(0.55)); the badge collision is generateBox(size:[0.05,0.05,0.02]) at :302 sitting +0.006z inside the parent card box sized with depth max(e.z,0.03) at :260.
- **Best practice:** Hover/highlight for a placed control should be a RealityKit HoverEffectComponent (.highlight/.spotlight) on the control entity with its own non-overlapping collision (Apple: HoverEffectComponent affects only its own entity; an enclosing parent collider swallows the child). Control visuals should come from a shared, tokenized control style, not per-control literals.
- **Fix:** Define a tokenized control style (size, glass, tint, hover treatment) and apply a RealityKit HoverEffectComponent on the badge entity, giving the badge its own collision that clears the parent box (deeper +z offset and/or shallower parent depth). Replace the white/black literals with control tokens so all future controls (ports, menus) share one visual language.

---

## architecture-scalability

**Current approach:** The entire spatial workspace is implemented in exactly two oversized files plus a small set of leaf views, with no ECS layer and no reusable spatial-component abstraction. SpatialSceneView.swift (543 lines) is a single SwiftUI View that simultaneously owns: gesture definitions (dragGesture/tapGesture, lines 101-148), gesture dispatch via string-prefix name parsing (controlRole/isControlOrEdge, lines 83-95), the entire scene reconcile (reconcile, lines 230-271), control-entity construction (updateDismissControl/makeDismissControl, lines 280-306), edge/port mesh generation (drawEdges/addEdge, lines 311-374), card view selection (card(for:), lines 391-427), spawn-point math (nextSpawn, lines 447-452), and four embedded sheet/prompt subviews (lines 457-543). SpatialSceneViewModel.swift (605 lines, @Observable) owns data loading, task indexing, the layout orchestration (relayout/buildLayoutInput, lines 122-240), entity materialization for three kinds (ensurePanels/ensureSprintTaskNodes/ensureWorkflowVolumes, lines 158-204), hand-rolled step-row layout that bypasses the engine (stepRowPositions, lines 489-500), all CRUD/persist actions, connect/link/collapse orchestration, content lookups, and dead scale-property logic. The ONLY decomposed, testable units are SpatialLayoutEngine.swift (103 lines, nonisolated, pure) and VolumeMetrics.swift (54 lines, nonisolated, pure). There are zero RealityKit Systems, zero custom Components, zero EntityQuery usage, and zero visionOS 26 APIs (ManipulationComponent/GestureComponent/entity.animate) in the entire TaskPlannerVision target (grep confirms NO MATCHES). The only test in the target is an unrelated AuthManager test (TaskPlannerMobileTests.swift, lines 4-11).

### 🔴 CRITICAL — No ECS System/Component layer — all continuous and per-entity behavior is crammed into one View + one ViewModel

RealityKit is an ECS, but the codebase uses none of it: no type conforms to RealityKit.System, no custom struct conforms to Component, and there is no EntityQuery anywhere. Every behavior that research says belongs in a System (transform glide-to-layout, edge re-derivation, hover jitter, drag-ownership arbitration) is instead expressed imperatively inside the SwiftUI RealityView.update closure (reconcile). This is the structural root of both known bugs and of the file bloat: there is no place for behavior to live except the reconcile pass.

- **Evidence:** grep for 'System\b|registerSystem|EntityQuery|: Component|ManipulationComponent|GestureComponent|entity.animate' across TaskPlannerVision returns NO MATCHES. All behavior is in SpatialSceneView.swift reconcile (lines 230-271) and SpatialSceneViewModel.swift. The reconcile pass even rebuilds edges/ports from scratch every call (drawEdges, lines 311-373: `for edge in content.entities where ... { content.remove(edge) }` then re-adds all).
- **Best practice:** Continuous/derived scene behavior belongs in custom RealityKit Systems keyed by marker Components, queried via EntityQuery and ticked in System.update(context:) (WWDC23 10080; Apple 'Implementing systems for entities'). The RealityView update closure is not a tick and must not own continuous behavior (WWDC25 274).
- **Fix:** Introduce a Spatial/Components/ and Spatial/Systems/ layer. Define marker/data components (e.g. SpatialRoleComponent{kind,ownerId}, TransformAuthorityComponent{model|gesture|animating}, LayoutTargetComponent, EdgeEndpointComponent, HoverStateComponent) and register them once. Move edge re-derivation into an EdgeSystem that diffs/repositions stably-keyed edge entities instead of teardown-rebuild; move layout glide into a LayoutSystem; move jitter into a JitterSystem. Shrink reconcile to identity-only (add/remove/attach).

### 🔴 CRITICAL — No transform-ownership model — the data model and gesture both write the same transform, with reconcile as de-facto owner every pass

There is no encoded authority over an entity's transform at a given instant. reconcile re-asserts every card to the stored model position on every observed change, guarded only by a SwiftUI @State draggingID that the research and the developer confirm is not reliably visible to the update closure mid-gesture. This is an architectural decomposition gap (no ownership component/system) that directly produces the drag snap-back and blocks smooth animation.

- **Evidence:** SpatialSceneView.swift reconcile re-sets card.position from entity.positionX/Y/Z each pass with only an `if entity.id != draggingID` guard (lines 245-250); draggingID is @State mutated inside the RealityKit gesture .onChanged (lines 20, 108). endDrag persists only on release (SpatialSceneViewModel.swift lines 353-357), so the stored value is stale during the drag. No TransformAuthority component or System exists to arbitrate.
- **Best practice:** Exactly one authority (model | gesture/manipulation | animation) owns a transform at any instant; encode it in a scene component a System respects, and never write observed entity transforms in the update closure (WWDC25 274). Prefer ManipulationComponent(releaseBehavior=.stay) which owns the transform during drag.
- **Fix:** Add a TransformAuthorityComponent and make reconcile write transforms only for entities whose authority is .model (newly added or model-changed). Adopt visionOS 26 ManipulationComponent for movable entities (persist on ManipulationEvents.WillEnd) so RealityKit owns the transform during drag; delete the @State draggingID workaround.

### 🟠 HIGH — No reusable spatial-component (entity-factory) abstraction — entity assembly is duplicated and ad hoc per kind

There is no single factory that, given a SwiftUI view + kind, produces a correctly-wired entity (attachment + collision + input-target + hover + role). Instead, the card entity wiring is inlined in reconcile for every rendered entity on every pass (re-setting InputTargetComponent, HoverEffectComponent, recomputing CollisionComponent from visualBounds), and the dismiss control has its own separate bespoke assembler (makeDismissControl). Edges/ports are assembled inline in addEdge. Adding a new entity kind or a new control means editing the monolithic reconcile rather than declaring a component recipe.

- **Evidence:** SpatialSceneView.swift reconcile re-sets components on every entity every pass (lines 253-264); makeDismissControl is a one-off control builder (lines 295-306); addEdge builds line+port ModelEntities inline (lines 342-373). Collision is recomputed from card.visualBounds every pass (lines 255-264) rather than once from known card dimensions. No factory type exists.
- **Best practice:** Compose entities through a small reusable vocabulary (an InteractiveCard factory and a Control factory) so every entity gets attachment + right-sized collision + input-target + hover + typed role consistently; create once, mutate only deltas (MRTK3 composition-over-inheritance; visionOS 26 AGENTS guidance; retained-mode diffing).
- **Fix:** Extract an EntityFactory (e.g. SpatialEntityBuilder) with makeCard(view:kind:role:) and makeControl(role:) that assemble components from design tokens once at creation. Cache the collision shape from token-defined card dimensions instead of recomputing from recursive/own visualBounds each pass. reconcile then only calls the factory for newly-added ids.

### 🟠 HIGH — Layout engine only implements type-cluster; workflow step-graph layout is hand-rolled in the ViewModel, bypassing the testable engine

SpatialLayoutEngine handles only the type-cluster (panels row + per-type task columns). The workflow step graph — the second core layout the app needs for pop-out — is computed imperatively in the ViewModel as a naive centered row (stepRowPositions), is MainActor-bound, takes a live SpatialEntity, and is therefore not unit-testable. This splits layout authority across a pure engine and an impure view model, and means the richer topological pop-out layout has no home in the engine.

- **Evidence:** SpatialLayoutEngine.swift line 13 explicitly defers: 'Workflow step-graph layout is added in a later phase.' The step layout instead lives in SpatialSceneViewModel.swift stepRowPositions (lines 489-500), which reads volume.positionX/Y/Z off a live entity and uses magic offsets (0.24, -0.18, 0.08). materializeSteps (lines 468-486) and toggleWorkflowVolume (lines 446-465) both call it.
- **Best practice:** There should be ONE layout engine that owns all placement strategies as pure, testable functions taking plain projections (the project's own 'one engine' rule + the engine's own nonisolated/Foundation-only contract). Pop-out layout should be a topological-levels strategy in the engine, not ad-hoc view-model math.
- **Fix:** Add a stepGraph(strategy) function to SpatialLayoutEngine taking plain step projections (id, dependsOn, volume anchor) and returning [Placement]; delete stepRowPositions from the view model and have materializeSteps/toggleWorkflowVolume call the engine. Then unit-test the new strategy.

### 🟠 HIGH — Gesture dispatch by string-prefix name parsing instead of typed components — unscalable and untestable interaction routing

Entity identity AND role are both overloaded onto entity.name: the SpatialEntity id is the name, while controls/edges use 'ctl::<role>::<ownerId>' and 'edge::' prefixes parsed at gesture time. Two global .targetedToAnyEntity() gestures branch on these strings. Every new control kind grows the parser with no compiler help, and the routing logic cannot be unit-tested because it is buried in SwiftUI gesture closures.

- **Evidence:** SpatialSceneView.swift: controlPrefix/controlRole/isControlOrEdge (lines 83-95), edgePrefix (line 376); dragGesture guards on isControlOrEdge(value.entity.name) (lines 105, 115); tapGesture parses controlRole(name) and compares role.role == "dismiss" (lines 130-132). Control entities are named 'ctl::dismiss::<id>' (line 281); edges 'edge::line'/'edge::port' (lines 359, 370).
- **Best practice:** Express role/identity as typed components and route via per-entity GestureComponent (visionOS 26) or component lookups, not name string parsing (WWDC25 274; visionOS 26 AGENTS; ECS cross-engine consensus).
- **Fix:** Add a SpatialRoleComponent(kind, ownerId) set by the entity factory; replace the two global gestures + string parsing with per-entity GestureComponent handlers (or component lookups on value.entity.components). This makes dispatch type-safe and lets role resolution be tested in isolation.

### 🟠 HIGH — No separation of interaction-state from visual presentation — no per-entity state machine / design-token layer

Visual feedback decisions are scattered and hardcoded: each card view embeds its own material level, tint, corner radius, and stroke; selection highlight (isPicked) is threaded as a bool through card(for:) and the only 'jitter'/hover affordance is a SwiftUI scaleEffect buried in DismissBadge. There is no central design-token source and no rest/hover/selected/dragging state machine, so growing the UI means editing many views and the reconcile in lockstep.

- **Evidence:** Hardcoded per-view styling with no shared tokens: NodeCardView cornerRadius 16, width 210, lineWidth 5/1.5 (lines 38-46); TypePanelCardView cornerRadius 18, width 240 (lines in TypePanelCardView.swift); WorkflowVolumeCardView .thinMaterial radius 16; NoteCardView .yellow.opacity(0.35) radius 14. Magic meters scattered in reconcile/edges: inset 0.02 (line 287), +0.006 z (line 291), box [0.05,0.05,0.02] (line 302), edge 0.004/0.011/0.07 (lines 348-371). isPicked bool threaded through card(for:) (lines 413, 423). Jitter only as DismissBadge .hoverEffect scaleEffect (lines 463-465).
- **Best practice:** Centralize design decisions as tokens (MRTK3/Material-3 token model adapted to meters) feeding composable primitives, and drive visuals from an observed interaction-state value rather than baking state-to-visual logic into reconcile (MRTK3 'interactables are pure state; a separate visual driver renders').
- **Fix:** Create a nonisolated SpatialTokens enum (Foundation/simd only) for meters spacing/elevation, corner radii, material levels per kind, tints, motion durations/easings, hover styles; have every card view and the collision sizing read from it. Add a NodeStateComponent{rest|hover|selected|dragging|disabled} driven by a small reducer/System mapping state->visual, replacing the isPicked bool and ad-hoc styling.

### 🟠 HIGH — Almost nothing is testable: only the two pure files have any test surface, and even they have no tests in this target

Layout orchestration, materialization, connect/link/collapse, drag-persist, content lookups, gesture routing, edge derivation, and spawn math are all entangled with @Observable MainActor state, SwiftUI, RealityKit, and async service calls, so none of it can be unit-tested. The only pure, isolatable units are SpatialLayoutEngine and VolumeMetrics — and the single test in the target tests an unrelated AuthManager, so even those have zero coverage here.

- **Evidence:** SpatialSceneViewModel.swift mixes pure logic (buildLayoutInput lines 206-240, sprintStandaloneTasks/sprintWorkflows lines 107-118, normalized line 297, stepRowPositions lines 489-500) directly into an @Observable class with service I/O and no seams. The only test file, TaskPlannerMobileTests.swift, contains one AuthManager test (lines 4-11) and no SpatialLayoutEngine/VolumeMetrics/view-model tests. CLAUDE.md requires every new function to get tests.
- **Best practice:** Extract pure reducers/selectors (intent->data, projection-building, layout strategy selection) into nonisolated testable functions, keeping the @Observable VM as a thin shell; unit-test the layout engine and reducer logic without the simulator (cross-engine ECS guidance: pure dirty-diff reducer is testable; project CLAUDE.md test mandate).
- **Fix:** Pull buildLayoutInput, sprint filtering, spawn placement, step-graph layout, and a new intent->reduce dispatcher into nonisolated pure functions/types; add Swift unit tests covering them plus SpatialLayoutEngine and VolumeMetrics. Verify visuals separately via xcodebuild/Simulator.

### 🟡 MEDIUM — Scale-by-property is dead, view-only code that is never consumed

The ViewModel defines ScaleProperty and sizeMultiplier(for:) intended to drive node size by duration/importance/urgency, but nothing reads them. card(for:) builds NodeCardView with no size input, reconcile never sets entity.scale or card.scale from sizeMultiplier, and no toolbar control sets scaleProperty. It is unreachable feature code that also has its own untested normalization math.

- **Evidence:** SpatialSceneViewModel.swift defines ScaleProperty (lines 25-37) and sizeMultiplier/normalized (lines 287-301). grep shows the only references are the definitions themselves; reconcile in SpatialSceneView.swift (lines 239-268) never applies a scale, and card(for:) (lines 391-427) passes no multiplier. scaleProperty is never assigned anywhere outside its declaration.
- **Best practice:** No commented-out or unreachable production code; features that span planning/execution must actually be wired (project CLAUDE.md clean-code rules). Visual encoding of a property should flow data->scene through a System/factory, not sit as an orphaned VM method.
- **Fix:** Either wire scaleProperty into a toolbar Picker and apply sizeMultiplier to the entity transform via the entity factory/LayoutSystem (with a unit test on normalized()), or delete the dead ScaleProperty/sizeMultiplier/normalized code until the feature is implemented. Do not leave it dangling.

---
