# Shader and Render Design Patterns

These are visual design choices, not executable recipes or claims of tested compatibility. Use existing project capabilities when implementation is requested; no custom shader is required.

| Surface/event | Desired read | Main cost or failure risk |
| --- | --- | --- |
| Shield | clear rim and local impact ripple | transparency overdraw; threats obscured |
| Hologram | readable silhouette with subtle scan/flicker | excessive noise or illegible labels |
| Water/glass | controlled reflection/refraction and surface variation | transmission cost and smeared hazards |
| Energy core | concentrated authored emissive detail | bloom washes out form |
| Heat/damage | local change tied to actual state | hue-only cue or persistent flashing |
| Spawn/dissolve | distinct anticipation and arrival/departure | effect hides collision timing |
| Trails | indicate direction, speed, or attack reach | overdraw and lingering clutter |
| Contact shadow | grounds important objects | floating placement or excessive shadow cost |

Start with authored forms and shared materials. Use standard material features before custom shaders. Establish color-space/tone-mapping consistency, then tune exposure and selective bloom under active gameplay. Compare effects on/off to verify their purpose and cost. Reduce DPR, shadow work, and post passes when measurements justify it.

Keep danger/reward/player separation by shape and value as well as color. Avoid sustained strobe and provide reduced-motion alternatives. Report observed appearance, available measurements, device limits, and unknown compatibility.
