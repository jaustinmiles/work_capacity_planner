# iOS 26 Development Guidelines — Task Planner Mobile (iPhone)

> **Read this first if you're working on the iOS app.** It's the practical playbook for the modern
> iOS revamp, distilled from a verified (adversarially fact-checked against developer.apple.com)
> research pass — see the milestone log / decisions for provenance. Target: **iOS 26, Xcode 26,
> SwiftUI**, scheme `TaskPlannerMobile`. The iOS app is the **on-the-go companion** to the desktop /
> Vision Pro planning surfaces: execution + brain-dump, NOT full planning. See
> `.claude/rules/visionos-development-guidelines.md` for the sibling spatial port and
> [[project-ios-revamp]] in memory for the initiative's direction.

---

## 0. Golden rules (internalize these)

1. **Thin client, like the Vision port.** ALL business logic (scheduling, next-task validation,
   work-logging roll-ups, the workflow morph, priority) lives server-side and is shared via tRPC.
   If you're about to write scheduling/priority/validation logic in Swift, stop — extend the server
   and call it. The ONE exception is a faithful **port** of a small pure validator for offline/optimistic
   UX (e.g. `isItemStartable`), which must stay behaviorally identical to its TS source and be unit-tested.
2. **`project.yml` is the source of truth, not the pbxproj.** The project is generated with **XcodeGen**.
   The `.xcodeproj` is disposable. Add files by dropping them in the target's `sources` path (they
   auto-join on regenerate); add an **extension target** (Widget / Control / Share / App Intents) by
   declaring it in `project.yml` and regenerating (`xcodegen generate` in `TaskPlannerMobile/`).
   Deployment target + Info.plist keys (incl. mic/speech usage strings) live in `project.yml`.
3. **Build gate is `xcodebuild`, not SourceKit.** As on the Vision target, the editor indexes can lie.
   The truth is:
   ```
   xcodebuild -scheme TaskPlannerMobile -destination 'generic/platform=iOS Simulator' build
   ```
   The build machine has Xcode 26.3 / iOS 26.2 SDK (verified) — Liquid Glass and the 2025 speech APIs
   compile here.
4. **Deployment target is iOS 26.0.** This is a deliberate "latest iOS" decision (the user's explicit
   direction) — see `decisions/2026-06-20-ios-26-deployment-target.md`. So iOS 26-only APIs can be used
   WITHOUT `if #available` gates **in app code**. EXCEPTION: any code shared into a **WidgetKit / Control**
   extension whose own minimum differs, and any helper you might want to lower later, should still gate.
   When in doubt, gate custom glass with an `.ultraThinMaterial` fallback (cheap insurance).
5. **Excluded from iOS entirely:** deep work board, memory, decide, matrix. Drop the `Board` tab and
   `Features/Board/`. Don't port `DeepWorkBoardService` usage into the new shell.

---

## 1. App shell & navigation

- **Root = `TabView` with the value-based `Tab` API** (`Tab(_:systemImage:value:) { NavigationStack { } }`,
  iOS 18+). Each tab owns its **own** `NavigationStack(path:)`. Liquid-Glass tab-bar styling is **automatic**
  on the iOS 26 SDK — don't style it.
- **Tabs for this app** (drop Board): **Now** (start-next-task + active timer), **Today** (editable
  clock/log timeline), **Endeavors** (browse → per-endeavor next task), **Chat** (AI assistant), and a
  `Tab(role: .search)` for finding tasks/workflows (role API iOS 18+, its glass search-field swap is iOS 26).
  Capture is a **FAB / bottom-accessory action + App Intent**, not necessarily its own tab (decide per UX).
- **`.tabBarMinimizeBehavior(.onScrollDown)`** (iOS 26) — the floating glass tab bar minimizes while
  scrolling a long log/timeline. iPhone scroll-minimize.
- **`.tabViewBottomAccessory { CurrentTaskPill() }`** (iOS 26, iPhone/iPad/Catalyst only) — the
  **persistent running-task / timer pill** above the tab bar. THE signature surface for "what am I doing
  right now." Read `@Environment(\.tabViewBottomAccessoryPlacement)` (Optional: `.inline` collapsed /
  `.expanded`) to swap a compact running-timer chip for a fuller card.
- **Search:** `.searchable(text:placement:prompt:)` (iOS 15+) + `.searchToolbarBehavior(.minimize)`
  placed AFTER `.searchable` (iOS 26); `DefaultToolbarItem(kind: .search, placement: .bottomBar)` for a
  reachable bottom search on iPhone (iOS 26).
