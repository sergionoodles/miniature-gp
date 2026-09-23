---
name: threejs-gameplay-systems
description: "Design and improve Three.js game loops, levels, controls, camera, collision, physics, and feel for new games or mechanic changes."
---

# Three.js Gameplay Systems

Make player actions produce clear decisions and consequences. Adapt to the existing project; no starter template is needed.

## Design first

For broad builds define three concise records; narrow fixes use the existing design:

- **Design brief:** player promise, intended feeling, primary/secondary verbs, repeated decisions, rewards/risks, failure/learning/retry, supported devices, and non-goals.
- **Core loop contract:** player does a verb toward an objective under pressure; success gives reward, failure gives feedback and retry. Each clause should be observable in implemented play.
- **Level plan:** camera visibility, start, first decision/threat/reward, landmarks, escalation, recovery, and hazard telegraphs. Space should shape choices.

## Implementation guidance

When implementation is requested, use existing project structure/tooling. For a new project propose the smallest suitable Three.js setup; files and dependencies follow user scope rather than an initializer. Keep input, simulation, state, camera, UI, and assets clearly owned without mandatory directories. Establish a playable encounter before expanding content. Make update order explicit, keep hot paths allocation-light, and use reproducible randomness when repeatable checks matter. Tune controls, camera, cooldowns, difficulty, and restart through actual play. Events can feed audio/VFX without duplicating game rules.

## References

- [Game feel](references/game-feel.md): impact, hitstop, feedback, and camera.
- [Genre design](references/genre-design.md): levels, encounters, and pacing.
- [Physics selection](references/physics-engine-selection.md): simulation and colliders.

## Report

Describe controls, changed behavior, design choices, observations, and untested paths. Include engine, timestep, and collider strategy when known and relevant.

## Use boundaries

This skill is written guidance. No bundled code, command execution, installation, credentials, or external service is required. Planning and review can produce recommendations from the supplied brief and artifacts. Project implementation and existing tools apply only within the user's requested work and execution permissions.

Do not source shell profiles, search for secrets, change machine configuration, execute downloaded content, or bypass permission controls. Skill invocation does not authorize paid jobs, uploads, publishing, deployment, or destructive overwrites. Use an available managed tool only when its action, data transfer, and cost are authorized. Otherwise provide a local alternative or written handoff. Stop on authentication, permission, or budget failures; reconcile uncertain submissions before any replacement.
