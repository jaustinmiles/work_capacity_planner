# visionOS Development Guidelines & Handoff — Task Planner Spatial Port

> **Read this first if you're working on the Vision Pro port.** It's the practical playbook distilled
> from building the whole spatial workspace. Deeper material: `.claude/rules/spatial-ui-architecture.md`
> (the production UI architecture spec) and `.claude/rules/spatial-scene-visionos.md` (data model +
> milestone log). Target: **visionOS 26.2, Xcode 16, SwiftUI + RealityKit**, scheme `TaskPlannerVision`.

---

## 0. Golden rules (internalize these — they cost the most to learn)

1. **SourceKit lies; `xcodebuild` is truth.** The editor/diagnostics index against the wrong SDK and
   report a flood of false "cannot find type X" / "AVAudioSession unavailable in macOS" errors for
   code that compiles fine. **Never trust SourceKit for this target.** The only build gate is:
   ```
   xcodebuild -scheme TaskPlannerVision -destination 'generic/platform=visionOS Simulator' build
   ```
2. **`TaskPlannerMobile/project.yml` (XcodeGen) is the source of truth — NOT the `.xcodeproj`** (which is
   gitignored and regenerated). The `TaskPlannerVision` target is defined there. Add Vision‑only Swift under
   `TaskPlannerVision/` (covered by the target's source path), then run **`xcodegen generate`** so new files
   join the target, and build. Shared `Core/` is enrolled into the Vision target via project.yml source
   paths (`TaskPlannerMobile/Core` + `TaskPlannerMobile/Shared/Color+Hex.swift`), so a genuinely new shared
   Core file compiles into Vision automatically. The one trap: a new Core file whose **type name collides**
   with a Vision `Spatial/` type (e.g. `Core/Services/EndeavorService.swift` vs Vision's own
   `EndeavorService`) is a duplicate‑symbol error — add it to the target's `excludes`. **NEVER hand‑edit the
   `.xcodeproj`** — it's regenerated from project.yml; edit project.yml. (History: the target was once
   hand‑added in Xcode and a `xcodegen generate` wiped it; codified in project.yml 2026‑06‑20. Always check
   `xcodebuild -list` shows `TaskPlannerVision` before/after running xcodegen.)
3. **Reuse the one backend engine; the Swift client is a thin projection.** All business logic
   (scheduling, the workflow morph, the AI agent, endeavors) lives server‑side and is shared with
   desktop/web via tRPC. The spatial client creates/places entities and calls the same procedures. If
   you're about to write business logic in Swift, stop — extend the server.
4. **Verify the layer you changed.** Pure logic → `SpatialKit` `swift test`. Backend → Vitest. RealityKit
   behavior (gestures, glass, hover, audio) → Simulator + **real device**. Building ≠ working.

---

## 1. UI appearance — how things should look

- **SwiftUI renders ALL content; RealityKit only places it.** Every card/panel/control is a SwiftUI view
  surfaced as a `ViewAttachmentComponent` on an `Entity`. **Never build UI from primitive meshes or 3D
  text** (the first attempt did, and it was unusable). The only meshes are structural: edge lines, edge
  endpoint spheres, tray backing slabs, the invisible spawn plane.
- **Design tokens are the single source of truth** (`Spatial/DesignSystem/`):
  - `SpatialTokens` — per‑kind dimensions (in BOTH points for `.frame` and meters for colliders), corner
    radii, control gaps, collider depth. No magic numbers in views.
  - `SpatialColor` — semantic SwiftUI tints + RealityKit edge `UIColor`s + the `Color.toHexString()`
    bridge. Per‑type color comes from `UserTaskType.swiftUIColor`; endeavors carry their own color.
  - `SpatialMotion` — durations/springs + the damping function + jitter math.
  - Adding a new kind = one token row + one `SpatialCard` content view + one factory recipe. Growth is
    additive, not edit‑in‑lockstep.
