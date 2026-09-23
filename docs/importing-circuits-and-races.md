# Importing a circuit and race replay

Use this guide when adding a circuit or a race to Grand Prix Atlas. Keep the circuit reference material, race metadata, replay file, renderer, and race picker in sync.

## Before changing files

For a new circuit, get both images from the user before authoring the circuit:

1. **Track map:** a clear top-down layout of the full circuit. The start/finish line and direction should be visible if available.
2. **Aerial image:** a top-down view showing the circuit and enough of the venue around it to guide terrain and scenery.

Ask for the missing image if either is absent. Do not replace user-supplied references with generated or web-sourced images. Keep the original files; use the track map to check the route and use the aerial image to guide the surroundings. Save supplied references under `assets/circuits/<circuit-slug>/references/`, preserving their file extensions. These are authoring references: the current renderer does not load them at runtime.

Images do not replace race telemetry. The replay's GPS coordinates supply the circuit path and car movement. The renderer in `src/circuitWorld.ts` projects that path into Three.js and builds terrain and scenery procedurally.

## Add a circuit

1. Choose a stable lowercase slug, such as `silverstone`, and the display name used in the race picker, such as `Silverstone` or `Circuit Zandvoort`.
2. Add the user's two reference images under `assets/circuits/<slug>/references/`.
3. Obtain a replay with GPS coordinates for that circuit. Prefer a clean lap from the race session being imported. If the circuit must be added before race data is available, trace a centerline from the supplied track map into the replay's `track` coordinate format; do not invent geometry without checking it against the map.
4. Check that the replay's `track` is a continuous loop, faces the correct direction, and places the start/finish point correctly. `src/circuitGeometry.ts` centers and scales it; `src/circuitWorld.ts` uses it for the track, terrain, and procedural scenery.
5. Add the circuit's race entry in `src/App.tsx` and pass its display name to `TrackScene`. The renderer currently has a Zandvoort-specific coastal terrain style in `src/circuitWorld.ts`; update that condition if the new circuit needs a different environment treatment. Keep circuit-specific scene details tied to the circuit rather than hard-coded coordinates that could appear at another venue.
6. Open the app and inspect the circuit from the default and top views. Check the image references against the route and scenery, then adjust the projection or scene details if the circuit is distorted, clipped, or misplaced.

## Import a race

Use the requested **year**, **country**, and **session type** to identify the event. For a Grand Prix replay, use the `Race` session, not practice, qualifying, or sprint. Confirm the event and final classification against an authoritative race result.

### Find the OpenF1 session

OpenF1 provides historical session, timing, location, position, pit, weather, race-control, and stint data through its REST API. See the [OpenF1 API documentation](https://openf1.org/docs/).

Look up the session with the requested year and country, for example:

```text
https://api.openf1.org/v1/sessions?year=2026&country_name=Netherlands&session_name=Race
```

Check that the response identifies the expected event and contains exactly one matching race session. Record its `session_key`, circuit name, date, and `gmt_offset`. Do not guess a session key from the event order.

### Generate the replay file

The current importer is `scripts/build_monza_replay.py`. Its `RACES` mapping associates a slug with `(session_key, track_driver, track_lap_number)`. Add the new race there, using a driver and lap with a complete, representative GPS trace for the circuit. The output path is currently hard-coded to a 2026 filename; update the importer to use the requested year when adding a race from another season.

Run the importer with the registered slug:

```bash
python scripts/build_monza_replay.py --race <slug>
```

The importer downloads the session data and writes a compact replay JSON file under `public/data/`. It samples each driver's GPS locations once per second, preserves race-relative timestamps, and omits `(0, 0)` fixes because OpenF1 uses them for missing locations. It also adds the session GMT offset used by race lighting. `--metadata-only` refreshes the session metadata on an already generated replay without downloading telemetry again.

### Register the race in the app

Add the replay file and race metadata to the `RACES` object in `src/App.tsx`. Include the JSON URL, display label, circuit name, Grand Prix name, date, and total laps. Make sure any country or circuit labels used by the stage header are derived from the race entry or updated for the new slug. Keep the picker value, replay URL, and displayed event details in agreement.

The replay shape is defined by the `Replay` type in `src/replay.ts`. If the format changes, update the type and its runtime guard, `isReplay`, along with the importer and any consumers.

## Check the result

Before finishing, verify all of the following:

- The chosen OpenF1 session matches the requested year, country, and race.
- The final replay order agrees with the official classification, including retirements and penalties where the source data reflects them.
- `track` follows the supplied track map and forms a closed circuit; driver locations use the same coordinate space.
- Race-relative events are within the replay duration. The driver, position, lap, pit, weather, race-control, and stint data are present when provided by the source.
- No missing GPS fixes place retired cars at `(0, 0)`.
- The new race loads from the picker, displays the correct date and lap count, and plays through the start, any stoppage/restart, and finish.
- The circuit looks consistent with both user-supplied references in the default and top camera views.

Run the project checks after implementation:

```bash
pnpm typecheck
pnpm lint
pnpm test
python -m unittest discover -s scripts -p 'test_*.py'
```

Report the user-provided image paths, race session details and data sources, generated replay path, checks performed, and any telemetry or image limitations.
