# Journal / Mind Map feature — architecture & how to extend

> Added 2026-06-28. A top-level **Journal** surface: rich-text journaling tied to calendar days,
> plus an AI-processed, artistic, infinite-zoom **mind map** with a persistent layout and a
> **codified, non-hallucinated** relationship model. Full rationale:
> `.claude/decisions/2026-06-28-journal-mindmap-feature.md`.

## The one thing to internalize: the trust boundary

The hard requirement — "the AI cannot hallucinate outside the codified relationships" — lives in ONE
pure function: **`sanitizeMindMapExtraction`** (`src/shared/mindmap-extraction.ts`). The AI proposes;
this function disposes. It runs server-side (in `mindmap.processEntry`) BEFORE any write and:

- drops nodes whose `kind` ∉ `MindMapNodeKind`;
- drops edges whose `relationshipType` ∉ `MindMapRelationshipType`;
- drops edges whose endpoints don't resolve to a real node (existing-in-scene or new-in-batch);
- **drops edges that violate the relationship matrix** (`isRelationshipAllowed`) — the literal
  codification (e.g. `blocks` is `todo→todo` only; `part_of`/`elaborates` target `theme`/`concept`);
- bounds the "artistic" surface: node **color is derived from kind**, **emoji** is validated against a
  curated per-kind allow-list (`MIND_MAP_NODE_KIND_CONFIG`), both with safe fallbacks;
- de-dupes nodes by **normalized label** so re-processing merges instead of duplicating.

It is **pure** (no DB, no `Date.now`, no randomness) and **unit-tested** (`mindmap-extraction.test.ts`,
22 tests). If you change the taxonomy or matrix, change it here + the config in `mindmap-types.ts` and
add a test. NEVER move validation into the AI prompt and trust it — the prompt is a hint, the sanitizer
is the guarantee. (Same philosophy as `src/server/agent/reference-validator.ts`.)

## Data model (placement-projection, like DeepWorkNode/SpatialEntity)

- **`JournalEntry`** — rich-text (HTML) `content` + derived `plainText` (the AI/search text), tied to a
  day via `entryDate` (multiple per day). `processedAt` = last sync into the map.
- **`MindMapScene`** — ONE per session (`@unique sessionId`), holds the persisted viewport
  (`zoom/panX/panY`, like `DeepWorkBoard`).
- **`MindMapNode`** — an extracted concept. Position/size/`pinned` live here; the *meaning* is
  `label`+`kind`. `normalizedLabel` is `@@unique` per scene (the dedupe key). `pinned=true` once the
  user drags it → **re-processing never moves a pinned node** (that's how persistent-layout + re-sync
  coexist). `refId` is reserved for linking a `todo` node to a canonical `Task` (not wired yet — see
  Future).
- **`MindMapEdge`** — a **STORED** codified relationship. This is a deliberate departure from the
  "edges are derived" rule (spatial/deep-work derive edges from `dependsOn`/`EndeavorDependency`);
  mind-map relationships are AI-extracted with **no canonical source elsewhere**, so they must persist.

## Re-sync semantics (`mindmap.processEntry`)

Additive/idempotent merge, wrapped in `$transaction` (the AI call happens OUTSIDE the tx):
1. load entry + existing scene nodes; 2. AI extract; 3. `sanitizeMindMapExtraction`;
4. nodes matched by `normalizedLabel` → **update summary/provenance only** (keep position/pinned/kind);
new nodes → auto-placed by the pure **`placeNewNodes`** (deterministic golden-angle spiral, collision-
avoiding); 5. edges upserted on the `(scene, source, target, type)` unique; 6. `processedAt` stamped.
Processing never deletes user-arranged nodes; deletion is explicit (`deleteNode`/`deleteEdge`).

## Where things live

```
src/shared/mindmap-types.ts        # interfaces + codified config (kind color/emoji palette,
                                    #   relationship matrix + display colors), defaults
src/shared/mindmap-extraction.ts   # PURE trust boundary: normalize, validate, matrix, sanitize, place
src/shared/mindmap-extraction.test.ts   # 22 tests — the anti-hallucination guarantees
src/shared/ai-service.ts           # extractMindMapFromJournal (one-shot, injects taxonomy+matrix)
src/shared/enums.ts                # MindMapNodeKind, MindMapRelationshipType, JournalViewMode,
                                    #   ViewType.Journal, GraphNodeType.MindMapConcept
src/server/router/mindmap.ts       # tRPC: journal CRUD + scene/viewport/node persistence +
                                    #   manual createEdge (same matrix) + processEntry (the merge)
src/renderer/store/useJournalStore.ts        # Zustand; reaches the router via getDatabase().getApiClient()
src/renderer/components/journal/              # JournalView (mode toggle), JournalCalendarView,
                                              #   JournalEntryEditor, RichTextEditor, MindMapSceneView,
                                              #   nodes/MindMapConceptNode, journal.css
```

## Conventions / gotchas learned here

- **Renderer → new router with no bespoke logic:** use `getDatabase().getApiClient().<router>.*`
  (added `TrpcDatabaseService.getApiClient()` — one getter beats a dozen wrapper methods; the router is
  already typed in `AppRouter`). The journal store derives its row types from the client
  (`Awaited<ReturnType<ApiClient['mindmap']['getScene']['query']>>`) to avoid enum-vs-string drift at
  the boundary.
- **Infinite-zoom canvas = ReactFlow**, mirrored from `DeepWorkCanvas` (store→rf via
  `useNodesState`+`useEffect` sync; `onNodeDragStop`→persist; `onMoveEnd`→`saveViewport`). No new dep.
- **Rich text = zero-dep `contenteditable` + `document.execCommand`** (deprecated but works in
  Electron/Chromium). Toolbar buttons `onMouseDown preventDefault` to keep the editor's selection.
  Content is a plain HTML string → swappable for TipTap/Lexical later with no schema change.
- **Migration** via `mcp__database__safe_migrate` (auto-backup). `backups/*.sql` is gitignored — never
  stage it (committed DB dumps are a known incident on this repo).
- Adding a node kind / relationship type = one enum value + one `MIND_MAP_*_CONFIG` row (+ matrix
  entry) + a test. Growth is additive.

## Future (not yet built)

- **Promote `todo` nodes to real `Task`s** via `MindMapNode.refId` (ties the journal into the
  planning↔execution loop). The column + null handling already exist.
- **Relationship-type picker** on manual edge draw (currently defaults to the always-legal
  `relates_to`).
- **Router-level tests** for `processEntry` merge (needs an AI mock + test DB, à la
  `spatialScene.test.ts`); the pure trust boundary is already fully covered.
- **Constrained AI image generation** for node art (the spec's "maybe") — emoji symbols ship now.
</content>
