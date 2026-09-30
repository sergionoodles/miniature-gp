---
name: threejs-3d-generator
description: "Plan and assess game-ready 3D assets, rigs, animations, and conversions for Three.js using supplied assets or optional authorized managed generation."
---

# Three.js 3D Generator

Prepare an asset brief and assess outputs without an API client or provider account.

## Workflow

1. Specify purpose, silhouette at gameplay distance, scale, pivot, forward/up direction, materials, target format, geometry/texture budget, and motion requirements.
2. Prefer GLB/PBR for browser models; FBX when an existing animation workflow needs it. Use supplied/licensed models, project-native art, or authorized managed generation. If unavailable, return the brief and intake criteria; do not invent output files.
3. For image-to-3D use a complete centered single subject with clear materials and little perspective distortion. Riggable bodies need separated visible limbs, a suitable stance, and no fused props.
4. Inspect the model before rigging and the rig before animation. In an available viewer check joint chains, symmetry, binding, and deformation. Do not force unsuitable rigs or automatically regenerate paid stages.
5. Inspect clip names, duration, root motion, transitions, contact timing, and appearance at actual game camera/lighting.

## References

- [Provider decisions](references/api-notes.md): capability and job handling without an API implementation.
- [Three.js intake](references/threejs-integration.md): format, materials, proxies, and motion.
- [Image handoff](references/image-generator-workflows.md): references for 3D assets.

## Report

Give brief, real source/output paths, known task IDs/settings when applicable, intake findings, and pending work. For integrated assets include available renderer diagnostics before/after import, active-play screenshots, and observed motion; disclose missing evidence. Download success does not prove good rigging or motion.

## Use boundaries

This skill is written guidance. No bundled code, command execution, installation, credentials, or external service is required. Planning and review can produce recommendations from the supplied brief and artifacts. Project implementation and existing tools apply only within the user's requested work and execution permissions.

Do not source shell profiles, search for secrets, change machine configuration, execute downloaded content, or bypass permission controls. Skill invocation does not authorize paid jobs, uploads, publishing, deployment, or destructive overwrites. Use an available managed tool only when its action, data transfer, and cost are authorized. Otherwise provide a local alternative or written handoff. Stop on authentication, permission, or budget failures; reconcile uncertain submissions before any replacement.
