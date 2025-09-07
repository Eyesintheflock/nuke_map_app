# Nuke Effects Map (Terrain-Aware, Offline-capable)

A mobile-first, no-login web app to **simulate nuclear blast effects**, **estimate fallout drift**, **visualize terrain shielding**, and **roughly count affected population**—with **GPS-based shelter suggestions** and an optional **live wind feed**.

> **Demo (GitHub Pages):** https://eyesintheflock.github.io/nuke_map_app/  
> Works on modern mobile/desktop browsers. Add to Home Screen for offline use.

---

## Features

- **Blast rings**: 20 psi / 5 psi / 1 psi + **thermal 3rd-degree burn** radius.
- **Fallout plume**: direction/length/width scaled by yield, altitude, precipitation, humidity; oriented by wind.
- **Live Wind (Open-Meteo)**: one-tap fetch of **wind direction + speed** at GPS or map center (no API key).
- **Wind HUD**: draggable/resizable compass, numeric inputs, and **ETA-to-you** + “leave shelter” estimator.
- **Terrain mode (3D)**: MapLibre tilt + exaggeration slider; hillshade overlay. Leaflet fallback if WebGL absent.
- **Shelter Finder (terrain-aware)**: samples points around your GPS position and favors **leeward**/lower terrain.
- **Population impact (county-level)**: union of current effects vs county polygons -> rough headcount estimate.
- **Overlays stack** on right: Legend, Tiles/Terrain, Overlays/Population, Shelter Finder (collapsible).
- **Basemap switcher** + quick **tile refresh** (top bar and panel).
- **Offline-capable PWA**: installable; service worker caches app shell.

---

## Quick Start (local)

No build step; it’s static.

1. **Clone / Download** this repo.
2. Serve the folder with any static server (so the service worker works):
   ```bash
   npx serve .           # or python
