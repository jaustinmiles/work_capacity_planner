# Spatial Scene (visionOS Port) — Architecture

> **New to the Vision port? Start with `.claude/rules/visionos-development-guidelines.md`** — the practical
> playbook (golden rules, UI appearance, interactability, audio/voice, testing). This file is the data
> model + milestone history; `.claude/rules/spatial-ui-architecture.md` is the deep UI architecture spec.

The Vision Pro port renders an entirely spatial workspace: a persistent volumetric
scene where every created thing (task/step node, per-type panel, popped-out workflow
graph, note) is a movable entity. The native client is a **new visionOS target inside
the existing `TaskPlannerMobile.xcodeproj`**, sharing `Core/` (networking, models,
services) and reusing the tRPC backend. There is no separate business logic — the
spatial UI calls the same API as desktop/web/iOS.

## Backend data model (committed)

Two new Prisma models (`prisma/schema.prisma`):

- **`SpatialScene`** — one persistent volumetric workspace per session.
- **`SpatialEntity`** — a placed, movable entity. It is a **pure placement/visibility
  projection**, exactly like `DeepWorkNode`: canonical data lives in
  `Task` / `TaskStep` / `UserTaskType`. `kind` (`SpatialEntityKind` enum) decides what
  `refId` references (taskNode→Task, stepNode→TaskStep, typePanel→UserTaskType,
  workflowVolume→workflow Task, note→null). Orientation is a **quaternion**
  (rotationX/Y/Z/W) because RealityKit transforms are quaternion-native.

**Edges are derived, never stored as entities** — from `TaskStep.dependsOn`
(intra-workflow) and `EndeavorDependency` (cross-workflow links), drawn between live
entity positions. Don't add an edge table.

## The two connection semantics (do not conflate)

- **Connect → form a workflow (merge):** `spatialScene.connect`. Reuses the deep-work
  morph engine. Two standalone tasks become steps of a new workflow, etc.
- **Link workflows without combining:** the client calls `endeavor.addDependency`
  directly — pure `EndeavorDependency` metadata; workflows stay separate. There is no
  spatial-specific procedure for this on purpose.

## Engine reuse — the key pattern

The workflow-formation engine is **shared, not duplicated** (CLAUDE.md "one engine"
rule). `executeMorphResult` in `deepWorkBoard.ts` was split:

- **`applyTaskStructureMorph(tx, morphResult)`** (`src/server/morph-executor.ts`) —
  store-agnostic: mutates `Task`/`TaskStep`/`WorkSession` and recalculates workflow
  metrics. Runs inside a caller-supplied transaction.
- Each surface applies `morphResult.nodeIdentityUpdates` to **its own projection**
  within that same transaction: `deepWorkBoard` updates `DeepWorkNode`,
  `spatialScene.connect` updates `SpatialEntity` (taskNode↔stepNode swap via
  `resolveEntityIdentity`).

When you add a new spatial morph behavior, extend the shared planner
(`src/shared/deep-work-morph.ts`) and `applyTaskStructureMorph` — never fork them.

`spatialScene.connect` reuses `hydrateNode` and `deriveEdgesFromHydratedNodes`
(exported from `deepWorkBoard.ts`) by synthesizing `DeepWorkNodeWithData` from
`SpatialEntity` rows where the entity id **is** the node id.

## visionOS client (TaskPlannerVision target)

Xcode 16, objectVersion 70, **filesystem-synchronized groups**: any file dropped
under `TaskPlannerVision/` auto-joins the target (no pbxproj edits). The
`.xcodeproj` is gitignored — only Swift sources are tracked.

All spatial Swift lives under `TaskPlannerVision/Spatial/` and is **visionOS-only**:
- `SpatialModels.swift`, `SpatialSceneService.swift` (tRPC wrappers for `spatialScene.*`).
- `SpatialRoot.swift` — the Vision app's composition root. It reuses shared Core
  (AuthManager/TRPCClient/Task·Session·UserTaskType services) but is SEPARATE from
  the iOS `AppState` (which lives in `App/` beside the iOS `@main` and is NOT in the
  Vision target). Do not make the shared `AppState` depend on spatial types.
