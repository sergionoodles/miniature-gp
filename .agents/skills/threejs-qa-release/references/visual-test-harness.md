# Visual Comparisons and Motion Review

Protect important UI and gameplay views with available screenshots and manual comparisons. A new harness or executable template is not required. Existing visual tests can supplement a review within task permissions.

Select relevant views: active play, affected pause/settings/failure states, hero visibility, and supported mobile layouts. Menu captures suffice only for menu changes. Keep viewport, camera, lighting, build, and state comparable. Wait for visible fonts/assets to settle; note animation or randomness that prevents exact comparison. Do not hide the surface being evaluated.

For supplied/imported assets inspect scale, orientation, bounds, materials, actual gameplay visibility, and collision footprint. A loaded path alone cannot prove visibility.

For animation inspect a short unpaused recording or actual play covering a full relevant motion cycle, start/stop, transitions, and attack/contact/recovery where present. Check frozen rigs, stretching/collapse, foot sliding, double-applied root motion, snapping, and contact timing. A still pose is insufficient. Use existing recording tools only when available and authorized; otherwise mark motion untested.

Record state, viewport/device, revision, real capture paths, observations, and uncertainty. Use the director's [evidence record](../../threejs-game-director/references/evidence-manifest.md) for freshness and coverage. Do not replace a baseline merely to conceal a regression.
