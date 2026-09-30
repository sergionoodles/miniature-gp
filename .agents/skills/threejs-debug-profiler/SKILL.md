---
name: threejs-debug-profiler
description: "Debug and profile Three.js browser games: blank canvases, render and runtime bugs, asset and audio loading, animation, resize, mobile input, plus performance profiling of draw calls, triangles, textures, memory, shader and post-processing cost, and bundle size."
---

# Three.js Debug Profiler

Find root causes and optimize measured bottlenecks without breaking playability.

Follow the changed behavior's scope. Reuse the lead's existing reproduction and evidence; verify the affected path after a fix. A passing focused check only needs broader testing when shared behavior changed or an unresolved risk warrants it. Return measurements and defects to the lead for the consolidated verification pass.

## Reference

`references/debug-playbook.md` — ordered triage for blank canvas, asset and audio loading, loop/animation/physics, input and mobile, the profiling sequence, and useful renderer diagnostics. Read it when debugging or profiling anything non-obvious.

## Debug

Reproduce first with an available build at the same URL/state and read console, page, and network errors. Otherwise review supplied evidence and identify the reproduction gap. Find the module that owns the failure, fix the root cause there, and retest the exact broken path. The playbook holds the triage order and common causes, including duplicate loops, canvas sizing, and wrong delta units.

## Profile

Use an available production preview when user-facing performance matters; follow project permissions before creating a production build. Baseline one fixed scenario, classify the bottleneck, change one thing, and re-measure the same scenario while confirming visuals and playability held. The playbook lists the metrics and optimizations; disclose when the available build mode limits the conclusion.

## Report

Lead with the root cause or the measured bottleneck. Then files changed, baseline and post metrics, commands, screenshots, the broken path retested, and residual risks.

## Use boundaries

This skill is written guidance. No bundled code, command execution, installation, credentials, or external service is required. Planning and review can produce recommendations from the supplied brief and artifacts. Project implementation and existing tools apply only within the user's requested work and execution permissions.

Do not source shell profiles, search for secrets, change machine configuration, execute downloaded content, or bypass permission controls. Skill invocation does not authorize paid jobs, uploads, publishing, deployment, or destructive overwrites. Use an available managed tool only when its action, data transfer, and cost are authorized. Otherwise provide a local alternative or written handoff. Stop on authentication, permission, or budget failures; reconcile uncertain submissions before any replacement.
