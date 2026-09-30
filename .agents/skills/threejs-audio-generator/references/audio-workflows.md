# Three.js Audio Workflows

Use this reference before generating or integrating audio for a game.

## Audio Planning

Create an audio matrix before generating files:

| Category | Example events | Example count | Loop? | Runtime group |
| --- | --- | ---: | --- | --- |
| UI | hover, confirm, cancel, pause, fail | 3-8 | no | ui |
| Movement | jump, dash, boost, landing, drift | 3-10 | sometimes | sfx |
| Interaction | pickup, hit, shield, score, checkpoint | 4-12 | no | sfx |
| Threat | enemy attack, warning, impact, boss cue | 4-12 | no | sfx |
| Ambience | room tone, wind, engines, crowd, weather | 1-4 | yes | ambience |
| Music | menu, gameplay, boss, win/lose stingers | optional | tracks yes, stingers no | music |
| Voice | announcer, boss, tutorial, combat barks | optional | no | voice |

Choose only the sounds needed by actual events; the table lists examples, not minimum counts.

Music and voice are optional. An explicit silent or no-music brief takes precedence over genre conventions.

## Prompting

Good prompts specify source, transient, tail, mix density, genre, and gameplay use:

Examples:

- `short shield absorb impact for sci-fi boss fight, glassy plasma hit, bright transient, low sub thump, 0.8s tail, no music, no voice`
- `looping abandoned cathedral ambience for dark fantasy arena, distant wind through stone arches, subtle torch crackle, no melody, seamless loop`
- `tiny premium menu confirm click, soft mechanical latch, warm sparkle tail, no harsh beep`

Avoid prompts that are only mood words (`epic`, `AAA`, `cool`). Name the gameplay event.

## Generation Strategy

- Generate short SFX individually instead of one long mixed file.
- Specify seamless looping deliberately; test them looping in the game.
- Avoid music inside SFX prompts unless the user asked for music.
- Keep UI sounds quieter and shorter than gameplay SFX.
- Generate variants for high-frequency events to avoid repetition.
- Normalize in the game through volume groups, not by editing every file manually during early iteration.

## Music Strategy

Describe genre, tempo (BPM), instrumentation, energy curve, and game moment. Prefer instrumental music unless vocals serve the brief; they can compete with dialogue and gameplay cues.

- Gameplay/menu loops: 30–90 seconds is a useful starting range, with steady energy and no intro, outro, or fade. A loopable prompt does not guarantee a seamless output.
- Victory, defeat, and reveal stingers: typically 3–8 seconds, played once.
- Sectioned tracks: describe intro, loop, outro, or calm/combat sections in a composition brief. Use a structured plan or seed only when the authorized provider supports it; do not assume a seed guarantees identical audio.
- Intensity variants: retain tempo, key, and instrumentation while changing energy. Check alignment before layering; independently generated tracks may work better as crossfades.
- Keep gameplay cues audible over music and duck music under dialogue or important impacts.

Listen to the seam in game before making variants. Set beat-aligned `loopStart`/`loopEnd` or crossfade sources when necessary. Do not assume a provider has a music loop flag; looping is also a runtime responsibility.

## Voice Strategy

Use TTS when the line can be generated from text and exact acting is less important.

Use voice-change when:

- A consented scratch performance is available.
- Timing, breaths, laughter, anger, fear, or delivery need to be preserved.
- A boss, announcer, narrator, or character line needs stronger acting than text prompt alone.

Assess noisy source recordings before proposing cleanup through an available authorized tool.

Do not generate or convert voices that imply impersonation of a real private person. For characters, describe a fictional voice style or use a licensed/available voice ID.

## Runtime Integration

Use existing playback ownership; consider centralized routing only when multiple sounds need shared lifecycle controls:

- Load sounds after user gesture unlock.
- Maintain groups: `master`, `sfx`, `ui`, `ambience`, `voice`, `music`.
- Expose mute and per-group volume.
- Loop ambience and music through `AudioBufferSourceNode` (`loop`, `loopStart`, `loopEnd`) or the existing library wrapper. Crossfade music with two gain-controlled sources when a hard cut is unsuitable.
- Stop/dispose old sources when restarting scenes.
- Do not trigger the same high-volume SFX every frame; add cooldowns or variant pools.
- Pause/resume audio with the game pause state and page visibility.

When implementation is requested, use the existing playback ownership and verify unlock, loading, group routing, and source cleanup. No new manager is required.

## Runtime failure modes

Ambience/music loops stacking after a pause or restart · clicks at music loop seams · music masking gameplay cues · autoplay blocked because nothing unlocked the context from a user gesture · mute or volume reaching only some groups · decode/load errors swallowed silently · mobile Safari needing its own unlock path.
