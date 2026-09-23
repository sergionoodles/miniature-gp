# Physics Engine Selection

Three.js is a renderer. Physics runs in a separate world at a fixed timestep; mesh transforms are synchronized from body transforms afterwards.

## The ladder

1. **Custom collision** — arcade triggers, pickups, lanes, bullets, simple overlap tests, deterministic rails, endless runners, lane dodgers, transform-driven racers, sphere/box dogfights. Anywhere authored feel matters more than simulation.
2. **Rapier** — the default for serious browser games with real physics: mini golf, pool/snooker, pinball, marble racers, physics puzzles, platformers, moving platforms, ramps and slopes, character controllers, rigid-body stacks, destructible props, high-speed bodies needing CCD, sensor-heavy games.
3. **cannon-es** — lightweight JS-only fallback for small rigid-body scenes where avoiding WASM matters and collision complexity is low.
4. **Jolt** — advanced rigid-body work where its behavior is specifically wanted and WASM integration complexity is acceptable.
5. **Ammo.js/Bullet** — only when a project already depends on it.
6. **Matter.js** — 2D only.

Rapier is a Rust/WASM engine with official JS bindings: rigid bodies, colliders, sensors, collision events, forces/impulses, damping, axis locking, sleeping, and CCD.

Never collide against detailed visual meshes. Use primitive colliders, compound colliders, convex hulls, simplified triangle meshes for fixed level geometry only, and explicit sensor volumes. Imported GLB meshes get their own collision proxies.

## Simulation decisions

Use the project's existing engine where suitable. New dependencies need a concrete gameplay benefit and task authorization; installation is not required for this review. For simulation initialize the world before bodies, use a fixed timestep with a clamped accumulator, and synchronize visual transforms in one owner. Use CCD only for measured tunneling risks. Sensors need enabled events or explicit overlap checks; confirm behavior through real movement.

## Architecture

- Physics ownership lives in `systems/PhysicsWorld` or `systems/CollisionSystem`, never in render code.
- Entities hold body handles and dispose them on restart.
- Update order: input intents → fixed physics → game state/collisions → VFX/camera/UI → render.
- Kinematic bodies for moving platforms and scripted obstacles; sensors for pickups, goals, holes, portals, checkpoints, damage zones.
- Keep a debug overlay for colliders, body counts, contact pairs, and velocity.
- Use sleeping and explicit body removal to avoid stale simulation state.

## Tuning

Tune in units that map cleanly to scene scale, with named constants. Set friction, restitution, damping, mass/density, gravity scale, and collision groups explicitly.

- Balls, mini-golf, pool, pinball: rolling friction/damping, restitution, cushion bounce, hole capture, max velocity.
- Arcade vehicles: combine kinematic control logic with collision response rather than relying on raw rigid-body simulation.
- Character controllers: capsule colliders, locked rotations, kinematic movement — unless ragdoll is actually wanted.

## Failure modes

Variable-delta physics feels nondeterministic · mesh and body drift apart because transforms are synced in two places · bodies survive a restart · detailed imported meshes make collision slow or wrong · fast projectiles tunnel without CCD · sensors fire nothing because active events are missing · kinematic platforms move visually but not physically.

Report engine used, body/collider counts, timestep, CCD bodies, sensors, and collision groups when physics is in scope.
