# Game Feel

Tune input response and readable decisions before decorative feedback. The primary action should visibly respond promptly; inspect it through real controls when a build is available.

- Movement: acceleration, braking, turn rate, jump/dash timing, and forgiving contact behavior should fit the player promise.
- Camera: keep threats and the next decision visible; ease follow without hiding input response. Use brief bounded impulses for major events.
- Impact: combine short material/value cues, sound, local effects, and optional hitstop. Slow simulation only; the scene and UI should remain visible and responsive.
- Rewards: use a clear event cue, state/score change, and a small UI echo. Feedback should communicate what improved.
- Pacing: vary pressure and recovery; tune cooldowns and restart to invite another attempt.
- Accessibility: offer reduced shake/flashes/motion and retain shape or icon cues when color communicates state.

Effects should clarify gameplay rather than obscure hazards, collision volumes, or HUD. Avoid per-frame sound triggers, unbounded impulses, and stacked effects across restart. Reuse the existing feedback design; a new tween manager or scaffold is not required.

Record tuned values when known, input-to-feedback observations, and remaining feel issues. A written recommendation cannot establish actual latency or enjoyment.
