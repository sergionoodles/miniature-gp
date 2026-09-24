# Importing races and circuits

Circuit geometry comes from each race replay's GPS telemetry. `scripts/import_races.py` discovers completed Grand Prix races from OpenF1, creates replay files, and updates the catalog used by the race picker. There is no separate circuit model or reference image to import.

## Import races

From the repository root, run:

```bash
python scripts/import_races.py
```

The script defaults to the current UTC year. To import another season, pass a year:

```bash
python scripts/import_races.py --year 2025
```

It uses OpenF1's `sessions` and `meetings` endpoints to find Race sessions and their event metadata. It skips cancelled and future sessions, and waits to import a race until OpenF1 reports both a finished session and race results. Races with existing replay files are reused. Running the importer again is safe: it refreshes the season catalog without downloading replay data already present.

For each new race, `scripts/import_races.py` calls `build_replay` from `scripts/build_race_replay.py`. The replay builder fetches the session's GPS, driver, position, lap, pit, weather, race-control, stint, starting-grid, and overtake data. It selects a complete GPS lap for the circuit, then saves the replay as `public/data/<year>/race-<session_key>-<year>.json`. The importer writes the corresponding race entries to `public/data/<year>/races-<year>.json` and lists seasons with races in `public/data/years.json`.

OpenF1 may restrict API access around live sessions. The fetch helper waits and retries when it receives the specific live-session restriction response. The importer requires Python 3.12 or newer and uses only the standard library.

## How the circuit is rendered

The replay's `track` array contains GPS points from a representative lap. `src/circuitWorld.ts` projects those points into the scene, smooths them into a loop, and builds the road, kerbs, terrain, and procedural scenery at runtime. The scenery is generic; it does not reproduce the real placement of circuit-specific buildings, grandstands, or landmarks. Zandvoort currently receives a coastal terrain treatment.

The race picker reads `public/data/years.json` and loads the selected season's catalog. Importing a season with completed races makes it available in the season dropdown.

For replay files added directly to a year folder, run `python scripts/import_races.py --catalog-only`. It scans every year folder and adds missing replays to their catalogs using the Jolpica season schedule. `pnpm dev`, `pnpm build`, and the import Action run this refresh automatically; restart the dev server after adding files.

## Check an import

- Confirm the session is the intended year and Grand Prix, and check its final order against official results.
- Confirm the replay's `track` forms a complete loop and that driver locations use the same coordinates.
- Check that the replay contains usable driver positions and GPS locations, and that race events fall within the replay duration.
- Confirm the generated entry in `races-<year>.json` points to the correct replay and has the expected event name, date, circuit, and lap count.
- Run the app with a catalog it supports and check the race picker, track shape, starting grid, and playback.

The replay format and runtime validation are defined in `src/replay.ts`. If that format changes, update the importer, `Replay` type, `isReplay` guard, and its consumers together.
