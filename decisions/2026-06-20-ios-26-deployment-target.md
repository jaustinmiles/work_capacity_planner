# iOS deployment target → 26.0 for the mobile revamp

**Date:** 2026-06-20
**Status:** Decided

## Context

The iOS app revamp (see [[project-ios-revamp]] / `.claude/rules/ios-development-guidelines.md`) is
directed to adopt the "latest iOS" look — iOS 26's Liquid Glass design language and the 2025
SwiftUI/Speech/Foundation-Models APIs. The project's current `project.yml` pins
`deploymentTarget.iOS: "18.0"`, Swift 5.9, `xcodeVersion: "16.0"`. The build machine has
**Xcode 26.3 / iOS 26.2 SDK** (verified via `xcodebuild -showsdks`), so the iOS-26 APIs are
compilable here. Many signature techniques (`glassEffect`, `GlassEffectContainer`,
`tabViewBottomAccessory`, `tabBarMinimizeBehavior`, `searchToolbarBehavior`, `scrollEdgeEffectStyle`,
`SnippetIntent` confirm-without-opening, `SpeechAnalyzer`/`SpeechTranscriber`, on-device
`SystemLanguageModel`) are **iOS 26.0-only**.

## Options

1. **Keep deploy target 18.0, gate every iOS-26 API behind `if #available(iOS 26.0, *)` with iOS-18
   fallbacks.** Preserves iOS 18–25 users. Cost: pervasive availability branching, dual visual paths to
   build/test, and the headline "latest iOS feel" gets diluted by fallbacks everywhere.
2. **Bump deploy target to 26.0.** iOS-26 APIs usable without gates in app code; the modern look is the
   only path. Cost: drops iOS 18–25 devices.
3. **Bump to 26.0 but keep gates on code shared into extensions** (Widget/Control) whose own minimums
   may differ, and on any helper we might want to lower later.

## Decision

**Option 3.** Bump `project.yml` `deploymentTarget.iOS` to `26.0` (and align `SWIFT_VERSION` to 6.x /
Approachable Concurrency where the toolchain supports it). Use iOS-26 APIs directly in the main app
target. Still gate (a) anything compiled into a WidgetKit/Control extension with a different minimum,
and (b) genuinely portable helpers, with the standard `.ultraThinMaterial` fallback for custom glass as
cheap insurance.

## Tradeoffs

- **Gain:** clean, modern codebase with no availability soup; the full Liquid Glass + 2025 API surface;
  faster, more coherent build.
- **Lose:** iOS 18–25 support. Acceptable because (a) the user explicitly asked for "latest iOS," (b)
  this is a personal/primary-user productivity tool, not a mass-market app with a long tail of old
  devices, and (c) the desktop/Vision Pro surfaces remain the primary planning clients.

## Reversibility

**High.** The deploy target is one line in `project.yml`. If iOS 18 support is later required, re-pin to
18.0 and wrap the iOS-26 call sites in `if #available` — the playbook already records each API's exact
minimum version, so the audit is mechanical. The temporary `UIDesignRequiresCompatibility` opt-out also
exists as a migration aid (Apple frames it as short-term only).
