# Grand Prix Atlas

Grand Prix Atlas turns a Formula 1 race into a small, fixed-view 3D replay. Watch the cars move around the circuit, follow the running order, and explore the race at your own pace. The first replay covers the **2026 Italian Grand Prix at Monza**.

## What you can do

- Watch 22 cars follow their recorded positions on a stylized Monza circuit.
- Pause, resume, scrub through the race, or change playback speed from 1× to 120×.
- Follow the running order, lap count, pit stops, race status, and weather.
- See Monza's parkland, grandstands, paddock, and pit lane from a fixed isometric view.

## How it works

The webpage uses React and Three.js. A bundled replay file contains the timing, car locations, and events sourced from [OpenF1](https://openf1.org/). The track follows a recorded lap, aligned with the supplied track map; the surroundings are a simple 3D interpretation of the aerial reference. Playback reads the local file, so watching the race does not call the OpenF1 API.

For now, the race selector contains only Monza 2026. More historical races can be added as local replay files once this first circuit is ready.

## Run locally

```bash
pnpm install
pnpm dev
```
