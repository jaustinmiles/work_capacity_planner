# Spatial scene: "link without combining" and workflow pop-out

Date: 2026-06-02
Status: Decided (defer with documented approach)

## Context

The visionOS spatial scene (milestone 1) now supports: type panels, movable
persistent nodes, edit form, create (task/note), derived edges, and **connect →
merge** (two nodes become a workflow via the shared morph engine). Two requested
behaviors remain, and both hit genuine forks that shouldn't be guessed:

1. **Link workflows without combining** (Phase 3b) — the endeavor-style gesture.
2. **Workflow graph pop-out** (Phase 4) — tap a workflow to show its step graph
   "separately" as a movable unit.

## Problem 1 — Link without combining

"Link" must create an `EndeavorDependency` (pure metadata; workflows stay
separate). But `endeavor.addDependency` requires:
- an `endeavorId` to host the dependency, and
- a `blockingStepId` (the blocker must be a **step**, not a whole task).

The spatial scene has no endeavor concept, and a "link two workflows" gesture is
ambiguous: which step of the blocking workflow blocks? what endeavor hosts it?
The deep-work morph's `CrossWorkflow` path already returns a `crossWorkflowDependency`
with `endeavorId: ''` that `executeMorphResult` never applied — so this is an
existing server gap, not just a client one.

### Options
- **A. Session "spatial links" endeavor (recommended).** On first link, ensure a
  per-session endeavor (e.g. name "Spatial Links"), add both workflows as items,
  and create the dependency using the blocking workflow's **last step** (or the
  tapped step if a step node was the source) as `blockingStepId`. Self-contained;
  reuses `endeavor.addItem` + `addDependency`. New `spatialScene.linkWorkflows`
  procedure resolves/creates the endeavor and the blocking step.
- **B. Require explicit endeavor selection.** UI asks which endeavor hosts the
  link (and surfaces endeavor membership in the scene). More faithful to the
  desktop model, but needs endeavor browsing/membership UI in the Vision app.
- **C. Step-to-step only.** Only allow linking when both nodes are step nodes
  (so `blockingStepId`/`blockedStepId` are unambiguous), still needing a host
  endeavor (A or B).

### Decision
Defer to a dedicated increment; implement **A** when picked up. It needs a small
backend procedure (`linkWorkflows`) plus a client "link mode" mirroring the
existing connect mode. Deferred because it adds endeavor infrastructure beyond
milestone 1's "visualize + create + manage" scope, and a wrong default writes bad
dependency data.

## Problem 2 — Workflow pop-out

Today, connect-merge leaves the two member steps **inline** as step nodes (like the
deep-work board) — there is no single collapsed "workflow node" to tap-and-expand.
The pop-out request implies the endeavor model: a workflow shown as one unit that
expands into its step graph.

### Options
- **A. Collapsed workflowVolume with expand (recommended).** Represent a workflow
  as one `workflowVolume` entity; tapping it spawns child `stepNode` entities
  (`parentId` = volume) laid out by topological level, with intra-workflow edges,
  movable as a unit (`batchUpdateEntityTransforms`). Requires choosing, at merge
  time, to collapse member steps into the volume rather than leaving them inline.
- **B. Inline-only (current).** Keep steps inline; "pop-out" becomes "frame/group"
  the existing step nodes. Simpler, but doesn't match the "separate, movable graph"
  ask.

### Decision
Defer; implement **A**. It reshapes how connect-merge renders results (collapse vs
inline) and adds layout math, so it belongs in its own increment with Simulator
iteration. `SpatialEntityKind.workflowVolume` + `parentId` already exist in the
schema for exactly this.

## Reversibility
Both are additive and reversible: no schema migration needed for the chosen
approaches beyond what already exists (`workflowVolume`, `parentId`, endeavor
models). `linkWorkflows` would be a new procedure; the morph engine and entity
model are untouched.