- **Keep `NavigationStack` structurally STATIC** — switch content INSIDE it; never wrap the stack in an
  `if` (that drops `@State`/scroll position). Same for rows: use inert variants (`.opacity`/`.disabled`)
  over identity-toggling conditionals.
- **`.scrollEdgeEffectStyle(.soft, for: .top)` / `(.hard, for: .bottom)`** (iOS 26) so log/timeline
  content stays legible under the floating bars.
- **Sheets** (task create, quick capture, workflow edit, done review): `.presentationDetents([.medium,.large])`
  (iOS 16+). Glass is the default on iOS 26 — **delete any custom `.presentationBackground`/`.thickMaterial`**.
  Use `.presentationBackgroundInteraction(_:)` (iOS 16.4+) if the timer must stay tappable behind a sheet.

---

## 2. Liquid Glass — the rules (most mistakes live here)

- **Glass is the NAVIGATION/CONTROL layer ONLY.** Tab bar, toolbars, the bottom-accessory pill, FABs,
  sheets. Apple: *"Liquid Glass applies to the topmost layer of the interface, where you define your
  navigation."* The **content layer stays plain**: log timeline, swim lanes, clock face, task lists,
  endeavor cards, text — all on system-colored/plain surfaces.
- **Get it for free:** recompiling on the iOS 26 SDK gives stock bars/sheets/tab bars/controls Liquid Glass
  with zero code. **Do NOT hand-roll glass to mimic the system look.**
- **Custom glass only for controls you build** (a circular "Start next task" FAB, a custom timer chip):
  `.glassEffect(_:in:)` — default `Glass.regular`, shape defaults to a capsule. Reserve `Glass.clear`
  for controls over bright/media backgrounds WITH a dimming layer (we have ~none → almost never).
- **Group adjacent custom glass in ONE `GlassEffectContainer(spacing:)`** — glass can't sample glass;
  the container shares one sampling region, enables morphing, and is the documented perf lever.
- **Tint with meaning:** `.glassEffect(.regular.tint(typeColor).interactive(), in: Capsule())` to signal
  task-type or a primary/destructive action; `.interactive()` for press-responsive glass on real buttons.
- **DON'T** stack glass on glass, scatter standalone `.glassEffect` across many controls, or mix
  `.regular` and `.clear` in one cluster.
- **Morphing glass:** `.glassEffectID(_:in:)` (a `@Namespace`) + `.glassEffectUnion(id:namespace:)`;
  transitions via `.glassEffectTransition(.matchedGeometry / .materialize / .identity)`. (e.g. a FAB that
  expands into the capture sheet, the tab-bar minimize.)
- **Accessibility is AUTOMATIC for stock glass:** Reduce Transparency frosts it, Increase Contrast adds
  borders, Reduce Motion disables elastic — built into the material. **Do NOT manually strip system glass
  by reading accessibility env values.** Only honor `accessibilityReduceTransparency` for **your own**
  custom translucent surfaces, and give custom glass a `Glass.identity` fallback.
- **Buttons:** `.bordered/.borderedProminent` and the new `.glass/.glassProminent` styles (iOS 26);
  `.buttonBorderShape(.capsule/.circle)`.
- **Perf caution is LOW-confidence:** Apple publishes no glass GPU/battery numbers. Only doc-backed levers
  are "use `GlassEffectContainer`" and "limit custom glass." Profile, don't assume.

---

## 3. Signature motion (purposeful, ADHD-calm)

- **Odometer numbers:** `.contentTransition(.numericText(value:))` driven by `.animation(_:value:)` for the
  live timer, logged-minute totals, per-type tallies. (`numericText(value:)` iOS 17+.) Never the deprecated
  value-less `.animation(_:)`.
- **Status icon morphs:** `Image(systemName:).contentTransition(.symbolEffect(.replace))` for play↔pause and
  pending→in-progress→done. `.symbolEffect(.breathe)` (iOS 18) for a calm "running" state; `.bounce` on
  complete, `.pulse` on waiting/blocked, `.variableColor.iterative` for an active indicator. Gate
  `.drawOn/.drawOff` to iOS 26.
