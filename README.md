# Miniature GP

Miniature GP turns a Formula 1 race into a small, fixed-view 3D replay. Watch the cars move around the circuit, follow the running order, and explore the race at your own pace. The first replay covers the **2026 Italian Grand Prix at Monza**.

## What you can do

- Watch 22 cars follow their recorded positions on a stylized Monza circuit.
- Pause, resume, scrub through the race, or change playback speed from 1× to 120×.
- Follow the running order, lap count, pit stops, race status, and weather.
- See Monza's parkland, grandstands, paddock, and pit lane from a fixed isometric view.

## How it works

The webpage uses React and Three.js. A bundled replay file contains the timing, car locations, and events sourced from [OpenF1](https://openf1.org/). The track follows a recorded lap, aligned with the supplied track map; the surroundings are a simple 3D interpretation of the aerial reference. Playback reads the local file, so watching the race does not call the OpenF1 API.

The race selector reads a generated catalog of available 2026 replays. New circuits use their recorded GPS lap for the track and procedural scenery.

## Run locally

```bash
pnpm install
pnpm dev
```

## Import races

From the repository root, run the importer with Python 3.12 or newer:

```bash
python scripts/import_races.py
```

To import another season, pass its year:

```bash
python scripts/import_races.py --year 2025
```

The default is the current UTC year. The script discovers completed Grand Prix races from OpenF1, downloads missing replays into `public/data/`, and updates `public/data/races-<year>.json`. Rerunning it skips races already imported; future, cancelled, and unfinished races wait for a later run. OpenF1 temporarily restricts free API access around live sessions, starting 30 minutes before and ending 30 minutes after; the script waits and retries every five minutes when that happens. No Python packages need to be installed. The website currently reads the 2026 catalog.

The [Import current season races](.github/workflows/import-races.yml) GitHub Action runs daily at 04:17 UTC. You can also start it from **Actions → Import current season races → Run workflow** to backfill available races immediately. The Action commits generated replay and catalog files to the branch it runs on.
