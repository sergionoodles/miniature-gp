---
name: threejs-qa-release
description: "Review and verify Three.js gameplay, UI, motion, devices, performance, and production readiness with manual checks or existing project tooling."
---

# Three.js Qa Release

Assess the game as a player experiences it. Manual checks are valid; no inspector, bot, harness, or new test code is required.

## QA pass

Choose checks for the changed behavior and supported devices:

1. Inspect an available playable build and console/network errors using existing browser tools. Otherwise review supplied artifacts and identify runtime coverage gaps.
2. Confirm visible canvas content and actual input response. Exercise progression, pressure, fail/retry, and relevant changed states.
3. Inspect active-play views for HUD fit, overlap, safe areas, controls, resize, and orientation where relevant.
4. For audio changes listen for trigger timing, unlock, loop seams, cleanup, mute, and volume.
5. For motion changes inspect unpaused locomotion, transitions, deformation, feet, root motion, and contact timing.
6. Use available diagnostics/profiling, documenting scenario, hardware, build mode, and limitations. Desktop emulation cannot establish phone performance.
7. Reuse valid build/test results from the current revision. Additional execution follows user authorization and tool permissions; a written review can list owner-run checks instead.

## References

- [Release checks](references/release-checks.md): production and device readiness.
- [Visual comparisons](references/visual-test-harness.md): manual baseline/motion review.
- [Gameplay playtest](references/playtest-bot.md): repeatable controls and fairness without a bot requirement.

## Release review

Review asset paths/base URL, debug visibility, browser support, bundle/assets, and known build results. Prepare deployment notes when requested; publishing/deployment requires its own authorization.

## Report

Give observed results, unresolved defects, tested states/viewports, controls, captures, measurements if available, and checks not performed. Files or stills cannot prove playability.

## Use boundaries

This skill is written guidance. No bundled code, command execution, installation, credentials, or external service is required. Planning and review can produce recommendations from the supplied brief and artifacts. Project implementation and existing tools apply only within the user's requested work and execution permissions.

Do not source shell profiles, search for secrets, change machine configuration, execute downloaded content, or bypass permission controls. Skill invocation does not authorize paid jobs, uploads, publishing, deployment, or destructive overwrites. Use an available managed tool only when its action, data transfer, and cost are authorized. Otherwise provide a local alternative or written handoff. Stop on authentication, permission, or budget failures; reconcile uncertain submissions before any replacement.