- **Hero zoom (iOS 18, NOT 26):** `.matchedTransitionSource(id:in:)` on a row + `.navigationTransition(.zoom(sourceID:in:))`
  on the destination, one `@Namespace` — endeavor card → detail, task row → workflow editor. Works across
  pushes AND sheets (where `matchedGeometryEffect` can't).
- **Scroll polish on the timeline:** `.scrollTransition(_:axis:transition:)` (iOS 17) for enter/leave fade/scale;
  geometry-driven `.visualEffect { content, proxy in }` (iOS 17, no layout pass) for sticky "now" headers /
  parallax. Day-paging: `.scrollPosition(id:anchor:)` + `.scrollTargetLayout()` + `.scrollTargetBehavior(.viewAligned/.paging)`.
- **Springs:** prefer named presets — `.smooth` (calm settle), `.snappy` (UI default for start/stop),
  `.bouncy` (reserve for celebration). Practically iOS 17+.
- **Haptics for milestones, not buzzing:** `.sensoryFeedback(.success, trigger: completedCount)`,
  `(.start/.stop, trigger: isRunning)`, `(.selection, trigger: nextTaskId)` (iOS 17+). For an ADHD audience,
  gentle `.selection/.success` only — never constant feedback. (impact members are iPhone-only.)
- **Multi-step flourish:** `.phaseAnimator` (iOS 17) for a subtle "task done"; `KeyframeAnimator` only when
  you need independent per-property tracks (its content closure runs every frame — keep cheap).
- **Optional premium backdrop:** animated `MeshGradient` (iOS 18) behind a focus/pomodoro screen — content
  layer only, profile on low-end devices.

---

## 4. Quick capture / brain dump (the iOS-specific superpower)

One `AppIntent` powers everything — build it once, surface it many ways. Ranked effort vs payoff:

1. **App Shortcuts (HIGHEST payoff, low-med effort, iOS 16+):** an `AppIntent` that creates a task, exposed
   via `AppShortcutsProvider` (`AppShortcut` phrases each containing `\(.applicationName)`). Free Siri
   ("add <task> to <app>"), Spotlight, Action Button, and Shortcuts-app automations. `openAppWhenRun` is
   deprecated — prefer result-type / `OpensIntent`.
2. **Interactive Snippet confirm-without-opening (iOS 26):** from the capture intent call
   `requestConfirmation(actionName:snippetIntent:)` returning a `SnippetIntent` so the user reviews/edits the
   parsed task on a card and confirms without launching. (Static `ShowsSnippetView` exists since iOS 16.)
3. **Control Center / Lock Screen / Action Button control (iOS 18):** a `ControlWidget` with
   `ControlWidgetButton` firing the capture intent. One tap into capture.
4. **Interactive Home Screen widget (iOS 17):** `Button(intent:label:)` runs the intent in-process; free-text
   needs a keyboard so deep-link to a capture sheet, but one-tap "start next task" / "log done" run in place.
5. **Voice (iOS 26):** `TextField` system dictation is the zero-cost baseline (system mic key, no entitlement).
   Long-form on-device → `SpeechAnalyzer` + `SpeechTranscriber` (`DictationTranscriber` fallback;
   `AssetInventory.assetInstallationRequest` to fetch models). `SFSpeechRecognizer` (NOT deprecated) is the
   pre-26 path. Custom in-field dictation needs `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription`
   (ALREADY in `project.yml`). The iOS `Features/Chat/VoiceInputButton.swift` already does voice — reuse/extend it.
6. **Structure the dump with Apple Intelligence (iOS 26):** `SystemLanguageModel` + `LanguageModelSession.respond(to:generating:)`
   with a `@Generable CapturedTask` to turn a messy dump into structured tasks **on-device**. Gate on
   `SystemLanguageModel.default.availability` and **fall back to the existing server AI agent** when unavailable.
7. **Share Extension (iOS 8+):** capture text/links from any app (App Group or queued tRPC sync).
8. **Live Activity (situational):** `ActivityKit` + `LiveActivityIntent` interactive buttons fit EXECUTION
   status (start/stop/advance a running task on Lock Screen / Dynamic Island), not free-text dump.

**RECOMMENDED BUILD ORDER:** ship #1 (App Shortcuts capture intent) + #4 (interactive widget) first — they
reuse one intent and cover Siri/Spotlight/Action Button/widget. Then #2 (snippet) + #3 (control); #5/#6
voice+LLM as the premium tier, always with the server-agent fallback. The user wants all four surface
families eventually; **first pass = in-app quick capture + voice**, with the App Intent foundation laid so
the extensions are cheap.

---

## 5. Performance & Observation (responsiveness is a feature)

- **`@Observable` (iOS 17), never `ObservableObject`+`@Published`** — per-property tracking minimizes
  invalidations. Initialize with `@State`; pass down via plain `let` or `.environment(_:)`. **NEVER** pair
  `@Observable` with `@StateObject`/`@ObservedObject` (this repo's `AppState` already uses `@Observable` +
  `@State` — match it).
- **Per-item view models** in an `@ObservationIgnored [ID: VM]` dictionary so toggling one task's status
  invalidates only that row, not the whole list.
- **Keep work out of `body`:** build formatters once in the model; precompute derived strings (timer text,
  durations) into a cache refreshed only on data change. Never construct a `DateFormatter` in `body`.
- **Don't put fast-changing values (timer ticks, geometry) in `@Environment`** — route through `@Observable`.
- **`List`, not `LazyVStack`/`VStack`, for long recyclable content** (endeavors, today's log). Never wrap a
  `List` in a `ScrollView`. `ForEach` over `Identifiable` with stable ids (never array index).
- **`.task(priority:_:)`** for lifecycle async (auto-cancels on disappear); **`.task(id:)`** to restart on a
  changed query/selection; **`.refreshable`** for pull-to-refresh. (all iOS 15+, cooperative cancellation.)
- **Concurrency (Swift 6.2 / Xcode 26 "Approachable Concurrency"):** the project can adopt
  `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. The `View` protocol is `@MainActor @preconcurrency`, so an
  `async` method on a View runs on **main** unless marked `nonisolated` — the #1 accidental main-thread jank
  trap. Push heavy work off-main with `nonisolated`/`@concurrent`, hop back to set `@Observable` props.
- **Profile** with the Instruments 26 **SwiftUI template** (Update Groups / Long View Body Updates lanes +
  Cause & Effect Graph) on a real iOS 26 device.

---

## 6. Accessibility & ADHD-calm design

- **Dynamic Type:** built-in text styles (`.font(.body/.headline/...)`), never `.system(size:)`. Scale custom
  metrics with `@ScaledMetric(relativeTo: .body)`. Clamp `.dynamicTypeSize(...accessibility3)` ONLY on dense
  rows; let body text reach accessibility5. Reflow `HStack→VStack` at `.dynamicTypeSize.isAccessibilitySize`
  via `AnyLayout`/`ViewThatFits`.
- **Reduce Motion:** `@Environment(\.accessibilityReduceMotion)` → `withAnimation(reduceMotion ? nil : .snappy)`;
  ALWAYS keep a static state cue (checkmark + "Done") when motion is removed.
- **Reduce Transparency:** system glass adapts automatically — only handle it for YOUR custom translucent
  surfaces (swap to opaque `Color(.systemBackground)`). iOS 26.1 adds a user Settings > Liquid Glass
  (Clear|Tinted) toggle — mention in onboarding as a calming option.
- **Never color-only meaning:** every task status (waiting/in-progress/done/blocked/skipped) carries an
  **SF Symbol + status word** in addition to color — honor `@Environment(\.accessibilityDifferentiateWithoutColor)`.
  ADHD users parse glyphs faster than hue; redundant encoding (color + shape + text + optional haptic) is the
  throughline. This matches the repo's existing `getTypeColor()` + status-badge mandate.
- **Semantic colors** (`Color(.label)/.secondaryLabel/.systemBackground`, `.primary/.secondary`, `.tint`) over
  hardcoded hex; add asset "High Contrast" variants, read `@Environment(\.colorSchemeContrast)`. Meet 4.5:1
  body / 3:1 non-text contrast.
- **Progressive disclosure:** ONE primary action per screen (the start-next-task widget is the model); defer
  config behind `DisclosureGroup`/`Menu`/a detail sheet. Generous whitespace, short labels.
- **Brand alignment:** carry the Vision Pro spatial design's per-type color + depth tokens into a shared iOS
  design-token enum so the product family feels coherent (the user's chosen direction).

---

## 7. Backend & Core integration

- **tRPC** via the shared `Core/Networking/TRPCClient` (superjson; `x-api-key` + `x-session-id`). Services
  live in `Core/Services/`. New iOS-needed server procedures go in the relevant `src/server/router/*.ts`,
  reuse `sessionProcedure`, validate task types at the trust boundary (`assertValidTaskType`), and wrap
  multi-write mutations in `ctx.prisma.$transaction`.
- **Known additions for the revamp** (see the plan/decision docs for status):
  - **`EndeavorService.swift`** (Core) + register in `AppState` — `EndeavorModels.swift` exists, the service
    does not.
  - **Per-endeavor next task** — the one genuinely new server procedure (reuse the unified scheduler /
    `next-task-validation`; do NOT fork next-task logic into Swift). Decide server-filter vs client-filter
    in the plan (lean server, per the thin-client rule).
  - **`TaskService` step-edit wrappers** (add/edit/reorder/delete workflow steps) for the workflow editor.
  - **Port `isItemStartable`** (`src/shared/next-task-validation.ts`) to Swift for optimistic start UX —
    behavior-identical + unit-tested in `TaskPlannerMobileTests`.
  - **Today clock/log math** — read today's `WorkSession`s; reuse desktop logger logic where it's already
    shared; `WorkSessionService` has update/split/delete for editing logged segments.

---

## 8. Testing & verification

- **Build gate:** `xcodebuild -scheme TaskPlannerMobile -destination 'generic/platform=iOS Simulator' build`.
  Regenerate the project after `project.yml` edits (`xcodegen generate`).
- **Pure Swift logic** (ported validators, clock/log math, formatters) → unit tests in
  `TaskPlannerMobileTests` (`bundle.unit-test` target already wired in `project.yml`).
- **Backend** additions → Vitest (`mcp__diagnostic__run_tests`) + `typecheck` + `run_lint`. Full chain green
  before commit.
- **SwiftUI/glass/gestures/motion are NOT unit-testable here** — Simulator + device. Run an adversarial review
  on substantial diffs.

---

## 9. Where things live (current map)

```
TaskPlannerMobile/
  project.yml                      # XcodeGen source of truth (deployment target, Info.plist keys, targets)
  TaskPlannerMobile/
    App/ TaskPlannerApp.swift (@main, MainTabView), AppState.swift (@Observable composition root)
    Shared/ TypeBadge, StatusBadge, ProgressRing, RadarChartView, DurationLabel, Color+Hex   # reusable atoms
    Core/
      Networking/ TRPCClient, SuperJSONEncoder/Decoder, AuthManager
      Models/ Session, Enums, ChatModels, EndeavorModels, UserTaskType, TaskModels, WorkModels
      Services/ TaskService, WorkSessionService, SessionService, UserTaskTypeService,
                ConversationService, WorkPatternService, DeepWorkBoardService(unused on iOS — Board dropped)
    Features/
      Now/      NowView, NowViewModel, StartNextTaskCard, ActiveTimerCard, SessionTimelineView,
                TodayProgressCard, QuickTaskSheet, QuickTaskViewModel, StartSessionSheet, DeadlineSection
      Schedule/ ScheduleView, ScheduleViewModel, AccumulatedTimeChart, TimelineBlockRow
      Chat/     ChatView, ChatViewModel, MessageBubble, VoiceInputButton    # voice already wired
      Board/    (TO DELETE — deep work, excluded from iOS)
      Settings/ SettingsView, SessionPickerView, OnboardingView
  TaskPlannerMobileTests/          # bundle.unit-test target
  Packages/                        # SwiftPM packages
```

Backend: `src/server/router/{task,workflow,workSession,endeavor,userTaskType,session}.ts`,
`src/shared/unified-scheduler.ts`, `src/shared/next-task-validation.ts`.

---

## 10. Sources (verified against developer.apple.com)

Adopting Liquid Glass (TechnologyOverviews); WWDC25 219 (Meet Liquid Glass), 323 (Build a SwiftUI app with
the new design), 256 (What's new in SwiftUI), 284, 306 (Optimize SwiftUI performance with Instruments);
SwiftUI docs for `glassEffect`/`Glass`/`GlassEffectContainer`/`glassEffectID`/`glassEffectUnion`/
`glassEffectTransition`/`Tab`/`tabBarMinimizeBehavior`/`tabViewBottomAccessory`/`searchToolbarBehavior`/
`scrollEdgeEffectStyle`/`navigationTransition(.zoom)`/`matchedTransitionSource`/`contentTransition.numericText`/
`scrollTransition`/`visualEffect`/`phaseAnimator`/`sensoryFeedback`/`scrollPosition`; Symbols
`symbolEffect`/`breathe`/`drawOn`; AppIntents `AppShortcutsProvider`/`SnippetIntent`/`requestConfirmation`;
WidgetKit `ControlWidgetButton`/`Button(intent:)`; Speech `SpeechAnalyzer`/`SpeechTranscriber`/`DictationTranscriber`;
FoundationModels `SystemLanguageModel`/`LanguageModelSession`/`Generable`; Observation `Observable()`;
swift.org Swift 6.2; HIG Color. (Full URL list in the research artifact for this initiative.)
