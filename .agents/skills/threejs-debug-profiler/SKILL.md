---
name: threejs-debug-profiler
description: "Debug and profile Three.js browser games: blank canvases, render and runtime bugs, asset and audio loading, animation, resize, mobile input, plus performance profiling of draw calls, triangles, textures, memory, shader and post-processing cost, and bundle size."
---

# Three.js Debug Profiler

Find root causes and optimize measured bottlenecks without breaking playability.

Follow the changed behavior's scope. Reuse the lead's existing reproduction and evidence; verify the affected path after a fix. A passing focused check only needs broader testing when shared behavior changed or an unresolved risk warrants it. Return measurements and defects to the lead for the consolidated verification pass.

## Reference

`references/debug-playbook.md` — ordered triage for blank canvas, asset and audio loading, loop/animation/physics, input and mobile, the profiling sequence, and the `__THREE_GAME_DIAGNOSTICS__` shape. Read it when debugging or profiling anything non-obvious.

## Debug

1. Reproduce with an available build at the same URL/state; otherwise review supplied evidence and identify the reproduction gap.
2. Read console, page, and network errors.
3. Check canvas display size against drawing-buffer size.
4. Check renderer, context, and loop ownership — more than one active loop is a common cause.
5. Check camera aspect, near/far, lights, materials, fog, scene contents, transforms.
6. Check asset paths, loaders, CORS, and base path.
7. Check animation delta units, physics update order and fixed timestep, collider and body ownership, input listeners, pointer and touch behavior, resize, and audio context unlock when audio is involved.
8. Fix the root cause in the module that owns it, then retest the exact broken path.

## Profile

1. Reproduce in the correct build mode — production preview when user-facing performance matters.
2. Baseline the scenario: FPS and frame time, draw calls, triangles, geometries, textures, memory, bundle.
3. Classify the bottleneck as CPU, GPU draw, GPU fragment, GPU vertex, memory, or network.
4. Change one thing — instancing, shared resources, culling, LOD, DPR cap, cheaper shadows or post, texture discipline.
5. Re-measure the same scenario and confirm visuals and playability held.

## Report

Lead with the root cause or the measured bottleneck. Then files changed, baseline and post metrics, commands, screenshots, the broken path retested, and residual risks.

## Use boundaries

This skill is written guidance. No bundled code, command execution, installation, credentials, or external service is required. Planning and review can produce recommendations from the supplied brief and artifacts. Project implementation and existing tools apply only within the user's requested work and execution permissions.

Do not source shell profiles, search for secrets, change machine configuration, execute downloaded content, or bypass permission controls. Skill invocation does not authorize paid jobs, uploads, publishing, deployment, or destructive overwrites. Use an available managed tool only when its action, data transfer, and cost are authorized. Otherwise provide a local alternative or written handoff. Stop on authentication, permission, or budget failures; reconcile uncertain submissions before any replacement.