- **Glass:** wrap content in `SpatialCard` (`.glassBackgroundEffect()`, tint wash, per‑state border).
  Honor `accessibilityReduceTransparency` (opaque fallback) and `accessibilityReduceMotion` (no pulses).
- **Color discipline:** edges use `UnlitMaterial` with `blending = .transparent(...)` and
  `applyPostProcessToneMap: false` so the hex matches the SwiftUI palette. Convert with
  `UIColor(Color(hex:))`. Cross‑workflow edges are tinted by their **endeavor's** color; the Endeavors
  panel's color swatches are the legend. Notes/selection/edges all come from `SpatialColor`, never raw
  `.yellow`/`.systemTeal` literals.
- **The volume:** baseplate hidden (`.volumeBaseplateVisibility(.hidden)`); positions are **meters,
  origin‑centered** (verified — an attachment at `[0,0,0]` renders centered). All positioning goes through
  the pure `VolumeMetrics`/`SpatialLayoutEngine` — type panels across the top, task columns beneath, with
  translucent type‑tinted **tray backing slabs** behind each column so nodes read as "in a tray."

---

## 2. Interactability — the load‑bearing part (most bugs live here)

- **Transform ownership is the foundation.** Exactly one authority owns an entity's live transform at any
  instant: `TransformOwnership { data, gesture, animating }`, held in the `@Observable` model and mirrored
  to a component. **The reconcile / RealityView `update:` closure writes IDENTITY only** (add/remove
  entities, set a `LayoutTargetComponent` target for `.data`‑owned entities) — it must **never** write a
  live transform. RealityKit **Systems** own continuous motion (`LayoutTweenSystem` glides to target;
  `EdgeSystem` follows endpoints; `PulseSystem` pops). This is what makes the drag **snap‑back impossible
  by construction** — do not regress it by re‑stamping positions in the update closure.
- **Drag = `ManipulationComponent`** (visionOS 26), configured once at creation:
  `releaseBehavior = .stay` (the default `.reset` IS a snap‑back), `dynamics.scalingBehavior = .none`,
  `dynamics.secondaryRotationBehavior = .none`, `allowedInputTypes = .indirect`.
- **Taps need the bridge, not `GestureComponent`.** A `GestureComponent` tap does **NOT fire on an entity
  that also has a `ManipulationComponent`** (verified at runtime). Detect taps via `ManipulationBridge`:
  subscribe to `ManipulationEvents`, and on `WillEnd` treat **< ~1.5 cm of travel as a tap** (route it),
  otherwise a drag (commit + persist). Don't add tap `GestureComponent`s to manipulable entities.
- **Orientation:** cards are **locked upright** — the primary manipulation otherwise rolls/tilts them
  (`secondaryRotationBehavior` only stops the two‑handed rotation). Re‑assert identity orientation each
  `DidUpdateTransform` frame in the bridge, and persist identity. This is the same pattern as the
  (currently disabled) depth lock.
