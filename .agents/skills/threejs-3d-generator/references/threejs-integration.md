# Three.js Asset Intake

Prefer GLB/PBR for browser models and FBX when an existing animation pipeline requires it. Inspect supplied assets in an available viewer before recommending integration; no loader sample or conversion script is required.

Check file size, triangles, mesh/material/texture counts, texture dimensions, scale, pivot, forward/up orientation, bounds, and materials under actual game lighting. Keep collision proxies simpler and separate from visual detail. Share repeated resources and use lower-detail variants where camera distance permits.

For animated assets check clip names/durations, bound skeleton, transitions, deformation, root motion, and feet/contact timing. Clip names or order can be ambiguous; identify actions by previewing them. Decide whether displacement belongs to the animation or gameplay to avoid double movement. Preserve vertical motion for jumps and source animation tracks; broad track deletion can break skinning.

When implementation is requested, use the project's existing loader and animation ownership. Recommend lower geometry/texture budgets, simpler materials, or LOD based on measured costs rather than automatic regeneration. Inspect after integration at gameplay camera distance on supported devices.

Report actual paths, known generation settings/task IDs if applicable, intake findings, observed runtime behavior, available renderer measurements, and untested conditions. No provider account is needed for these checks.
