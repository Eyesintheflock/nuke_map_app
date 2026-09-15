# Inspection and stabilization — September 15, 2026

## What was actually deployed

| Item | Verified result |
|---|---|
| Main | `8536bb5d06b09ca720507acc34c3824610bd0622`, merge of PR #2 |
| PR #1 | Open, unmerged. `40d53c7…`; broader basemap/wind/persistence/popups changes. Reported nonmergeable by GitHub. |
| PR #2 | Merged. `2e51763…`; compact top bar/HUD styling. |
| PR #3 | Open, unmerged. `5de648e…`; latest branch, two conflict-resolution commits. Only app.js differs from main. |
| Live HTML and JS | Downloaded bytes match commit `13cbdfad04f4edce9fb09ea86ae9077fd844f1c3`, older than main. |
| Live service worker | Byte-identical to main, cache version `v2025-09-07-2`. |
| Pages deployment of main | Run 17534224229 failed in build; deployment skipped. Detailed historical failure cause has not yet been established. |
| Browser's installed caches | Cannot inspect the user's Samsung/iPad remotely. Stale cache is possible, but does not explain away the verified old server files. |

The service worker's precache included `/` outside the project and lowercase icons that do not exist. The actual files are `Icon-192.png` and `Icon-512.png`; the manifest used yet another missing `icons/` directory. Any failed addAll request could prevent installation. The old HTML also contained malformed nested script markup, an obsolete inline app and duplicate error-toast IDs. The newer stylesheet existed but was never linked.

## Feature assessment

These are source-inspection findings unless a test is explicitly listed. They are not a claim that every control worked on a physical device.

| Area | At start | Development change / remaining work |
|---|---|---|
| App startup | Broken inline script markup; duplicate implementation | One external app entry; extracted CSS; duplicate IDs removed |
| Mobile viewport | Wrapping toolbar and panels could consume map; no resize observer | Dynamic viewport, collapsible controls/panels, resize observer, bounded HUD/panels; device testing needed |
| Map engines | MapLibre and Leaflet present | Startup exception fallback, explicit 2D link, disabled 3D controls in Leaflet |
| Streets/satellite | OSM plus Stadia satellite requiring provider access; dead legacy hillshade host | OSM standard endpoint; Esri satellite/topographic; removed dead Leaflet hillshade. Provider rendering still needs browser verification |
| 3D/hillshade | Demo DEM, terrain checkbox not reliably applied at initial load | Applied after map load, off by default. No global-quality elevation validation |
| Live weather | Handlers bound to absent buttons; API default speed units treated as m/s | Reachable fetch/auto controls, explicit m/s, FROM/TO, model timestamp/source/location, stale/error status and manual override |
| GPS | One attempt, generic failure | High then low accuracy retry; no repeated request after denial; weather uses map center without pretending it is GPS |
| Pins | Add/edit/drag/list existed; no reload restoration or locking on main | Persist/restore, default lock and toggle, cancel-safe creation, escaped labels, invalid-coordinate filtering. Rich forms, category filters and visible map labels remain |
| Effects | Approximate rings/plume, no click popup binding | Inherited model retained; map-ready guard and clearing burst markers repaired. Clickable effect information and science review remain |
| Population | Fourteen crude inline polygons; missing external counties.json | Marked DEMO and removed dead fetch. Official boundaries/population integration remains; no per-ring estimates added |
| Shelter | Heuristic terrain/wind dot scoring, misleading best-location language | Explicit experimental wording; blocks ranking when center elevation unavailable. Not a certified shelter assessment |
| Timers | Unvalidated arrival calculation and unjustified leave-shelter time; other timer buttons unbound | Unsafe numeric arrival/release output withheld. Timer/route controls marked unavailable pending implementation |
| Offline/PWA | Invalid manifest/precache paths | Correct case, scope-relative shell, network-first, scoped old-cache cleanup. CDN libraries and map data not bundled offline |
| Routing/alerts | Not implemented | Remain future work |

## Validation performed

- Passed Node syntax checks on all application and service-worker scripts.
- Passed unique ID/function, DOM-reference, local asset, manifest, build-version and county JSON checks.
- Passed four Node tests: weather m/s and FROM/TO contract, incompatible units rejected, GPS timeout fallback versus permission denial, malformed/unavailable storage.
- Browser QA was attempted, but the cloud browser cannot access the local static server. This static project has no compatible managed browser-preview server. Physical mobile, WebGL, live-provider response/rendering, PWA install/update and offline behavior are **not verified**.
- No simulation formulas or real-world shelter safety claims were validated.

## Next stages after mobile feedback

1. Confirm map rendering, both engines, satellite/topographic availability, toolbar in portrait/landscape, pins across reload, GPS and weather on Samsung/iPad. Add a compatible browser test harness.
2. Split mapping, pins, weather UI and persistence into modules while preserving storage compatibility; replace prompt-based editing with an accessible form and add export/import before origin migration.
3. Add official Oregon/Washington boundaries and population metadata as a general geography layer, with provenance and dates; retire demo polygons.
4. Independently review scientific claims and emergency guidance before enabling any fallout arrival/shelter timing or protective-routing output.
5. Implement general routes, official public alerts and licensed offline references incrementally.

Production is unchanged. Preview publication is agent-managed; CI currently validates/builds artifacts only. No automatic merge or production deployment has been enabled.
