---
name: threejs-aaa-graphics-builder
description: "Upgrade Three.js games from prototype visuals to premium browser graphics: art-direction critique, procedural model building, material and texture libraries, world prop kits, shaders, VFX, lighting and render pipeline, LOD and instancing, render budgets, and a 10-category visual scorecard. Use when screenshots still look basic or the user asks for premium, AAA, high-fidelity, showcase, or less-basic graphics."
---

# Three.js AAA Graphics Builder

Own the production graphics pass: turn basic screenshots into authored, high-density, performance-aware visuals.

## References

| File | Read it when |
| --- | --- |
| `references/visual-scorecard.md` | scoring visuals or making any premium/AAA/showcase claim |
| `references/authoring-recipes.md` | building hero, obstacle, reward, world-kit, or prop models; changing lighting, tone mapping, shadows, fog, post, or graphics architecture |
| `references/technical-art.md` | render budgets, material kits, VFX systems, instancing/LOD, imported asset cleanup, anything that could affect browser performance |
| `references/shader-cookbook.md` | custom shaders, `onBeforeCompile`, skies, or post-processing; use recipes as design starting points and verify them against the project's Three.js version |

For a broad "still looks basic" or premium pass, select relevant references before implementing. A narrow graphics edit loads only its relevant references and checks; the requested style and scope override recipe defaults.

## Core rule

Glow does not make primitives look AAA. Build authored forms first, then materials, then lighting, then effects — in that order.

## Workflow

1. Capture or inspect active-play screenshots on the target viewports when a playable scene exists.
2. For an existing game, score the affected views and pick the weakest surfaces. For a new game, establish art direction, camera scale, material roles, and the hero target first; do not invent a before screenshot.
3. Improve the relevant forms, materials, world detail, effects, and lighting using existing project ownership; add structure only where needed.
4. Choose a source per high-value surface: procedural Three.js, a `threejs-image-generator` reference or texture, a `threejs-3d-generator` model, or an image-to-3D hybrid chain. Use external generation only through an authorized available managed tool.
   Inspect the concept/model before dependent generation or rigging. Finish one representative playable scene with actual assets and feedback before expanding the content kit.
5. Upgrade every weak visible surface, not only the hero: hazards, rewards, ground and track, foreground props, background layers, telegraphs, material variation, state VFX.
6. Add lighting, tone mapping, and render polish once authored forms exist.
7. Add event-driven VFX tied to gameplay state.
8. Re-score against the calibration anchors, citing available observations and measurements. Prioritize relevant weaknesses within scope and report unmet targets.

## Asset sourcing

Choose existing licensed assets, supplied files, project-native art, or authorized managed tools. No provider or credential is required. Inspect animation as well as silhouette at gameplay scale.

## Report

Score before and after with one line of evidence per category, the surfaces you upgraded, files changed, screenshots, renderer diagnostics against the budget table, generated asset paths and task IDs, and what is still weak. Include imported-asset diagnostics (scale, bounds, collision proxy, clips) when generated 3D was used.

## Use boundaries

This skill is written guidance. No bundled code, command execution, installation, credentials, or external service is required. Planning and review can produce recommendations from the supplied brief and artifacts. Project implementation and existing tools apply only within the user's requested work and execution permissions.

Do not source shell profiles, search for secrets, change machine configuration, execute downloaded content, or bypass permission controls. Skill invocation does not authorize paid jobs, uploads, publishing, deployment, or destructive overwrites. Use an available managed tool only when its action, data transfer, and cost are authorized. Otherwise provide a local alternative or written handoff. Stop on authentication, permission, or budget failures; reconcile uncertain submissions before any replacement.
