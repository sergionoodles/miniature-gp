# Evidence Record

A plain written record is sufficient. Before reviewing, identify the changed behavior, current project revision, relevant states, and supported viewports. Use screenshots, recordings, browser observations, or existing reports that are actually available.

For each check record state, viewport/device, capture or observation date, revision/build if known, artifact path if real, observed result, and any limitation. Re-open linked artifacts to confirm they exist, show the claimed state, and belong to the current revision. Do not relabel historical evidence or omit a failed capture to imply complete coverage.

Reach states through actual controls where possible. A label or acknowledged test hook is not proof that the state was applied. For still comparisons record whether simulation was paused; for motion inspect unpaused sequences. No new hooks or machine-readable manifest is required.

## Efficient capture

Delegate captures to the `visual-capture` sub-agent when one is available. Brief it with the URL, each state/viewport pair and how to reach it, and what to check. Work from its text descriptions and artifact paths, and open an image yourself only when a judgment needs it (graphics scoring, a suspected rendering defect), at most one or two per pass.

Declare the relevant state/viewport pairs before the final verification pass and capture them in one browser session when existing tooling supports it. Give each pass a distinct identifier or capture directory; keep failed entries visible instead of dropping them. Limit file discovery to declared artifacts, avoiding dependency folders, build output, and historical test reports.

Prefer CSS-pixel screenshots for ordinary layout and gameplay review, retaining device-resolution captures when fine detail or rendering defects require them. For example, a 390 CSS-pixel viewport at DPR 3 need not produce a 1170-pixel-wide review image. Capture once per state and reuse that image for any needed canvas crop. This changes review image size, not the game's runtime DPR.

Wait for the required assets, fonts, and rendered state with bounded readiness checks. Continuous network activity need not block a ready scene, and an already frozen state does not need an arbitrary settle delay. Summarize each capture with result, state/viewport, error counts, relevant measurements, and artifact paths; inspect full reports only when needed. Deduplicate repeated error excerpts while preserving total error counts and access to the full log.

## Existing state hooks

When a project already provides capture hooks, await seeding and state setup, reject unsupported states, and check any returned acknowledgement against the request. Unpause before setup, then freeze simulation immediately after applying the state while rendering continues. Visual stabilization must work while paused; bound waits for hooks, fonts, and frames. Missing or no-op hooks mean the requested state is unverified. Keep motion checks unpaused and exercise actual controls separately.

Coverage establishes what was inspected, not quality. Build results, input progression, audio, collisions, and performance need separate observations. Mark unavailable checks as untested. Keep detailed evidence in the project's established reporting location when writing artifacts is requested.