- `SpatialSceneViewModel.swift`, `SpatialSceneView.swift` (RealityView volume),
  `SpatialNodeFormView.swift`, `SpatialSetupView.swift`, `ContentView.swift`.

Rendering: each `SpatialEntity` is a rounded card mesh (gesture target) + a SwiftUI
attachment. Drag persists on release; tap a node opens the edit form; double-pinch
(`SpatialTapGesture(count:2)`) on the floor plane or toolbar buttons create. Verify
with **`xcodebuild -scheme TaskPlannerVision -destination 'generic/platform=visionOS Simulator'`**
(SourceKit reports false errors here — it indexes the wrong SDK; trust xcodebuild).

## Status / remaining work

**Milestone 1 complete (Phases 0–4), all verified.** Backend: models + migration
`20260602014946`, `spatialScene` router, engine extraction, Vitest (3270 tests).
visionOS client (all BUILD SUCCEEDED): panels, movable persistent nodes, edit form,
create (task/note + double-pinch), derived edges, **connect → merge** (collapses into
a workflow volume), **link without combining**, and **workflow pop-out** (tap a volume
to expand/collapse).

Key procedures for the two endeavor-style behaviors:
- `spatialScene.linkWorkflows` — creates an `EndeavorDependency` in an auto-created
  per-session **"Spatial Links"** endeavor (the decision in
  `.claude/decisions/2026-06-02-spatial-link-and-workflow-popout.md`). Blocking side
  resolves to a step (a workflow's last step, or a tapped step node). `getLinks`
  resolves links to entity pairs for dashed edges.
- `spatialScene.collapseWorkflow` — collapses a workflow into one `workflowVolume`;
  steps become hidden children (`parentId`). Client expands/collapses by toggling
  child render state + laying them out.

**Milestone 3 complete (2026-06-08) — production UI architecture + device-verified.**
The rendering/interaction layer was rebuilt on the architecture in
`.claude/rules/spatial-ui-architecture.md` (transform-ownership token, identity-only
reconcile, RealityKit Systems as the sole live-transform writers, design tokens/glass).
The drag snap-back and ×-unreachable bugs are dead. **Verified on REAL Vision Pro
hardware**, not just the Simulator. Beyond Milestone 1, the scene now supports:
- **Drag** via `ManipulationComponent` (`releaseBehavior = .stay`), with free depth (z)
  movement; taps detected by a displacement-gate in `ManipulationBridge` (a
  `GestureComponent` does NOT fire on a manipulable entity — verified).
- **Drag-to-connect** via ports: a draggable green **output** port (`ctl::port::<id>`) +
  a blue **input** port (`ctl::inport::<id>`); release on the nearest node infers
  merge vs link via the pure `ConnectionRules.intent` matrix. Edges route port→port,
  are **translucent**, and carry a midpoint × (`ctl::unedge::<from>|<to>`) to remove them.
- **Editable workflows:** a workflow volume's tap toggles its steps, so it carries a
  **pencil edit control** (`ctl::edit::<id>`, top-right) that opens the edit form for the
  underlying workflow Task (`editableTask(for:)`; `saveTaskEdits` omits `steps` so the
  derived duration is untouched).
- **Trays + lifecycle:** tasks created via `spatialScene.createTaskEntity` are
  `inActiveSprint: true` (tray layout shows sprint tasks only — this was the empty-trays
  bug); dismiss returns a node to its tray; dismissing a workflow removes its open step
  nodes; connect-created workflows auto-join the sprint; a **Clear** action empties the
  volume back to trays WITHOUT deleting data.

New backend procedure: `spatialScene.unlinkWorkflows` (mirrors `linkWorkflows`, deletes
the matching `EndeavorDependency`).

**Tests:** pure spatial logic (layout engine, `SceneReducer` diff/snap-back regression,
`ConnectionRules` matrix, motion/metrics) is covered by the `Packages/SpatialKit` SwiftPM
package via `cd TaskPlannerMobile/Packages/SpatialKit && swift test` (24+ tests, macOS,
no pbxproj change — Sources are symlinks to the app's pure files). RealityKit Systems,
gestures, and glass are verified by Simulator + `xcodebuild`, NOT Vitest.

**Still deferred** (`.claude/decisions/2026-06-06-spatial-ui-deferrals.md`):
scheduling-engine output in the scene; exit animation (`LifecycleSystem`, fights SwiftUI
attachment teardown); the DomainStore/SceneModel **class** split (reassessed →
recommend NOT doing: the pure `SceneReducer` already captures the testable logic, a full
class split adds risk with no testability gain); richer pop-out layout (topological
levels); two-handed hand-tracking create.

**Milestone 4 (2026-06-08) — in-app setup workflow, ownership fixes, voice AI chat.**
Goal: do a whole planning session inside the Vision app. All BUILD SUCCEEDED; spatial
interactions are Simulator/device-verified, pure logic + backend are unit-tested.
- **Joined-step ownership (bug):** a task connected onto an ALREADY-collapsed workflow became
  a loose `stepNode` (`parentId == nil`) the client never reparented — so collapse skipped it
  and dismiss orphaned it (a floating duplicate). Fix: the client now collapses the workflow of
  ANY loose step (`collapseLooseWorkflows`, not just volume-less ones); the idempotent
  `collapseWorkflow` reparents all members via `TaskStep.taskId`. The original Task is already
  archived by the morph, so no standalone duplicate. (Vitest: idempotent join-collapse regression.)
- **Per-cluster link endeavors:** `linkWorkflows` no longer uses one hardcoded "Spatial Links"
  endeavor. `ensureClusterEndeavor` does union-find over the link graph — reuse the cluster
  holding either workflow, merge two clusters when linking across them, else auto-create one named
  `"A → B"` (user-editable). Cluster endeavors are marked by a **stable id prefix** (`spatiallink`)
  so renames don't break clustering and manual endeavors are never touched. `getLinks` derives from
  EVERY session dependency (decoupled from any name) and returns `endeavorId`/`endeavorName`;
  `unlinkWorkflows` finds the dep session-wide and prunes an emptied cluster. A pencil control on
  cross-link edges (`ctl::editlink::<endeavorId>`) opens a rename sheet (reuses `endeavor.update`).
  NO Prisma migration (id-prefix marker, not a column). (Vitest: union-find + merge.)
- **Upright cards:** `ManipulationBridge` re-asserts identity orientation each frame (primary
  manipulation rolls/tilts otherwise; `secondaryRotationBehavior=.none` only stops two-handed
  rotation). `commitDrag` + `returnToTray` zero the stored quaternion → dismiss restores the tray plane.
- **Type tray shading:** translucent type-tinted slab behind each column (`SpatialLayoutEngine.trayBounds`,
  unit-tested) rendered by `syncTrayBackings` (set-reconciled like edges; excluded from the stale-sweep).
- **× / port de-overlap:** the dismiss × and edit pencil moved to the exterior **top band**
  (`SpatialTokens.controlTopGap`), clear of the mid-edge input/output ports on short cards.
- **Gaze + double-pinch spawn:** an invisible backdrop plane (`spawnPlane`, behind cards) turns an
  empty-space `SpatialTapGesture(count: 2)` into a look-location; `createTask` spawns there and pops a
  radial **type wheel** (`SpatialTypeWheel`, port of `RadialTypePicker`) → `assignType`.
- **Backlog tray ornament** (trailing, toolbar-toggled): non-sprint tasks (tap → `addToSprint`) +
  **New Task Type** form (`userTaskType.create`). **In-app session create** in `ManagementWindow`
  (`session.create` + `setActive`). Services gained `UserTaskTypeService.create`, `SessionService.create`.
- **Voice-first AI chat** (own `WindowGroup`, the split chosen for the port): reuses the Electron
  brainstorm agent. `AgentStreamService` is a Swift SSE client for the RAW Express route
  `POST /api/agent/chat` (plain JSON, NOT tRPC/superjson) via `URLSession.bytes`, parsing `data:`
  frames into `AgentEvent` (mirrors `src/shared/agent-types.ts`). Tool execution is SERVER-SIDE, so
  the client only relays Apply/Skip to `agent.approveAction`/`rejectAction` (tRPC) — kept open
  concurrently with the SSE read. `SpeechDictator` (`SFSpeechRecognizer` + `AVAudioEngine`) gives
  voice input (mic/speech usage strings already in the target's Info build settings). On
  `done(toolCallCount>0)` the chat bumps `SpatialRoot.sceneReloadToken`; the volume observes it and
  reloads, so AI-created tasks/workflows/sprint changes appear. Opened from the "Assistant" toolbar button.

**Post-M4 fixes (2026-06-08).** (1) **Task types weren't loading** (no trays, empty type wheel/edit
picker) — they were fetched ONLY in the management window's `loadInitialData`, gated on a session
flagged `isActive` server-side; a persisted session id (authorizes `task.getAll`, so "tasks work")
could coexist with "no active session" and skip the type fetch. Fix: the volume fetches its session's
types in `load()` via `SpatialRoot.refreshTaskTypes()`, and `loadInitialData` falls back to the
persisted session. (2) **Delete** for tasks/steps: the edit form gained a destructive Delete →
task/workflow `archive`, step `workflow.deleteStep`; the SpatialEntity placement is removed too.

**Milestone 5 (2026-06-08) — endeavor management + spatial endeavor view + color-coding.**
Endeavors are first-class, reusing the `endeavor.*` tRPC surface. All BUILD SUCCEEDED; backend
unit-tested; spatial bits device/Simulator-verified.
- **Endeavors panel** = a leading ornament (toolbar-toggled, `EndeavorPanelView`): each row = color
  swatch (the legend) + name + **Show-in-scene** (eye) + **edit** (pencil → rename/recolor); plus
  **New Endeavor**. `EndeavorService` (getAll/create/update, Vision-target file under `Spatial/` — a
  new shared Core service would need a pbxproj edit); `SpatialRoot.endeavors` + `refreshEndeavors()`
  (loaded with the scene in `load()`).
- **Color-coding:** endeavors carry a color (`Endeavor.color`); `ensureClusterEndeavor` auto-assigns
  from `ENDEAVOR_COLOR_PALETTE` (by `endeavor.count % palette.length`); `getLinks` returns
  `endeavorColor`; cross-workflow **edges render in their endeavor's color** (`syncEdges` →
  `UIColor(Color(hex:))`, fallback `crossLinkEdge`). The panel swatches are the legend. Color picked
  via `ColorPicker` → `Color.toHexString()` (consolidated into `SpatialColor`, de-duped from the tray).
- **Endeavor view:** `VM.showEndeavor` adds the endeavor's `items` task ids to the active sprint →
  the scene materializes them in their type trays / as volumes (reuses `ensureSprintTaskNodes`/
  `ensureWorkflowVolumes`) → reload links so its colored edges connect them.
- **Assign / reassign links:** the cross-link edge pencil (`ctl::editlink::<from>|<to>`, now carrying
  the entity pair) opens an **Assign-to-Endeavor picker** → new `spatialScene.reassignLink` moves the
  `EndeavorDependency` to the chosen endeavor, ensures both workflows are items, prunes an emptied
  auto-cluster; the edge recolors. The old edge-rename flow was **removed** (rename/recolor is in the
  panel) — no dead code. NO Prisma migration. (Vitest: palette-color assertion on cluster create.)

**Milestone 6 (2026-06-10) — completion display: step status + Done tray.** All BUILD SUCCEEDED;
SpatialKit + Vitest green; spatial drag/drop bits need device verification (flagged below).
- **Step-node status spectrum:** `NodeCardView` now takes `status: StepStatus?` and renders the full
  lifecycle (completed/in-progress/waiting/skipped/pending) — corner SF-Symbol badge over the type
  emoji, status word in the meta row, struck-through + dimmed (0.55) for completed/skipped. Tints come
  from new `SpatialColor.stepStatus(_:)` (`.pending → nil`, keeps the plain look). `card(for:)` passes
  `step.status`. Completed STEPS still render inside an in-progress workflow (the whole point); only a
  fully-done workflow leaves the scene.
- **`SpatialTaskBucket` (pure, unit-tested, symlinked into SpatialKit):** single classifier
  (`backlog`/`sprintTask`/`sprintWorkflow`/`done`/`hidden`) replacing four hand-rolled, drifting VM
  filters. Precedence: archived→hidden, then completed→done (completion WINS over sprint membership, so
  a finished task leaves the live scene). `renderedEntities` now gates task-node/volume visibility on
  `isInScene` — a task completed ANYWHERE (desktop/AI) drops out of the volume and surfaces in the Done
  tray; this was the key correctness fix (before, completion only stopped *creating* nodes, never hid
  placed ones). Non-destructive: completion never deletes the `SpatialEntity` row, so reactivation
  re-renders it.
- **Done tray** = a top ornament (`DoneTrayView`, toolbar-toggled), counterpart to the Backlog tray:
  `viewModel.doneItems` (completed, sorted by `completedAt` desc). Tap a row → read-only review sheet
  (`DoneItemReviewView`: identity, finish time, per-step status roll-up). **Reactivate** = drag a row
  into the volume (`.draggable(id)` → `.dropDestination(for: String.self)` on the RealityView → batch
  `reactivate(taskIds:)`, one refresh+relayout) OR the review sheet's "Put Back in Progress" button
  (safety net — the ornament→volume drop is **runtime-unverified on device**; the button guarantees the
  feature is reachable regardless).
- **Reactivation reuses the server roll-up (don't fork status logic):** a standalone task uses
  `task.reopen` (completed=false + in-sprint); a WORKFLOW instead reopens its **last step** via
  `workflow.updateStep(status: pending)` — the server's step roll-up (`workflow.ts` ~271-307) then
  re-derives the workflow to a coherent in-progress/not-completed state. Flipping only the parent flag
  would leave "in progress" parent + all-"done" steps (caught by adversarial review).
- **Server:** `task.update` now clears `completedAt` whenever `completed` is set to `false` (clients
  whose serializer omits nil optionals — e.g. the Swift client — can't send an explicit null).
  (Vitest regression: reopen clears completedAt; unrelated updates don't touch it.) NO Prisma migration.

**Workflow pop-out layout (2026-06-11).** Rules for `toggleWorkflowVolume`/`materializeSteps`:
- **Lay steps out with `SpatialLayoutEngine.stepGraph(nodes:volume:collapseAnchor:metrics:)`** (pure,
  SpatialKit-tested) — never ad-hoc rows. Longest-path topological layering (Kahn passes; in-set
  `dependsOn` only; deterministic cycle fallback). Levels = columns along +x (dependencies → dependents,
  matching output→input edge flow); siblings stacked along y by `stepIndex`. Spacing packs to the volume
  (`stepColumnGap`/`stepRowGap` shrink for wide/tall graphs).
- **Stored positions win:** a node with a persisted position keeps it (clamped); only never-placed nodes
  (origin sentinel) get grid slots — so expand restores the user's arrangement verbatim and a newly-merged
  step slots in without disturbing the rest. **Collapse must ONLY hide (`setRendered(false)`) — never
  rewrite positions.**
- **`collapseAnchors` (VM, in-memory):** record the volume position at collapse; on expand translate the
  whole stored shape by however far the volume moved since (verbatim restore when unmoved / after relaunch).
- Layout math is unit-tested in SpatialKit; the expand/collapse round-trip is RealityKit behavior — eyeball on device.

Full plans: `~/.claude/plans/fluttering-hatching-dijkstra.md` (M1–3),
`~/.claude/plans/fizzy-dancing-shell.md` (M4 setup-workflow + UX fixes; M5 endeavors built on top).
