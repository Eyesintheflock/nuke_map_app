# Nuke Effects / Emergency Preparedness Map

Vanilla JavaScript map project. Stable production: https://eyesintheflock.github.io/nuke_map_app/

## Development workflow

- `main` remains production; merge only after the owner tests and approves a change.
- `develop/stabilize-preview` contains the first audited stabilization cycle.
- The development preview uses a separate private Sites deployment. Its project identity is in `.openai/hosting.json`; it does not replace GitHub Pages.
- Each agent-led cycle: inspect → edit → validate → commit to development → publish the same revision to the preview → provide its link → await the owner's production approval.
- GitHub Actions validates development pushes and PRs and uploads a static-file artifact. **It does not automatically publish the private Sites preview.** The agent publishes that preview using its connected hosting tool after checks pass.
- Before each release, update the version in `sw.js`, `app/platform.js`, the visible build badge, and all local versioned script/style references together. `scripts/validate.py` checks the shell references.

## Local checks

```sh
python3 scripts/validate.py
node --test tests/*.test.cjs
node scripts/build-preview.mjs
python3 -m http.server 8000
```

No bundler or package installation is required. Node 22+ and Python 3 are sufficient for checks. Third-party browser libraries currently load from pinned unpkg URLs, so the fully interactive map is **not guaranteed to work offline**. The service worker caches only same-origin app-shell assets; external tiles, weather and libraries are not bulk cached.

## Code layout

- `index.html`: markup and clearly labeled county demo data; no executable inline application copy.
- `styles.css`: shared layout, panels, HUD and mobile viewport rules.
- `app.js`: existing simulation/map/pin/UI integration, retained for gradual refactoring.
- `app/platform.js`: general storage, GPS retry policy, weather fetch/validation services.
- `sw.js`: scope-relative, network-first app-shell caching and scoped cleanup.
- `scripts/validate.py`: syntax, DOM IDs/references, local assets, manifest and build version checks.
- `scripts/build-preview.mjs`: creates `dist/` for deployment.
- `tests/platform.test.cjs`: weather unit/direction contract, GPS timeout/permission behavior, storage errors.
- `AUDIT.md`: inspected production state, feature gaps and testing limits.

## Data and limits

- Weather: [Open-Meteo](https://open-meteo.com/en/docs), modeled current conditions, fetched on demand or every ten minutes while enabled and visible. Inputs display wind **TO**; fetched meteorological **FROM** is also shown. Requested wind units are explicitly m/s. Manual edits disable automatic refresh. The weather request uses a user-obtained GPS fix when available, otherwise the map center. It sends those coordinates to the weather provider.
- Streets: OpenStreetMap. [Tile policy](https://operations.osmfoundation.org/policies/tiles/). No offline tile downloading or cache bypass.
- Satellite/topographic: Esri public raster services, with attribution. Availability is provider-dependent; long-term production usage/terms and attribution completeness must be reviewed before scaling distribution.
- Terrain: retained MapLibre demo DEM, experimental and off by default. Its suitability/coverage is not validated for shelter decisions.
- Population: fourteen approximate demonstration polygons with historical example totals. **Not official county boundaries, current Census coverage, a population-density grid or casualty estimates.**
- Effects retain the inherited approximation functions, which have not been scientifically validated. This cycle does not improve weapon modeling or claim accurate blast/fallout predictions.
- Terrain sampling is not a shelter assessment. The old unsupported arrival/release timer is withheld pending validation; no location or departure time is certified safe.
- Preview and production have different origins. Pins stay on the device and origin where they were saved; there is no cross-origin migration or cloud backup yet.

See AUDIT.md for the next bounded development stages.

## September 16 preview update

- Map-first layout: one drawer at a time, phone-sized bottom drawers, and a Map only / Show tools pair. Optional weather chip, navigation controls and scale can be toggled independently. Display choices persist locally. Provider attribution is retained.
- General seasonal weather is a separate `climate.html` page, reached through Weather → Explore seasonal weather. It has no simulation imports, does not apply values to the simulation, and does not calculate dispersal or fallout.
- Choose a month, full/early/mid/late window, and 3/5/10 complete years. Hourly ERA5 archive data is aggregated into direction frequencies, calm share, mean speed/temperature/humidity, middle-80% ranges and wet-hour frequency. Source, sample coverage, selected coordinates and fetch time are shown.
- Summaries are descriptive historical reanalysis, not event forecasts or standard 30-year climate normals. API errors never produce a partial multi-year result. Up to eight completed summaries are saved on-device for repeat/offline reading. The archive is fetched only on request; coordinates are disclosed to Open-Meteo when loading.
- `app/interface.js` owns drawer/visibility state; `app/climate-data.js` and `app/climate-ui.js` own the independent climate view. Ten dependency-free Node tests now run in CI.

Validation included an HTTP 200 archive request with expected units and a cross-origin request returning `Access-Control-Allow-Origin: *`. A JSDOM smoke check (map engine stubbed) passed for app boot, drawer exclusivity, visibility persistence, focus restore, HUD closing and DOM containment. Actual mobile rendering and real WebGL remain device-test items.