- **Controls = sibling/child entities, not SwiftUI buttons.** The `×` dismiss, the connect **ports**
  (output right / input left), the edit **pencil**, and edge controls (remove `×`, assign pencil) are each
  their own `Entity` with their OWN `ManipulationComponent`, sitting **in front** of the card's thin
  collider (`controlFrontGap`) so they win the hit test. Key facts:
  - **A button inside a SwiftUI attachment does NOT receive taps** in a placed entity — make controls real
    child entities routed by **name** (`ctl::<role>::<ownerId>`), parsed in the bridge.
  - **Size colliders from tokens, not `visualBounds`** (recursive `visualBounds` drifts and churns every
    frame; a parent collider that *encloses* a child swallows the child's hits — Apple DTS forum 747256).
  - Give the card and each control **distinct `HoverEffectComponent.GroupID`s** so hover doesn't couple.
  - **Lay controls clear of the ports:** the `×`/edit live in the exterior **top band**
    (`SpatialTokens.controlTopGap`, above the top edge); ports stay at the left/right mid‑edges. On a short
    card, "top‑left corner" overlaps "left‑mid port" — that was a real bug.
  - A SwiftUI `.hoverEffect` inside an attachment does **not** reliably drive a placed entity; use the
    entity's `HoverEffectComponent(.highlight, groupID:)`.
- **Connect / edges:** drag the output port → rubber‑band (`edge::pending`) → drop on the nearest node
  (distance, not raycast — an indirect‑pinch port has no aim vector). `EdgeSystem` positions edges from
  **live** port/node positions each frame (set‑reconciled by a stable key — O(changed), never teardown‑all).
  Edges route output→input, are translucent, and carry midpoint controls.
- **Gaze + double‑pinch create:** there is an invisible collidable **spawn plane** behind the cards; a
  `SpatialTapGesture(count: 2).targetedToAnyEntity()` on it yields the gaze‑resolved point via
  `value.convert(value.location3D, from: .local, to: .scene)`. **Guard `value.entity.name == spawnPlane`**
  so a double‑pinch on a card doesn't spawn. (Cards sit in front, so they keep gaze priority.)

---

## 3. Windows, ornaments, sheets — the surface model

- **Volume** (`.volumetric` `WindowGroup`) = the workspace. A **2D companion window** (`ManagementWindow`)
  handles setup/auth + session switching + in‑app session create (lists are far more reliable flat than in
  3D). The **AI chat is its own `WindowGroup`** (roomy for a transcript).
- **Ornaments = dismissable side panels:** the **Backlog** tray on `.scene(.trailing)`, the **Endeavors**
  panel on `.scene(.leading)`, toggled from the bottom‑ornament toolbar.
- **Sheets = forms:** node edit, create‑task/note, create‑task‑type, the radial **type wheel**, endeavor
  create/edit, "assign link to endeavor." Use `.sheet(item:)` with an `Identifiable` payload.
- **Cross‑window communication** goes through the shared `@Observable` `SpatialRoot`. Example: after the AI
  agent makes changes it bumps `root.sceneReloadToken`; the volume's `SpatialWorkspaceView` observes it via
  `.onChange` and reloads. Don't try to reach across windows any other way.

---

## 4. Data loading & state — subtle but bites hard

- **Each surface fetches what it needs.** Do NOT rely on another window having populated shared state. The
  task‑types‑never‑appeared bug was exactly this: types were fetched only in the management window, gated on
  a server `isActive` session, so the volume could open (tasks loaded via a persisted session id) with empty
  types forever. Fix: the volume fetches its session's types in its own `load()`.
- **`@Observable` + imperative builders.** A SwiftUI `body` that reads `viewModel.x` (even through a nested
  `root.@Observable`) re‑renders when `x` changes — good for the type wheel / panels. But **imperative
  builders that run once** (`relayout()` → `ensurePanels()`/`ensureSprintTaskNodes()`) do NOT re‑run when
  data later changes. So **fetch data before you build**, or trigger a rebuild explicitly.
- **Sprint membership gates materialization.** The scene only materializes `inActiveSprint` tasks (into type
  trays) / workflows (as volumes). So "pull a backlog task in" and "show this endeavor in the scene" both
  work by `setSprintMembership(true)` + `relayout()`. (Side effect: those items join the active sprint — by
  design, since the volume *is* the sprint workspace.)
- **`SpatialEntity` is a placement projection** (like `DeepWorkNode`), separate from canonical
  `Task`/`TaskStep`. Ownership/identity bugs come from the projection drifting from canonical data — e.g. a
  joined step kept `parentId == nil` while its `TaskStep.taskId` was correct, so collapse/dismiss (which key
  off `parentId`) missed it. When you mutate identity, fix the projection in the same breath.

---

## 5. Audio / Speech (voice) — crashes here are uncatchable

- **`AVAudioEngine`/Speech failures are process‑terminating traps, not Swift `Error`s** — a `do/catch`
  does NOT save you. Two specific traps bit us:
  - **Privacy (TCC):** touching `SFSpeechRecognizer`/the mic with a **missing usage string** hard‑kills the
    app. Put `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` **in the physical
    `Info.plist`** — `INFOPLIST_KEY_*` build settings are *not* a guaranteed runtime merge.
  - **`installTap` with an invalid format:** in the **Simulator** the mic bus reports `sampleRate == 0`;
    `installTap` with that format traps. **Guard the format** (`sampleRate > 0 && channelCount > 0`) and
    fail gracefully. The Simulator has no usable mic — design voice to degrade to an error there.
- **Permissions are two separate grants:** speech (`SFSpeechRecognizer.requestAuthorization`) ≠ microphone
  (`AVAudioApplication.requestRecordPermission`). Request **both**, in sequence, before starting the engine.
- **The physical `Info.plist` must be EXCLUDED from the target's sources, or it double-produces.** It is
  wired via `INFOPLIST_FILE`; if it ALSO gets copied as a resource you get `Multiple commands produce
  .../Info.plist`. This is now handled in `project.yml` by the Vision target's `sources.excludes:
  ["Info.plist"]` (no manual pbxproj exception — that approach is obsolete under XcodeGen).
- **The partial Info.plist ALSO needs `GENERATE_INFOPLIST_FILE: true`.** The physical plist only holds the
  privacy strings + scene manifest; `GENERATE_INFOPLIST_FILE` merges the standard keys (CFBundleIdentifier
  from PRODUCT_BUNDLE_IDENTIFIER, CFBundleExecutable, versions) ONTO it. Without it the app **builds but
  has no CFBundleIdentifier and fails to INSTALL** on device (`CoreDeviceError` 3000) — `xcodebuild build`
  does NOT catch this; only install does. Verify the merged bundle with
  `plutil -p <DerivedData>/.../TaskPlannerVision.app/Info.plist | grep -iE "CFBundleIdentifier|microphone"`.
- **Lifecycle:** tear the engine/tap/session down on the chat window's `.onDisappear` (it's a dismissable
  window — closing mid‑dictation otherwise leaves the mic hot), and `setActive(false)` to un‑duck other audio.

---

## 6. Backend integration

- **tRPC** via the shared `TRPCClient` (superjson transformer; sends `x-api-key` + `x-session-id`). New
  spatial procedures go in `src/server/router/spatialScene.ts`; reuse `sessionProcedure`.
- **The AI agent is NOT tRPC.** It's a raw Express SSE route `POST /api/agent/chat` (plain JSON, not
  superjson) — the Swift client reads it with `URLSession.bytes` and parses `data:` frames into an
  `AgentEvent` enum mirroring `src/shared/agent-types.ts`. **Tool execution is server‑side**, so the client
  only relays Apply/Skip to `agent.approveAction`/`rejectAction` (tRPC, called concurrently while the stream
  stays open) and reloads the scene on `done`.
- **Multi‑write mutations must be transactional and trust‑bounded.** Any server mutation that does several
  writes (merge/reassign an endeavor dependency, etc.) belongs in a single `ctx.prisma.$transaction` so a
  partial failure rolls back, and must **pre‑check unique constraints** (e.g. de‑dupe instead of letting
  `@@unique` throw). The **server is the trust boundary** — validate that ids in the input belong to the
  session (the client picker is not a guarantee).

---

## 7. Testing & verification

- **Pure logic is unit‑tested off‑device:** `Packages/SpatialKit` is a SwiftPM package whose `Sources/` are
  **symlinks** to the app's pure files (`SpatialLayoutEngine`, `VolumeMetrics`, `SceneReducer`,
  `ConnectionRules`, `SpatialMotion`). Run `cd TaskPlannerMobile/Packages/SpatialKit && swift test` on macOS
  — no pbxproj change, no duplication. Keep load‑bearing logic `nonisolated` + Foundation/simd only so it
  stays testable.
- **Backend:** Vitest (`mcp__diagnostic__run_tests`), plus `typecheck` + `run_lint`. Full verify chain
  before every commit.
- **RealityKit/gestures/glass/audio are NOT unit‑testable here** — Simulator + device. Run an **adversarial
  review** on substantial diffs: it has repeatedly caught runtime‑only defects the build + happy‑path tests
  miss (an audio/mic lifecycle leak, non‑atomic multi‑writes, a non‑deterministic query, a missing
  session‑ownership check, a false invariant in a doc comment).

---

## 8. Hygiene & gotchas checklist

- [ ] Built with `xcodebuild` (not "SourceKit is green").
- [ ] New Vision‑only files under `TaskPlannerVision/` AND ran `xcodegen generate` (they don't join the
      target until regen); a new shared `Core/` file compiles in unless its type name collides with a
      `Spatial/` type (then add it to the Vision target's `excludes` in `project.yml`).
- [ ] No business logic added to Swift — reused a tRPC procedure.
- [ ] Reconcile writes identity only; no live‑transform write in the `update:` closure.
- [ ] Controls are child entities (own `ManipulationComponent`, token colliders, distinct hover GroupID),
      routed by name, laid clear of ports.
- [ ] New colors/dims/motion come from `SpatialTokens`/`SpatialColor`/`SpatialMotion`.
- [ ] Privacy usage strings in the physical `Info.plist`; audio format guarded; mic + speech both requested.
- [ ] Multi‑write server mutations are `$transaction`‑wrapped + unique‑pre‑checked + session‑validated.
- [ ] Pure logic covered in `SpatialKit`; backend in Vitest; full chain green before commit.
- **Cleanup debt:** `TaskPlannerVision/Spatial/SpikeView.swift` is a Phase‑0 throwaway harness and
  `SpatialSetupView.swift` is superseded by `ManagementWindow` — both are untracked and safe to delete.

---

## 9. Where things live (file map)

```
TaskPlannerVision/
  TaskPlannerVisionApp.swift   # @main; WindowGroups: ManagementWindow (2D), volume, chat
  ContentView.swift            # SpatialWorkspaceView (owns the VM; observes sceneReloadToken)
  Info.plist                   # privacy usage strings live HERE
  Spatial/
    SpatialRoot.swift          # @Observable composition root: services, sessions, types, endeavors
    SpatialSceneViewModel.swift# scene state + actions (load, connect, collapse, endeavors, voice glue)
    SpatialSceneView.swift     # RealityView + identity-only reconcile + controls + edges + toolbar/ornaments
    SpatialModels.swift / SpatialSceneService.swift / EndeavorService.swift   # models + tRPC wrappers
    ManagementWindow.swift     # 2D setup/session window
    SpatialEndeavorPanel.swift / SpatialTrayOrnament.swift / SpatialTypeWheel.swift / SpatialNodeFormView.swift
    AgentStreamService.swift / SpatialChatModel.swift / SpatialChatView.swift / SpeechDictator.swift  # AI + voice
    Interaction/ManipulationBridge.swift     # drag/tap bridge (the tap displacement-gate)
    Systems/ (LayoutTween, Pulse, Edge) + Components/ + DesignSystem/ (Tokens, Color, Motion, SpatialCard)
    Layout/ (SpatialLayoutEngine, VolumeMetrics)  # pure, nonisolated, symlinked into SpatialKit
    Rendering/ (NodeCard, TypePanelCard, WorkflowVolumeCard, NoteCard)  # content-only SwiftUI
  Packages/SpatialKit/         # swift test for the pure logic
```

Backend: `src/server/router/spatialScene.ts` (+ `endeavor.ts`, `task.ts`, `workflow.ts`, `userTaskType.ts`,
`session.ts`, `agent/*`), `src/shared/spatial-types.ts`, `src/shared/deep-work-morph.ts`,
`src/server/morph-executor.ts`.
