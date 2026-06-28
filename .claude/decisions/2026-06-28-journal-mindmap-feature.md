# Journal / Mind Map feature — architecture decisions

Date: 2026-06-28
Status: Accepted (proceeding)
Scope: New top-level "Journal" surface — rich-text journaling tied to calendar days, plus an
AI-processed, artistic, infinite-zoom mind-map "scene" view with codified (non-hallucinated)
relationships and a persistent layout.

## Context

The user wants:
- A journal tab with **two views**: a **calendar/list** view (entries tied to the day they were
  written; multiple entries per day; days revisitable) and a **scene** view (one canvas for all
  entries).
- Rich-text editing (simplified Google-Docs: titles, headings, basic formatting).
- After finishing an entry, **"Process"** it: AI extracts themes, todos, and concepts and places them
  on an **infinite-scroll/infinite-zoom** artistic canvas, with **relationships** between them.
- **Hard requirement:** the app *codifies* the allowed relationships so **the AI cannot hallucinate
  outside of them**.
- **Hard requirement:** the mind-map layout is **persistent**; revisiting/editing a day re-syncs the
  map without destroying the user's arrangement.
- **Preference:** artistic — symbols, colors, visual elements — not a dry node/edge graph.

## Decisions

### D1 — Mind-map edges are STORED, not derived
Elsewhere (spatial scene, deep-work board) edges are *derived* from `TaskStep.dependsOn` /
`EndeavorDependency` because a canonical source exists. Mind-map relationships are AI-extracted
semantic links with **no canonical source elsewhere**, so they must be persisted. New `MindMapEdge`
table. (This is a deliberate, documented departure from the "edges are derived" rule, which was
specific to task-dependency edges.)

### D2 — Placement-projection pattern for persistent layout
`MindMapNode` mirrors `DeepWorkNode`/`SpatialEntity`: it stores `positionX/Y`, `width/height`, and a
`pinned` flag, separate from the extracted content. `MindMapScene` (one per session, like
`SpatialScene`) holds the viewport (`zoom/panX/panY`, like `DeepWorkBoard`). Re-processing **never**
moves a `pinned` node — that is how "persistent layout + re-sync" coexist.

### D3 — One-shot extraction, NOT the multi-turn agent
Journal "processing" is a single text→structured-data transform. It reuses the `AIService`
one-shot pattern (`extractTasksFromBrainstorm`), not the SSE agent loop. New method
`extractMindMapFromJournal(text, existingNodes)`.

### D4 — The anti-hallucination guarantee = a pure server-side sanitizer + a relationship matrix
Mirroring `reference-validator.ts` (the trust boundary), the AI output is **never trusted**. A pure,
unit-tested `sanitizeMindMapExtraction()` (in `src/shared/mindmap-extraction.ts`):
- drops nodes whose `kind` ∉ `MindMapNodeKind`;
- drops edges whose `relationshipType` ∉ `MindMapRelationshipType`;
- drops edges whose endpoints don't resolve to a real node (existing-in-scene or new-in-batch);
- **drops edges that violate the codified relationship matrix** (e.g. `blocks` is legal only
  `todo→todo`; `part_of`/`elaborates` may only target a `theme`/`concept`). The matrix
  (`isRelationshipAllowed`) is the literal codification the spec demands.
- de-dupes nodes by a normalized label (so re-processing merges instead of duplicating);
- bounds the "artistic" surface: node **color is derived from kind** (fixed palette), and **emoji is
  validated against a curated per-kind allow-list** with a safe fallback. Colorful + symbolic, but
  bounded — the AI can't invent arbitrary visuals either.

### D5 — Re-sync semantics (merge, never clobber)
`processEntry` is additive/idempotent: nodes are matched by normalized label; existing nodes keep
their position + `pinned` state and only refresh their summary; genuinely new nodes are auto-placed
in open space (pure `placeNewNodes`). Edges de-dupe on `(scene, source, target, type)`. Processing an
entry never deletes nodes the user has arranged. Manual curation (delete node/edge) is explicit.

### D6 — Rich text = zero-dependency `contenteditable` + HTML, with a `plainText` projection
CLAUDE.md discourages new deps. A lightweight `contenteditable` editor with a formatting toolbar
(headings/bold/italic/lists) stores **HTML** in `JournalEntry.content`; a derived `plainText` column
feeds AI processing + search. Tradeoff: relies on `document.execCommand` (functional in
Electron/Chromium, though deprecated). Reversible — swappable for TipTap/Lexical later without a
schema change (content stays a string). Chose simpler + reversible over adding a heavy editor dep.

### D7 — Reuse ReactFlow for the scene canvas
ReactFlow `^11.x` already powers `DeepWorkCanvas` (infinite pan/zoom, draggable nodes, viewport
persistence, minimap). The mind map extends it with custom artistic node/edge renderers + the type
color/emoji utilities (`getTypeColor`, etc.). No new canvas dependency.

## Codified taxonomy (the closed sets)

`MindMapNodeKind`: theme · concept · todo · question · feeling · person
`MindMapRelationshipType`: relates_to · leads_to · part_of · blocks · contradicts · elaborates

Relationship matrix (allowed source-kind → target-kind):
- `relates_to`, `leads_to`: any → any
- `part_of`: any → {theme, concept}
- `elaborates`: {theme, concept, question} → {theme, concept}
- `contradicts`: {theme, concept, feeling, question} ↔ {theme, concept, feeling, question}
- `blocks`: todo → todo  (mirrors the app's actual dependency model)

## Tradeoffs / reversibility

- Stored edges (D1) add a table but are required; reversible via migration.
- The relationship matrix (D4) is conservative; widening it later is a one-line table edit + test.
- `contenteditable` (D6) is the main reversible bet; content is a plain string so the editor is
  swappable.

## Phasing (each phase independently verifiable + committed)

1. **Backend foundation** (this commit): Prisma models + migration, enums, `mindmap-types.ts` +
   pure `mindmap-extraction.ts` (the sanitizer/matrix/placement), `AIService.extractMindMapFromJournal`,
   `mindmap` tRPC router + registration, Vitest for the pure logic. Full verify chain green.
2. **Frontend journal**: store, Journal tab, calendar/list view, rich-text editor (create/edit/delete).
3. **Frontend scene**: ReactFlow artistic canvas, custom node/edge renderers, "Process" action,
   drag/viewport persistence.
</content>
</invoke>
