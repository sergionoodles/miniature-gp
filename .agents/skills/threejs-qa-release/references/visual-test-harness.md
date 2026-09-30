# Visual Comparisons and Motion Review

Protect important UI and gameplay views with available screenshots and manual comparisons. A new harness or executable template is not required. Existing visual tests can supplement a review within task permissions.

Use existing baselines when the view is valuable and deterministic enough to compare. Defer exact pixel comparisons for uncontrolled randomness or effects whose masking would hide the acceptance criteria. A narrow change needs its affected state, not unrelated release coverage.

For existing Playwright suites, allow verified dev-server reuse outside CI (`reuseExistingServer: !process.env.CI`), while keeping CI startup isolated. If only Chromium is installed, pair mobile device settings with `browserName: 'chromium'` instead of implicitly requiring WebKit. Chromium mobile emulation does not establish Safari or real-device coverage.

Select relevant views: active play, affected pause/settings/failure states, hero visibility, and supported mobile layouts. Menu captures suffice only for menu changes. Keep viewport, camera, lighting, build, and state comparable. Wait for visible fonts/assets to settle; note animation or randomness that prevents exact comparison. Do not hide the surface being evaluated.

For supplied/imported assets inspect scale, orientation, bounds, materials, actual gameplay visibility, and collision footprint. A loaded path alone cannot prove visibility.

For animation inspect a short unpaused recording or actual play covering a full relevant motion cycle, start/stop, transitions, and attack/contact/recovery where present. Check frozen rigs, stretching/collapse, foot sliding, double-applied root motion, snapping, and contact timing. A still pose is insufficient. Use existing recording tools only when available and authorized; otherwise mark motion untested.

Record state, viewport/device, revision, real capture paths, observations, and uncertainty. Use the director's [evidence record](../../threejs-game-director/references/evidence-manifest.md) for freshness and coverage. Do not replace a baseline merely to conceal a regression.
