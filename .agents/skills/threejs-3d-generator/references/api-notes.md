# Managed 3D Provider Decisions

No API client, credential setup, or specific provider is required. When an authorized managed tool is available, use its exposed capabilities and current documentation rather than reproducing a client or relying on fixed model versions.

Choose text-to-3D for a described form, image-to-3D for a specific visual reference, and an existing model for conversion or material work. Confirm output format and limits before submission. Check mesh completeness, textures, scale, and intended view before dependent work.

For animation confirm the body plan and supported rig/presets. Inspect both joint presence and complete limb chains: a riggability flag does not establish a usable rig. Retarget against the actual rig rather than the unrigged model. Map clips by observed motion, not opaque output names or presumed ordering. Preserve source files; validate any format conversion in a viewer.

Root-motion and export behavior vary by provider/version. Preview a complete motion cycle before selecting in-place versus world-displacing playback. Diagnose a corrupt bake at its source; do not remove arbitrary bone tracks to mask it. Historical provider workarounds are hypotheses to verify, not universal requirements.

Record known job IDs, settings, and real outputs without secrets or signed URLs. Use the director's [asset recovery](../../threejs-game-director/references/asset-recovery.md) for failed or uncertain jobs. Stop on authentication, permission, or budget failures. No automatic paid retries.
