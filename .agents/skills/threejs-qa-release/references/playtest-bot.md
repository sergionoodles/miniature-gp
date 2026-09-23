# Reproducible Gameplay Playtest

A manual control sequence can establish meaningful evidence without a bot or test hooks. Choose a repeatable starting state, note the controls and approximate action timing, and repeat the same scenario after a relevant change. Use an existing seed setting if available; otherwise disclose randomness.

Observe input response, movement, objective progress, score/reward changes, stalls, reachable fail states, and retry. For pressure-based games try a deliberate mistake and confirm feedback explains failure. Games without designed fail states do not need invented ones.

A softlock means the game continues but the player cannot meaningfully move or progress. Check geometry traps, dead input after overlays, and unrecovered fail states. Exercise actual controls even when existing shortcuts prepare later encounters.

For fairness compare cautious and reckless approaches, noting telegraph visibility and recovery time. Automated action timing alone cannot prove fairness or fun.

If existing automation is already authorized, its reports can supplement observations. No templates, diagnostics globals, or new tests are required. Do not assume a headless browser uses a real GPU; identify hardware/software rendering before drawing performance conclusions. Desktop emulation is not a phone measurement.

Report starting state, controls, duration, progression/failure/retry, errors, and limitations. Do not claim exact numeric metrics without recorded measurements.
