# Changelog

## Phase 3: Core screens (2026-10-11)

### Added
- **Map home** (guide Section 6.3 screen 1, `docs/screens/Main.png`):
  - Search pill, day/night chip, saved-place chips (Home, UTP, Work), Layers button, recentre button and an extended Report button.
  - A peek sheet with active hazards and open improvement requests for the area on screen. It says "Near you" when you are in view and "In this area" otherwise.
  - Hazard pins (orange diamonds), marked crossings (blue striped squares), bus stops (pink) and shelters (navy), for the visible area only.
- **Search sheet** (screen 2, `Search.png`):
  - The field is focused on open, and there is a clear button.
  - Before typing: your places and recent searches. After typing: results with an icon by category, the area and the walking distance.
  - Search waits 250 ms, needs at least 2 letters, and cancels the older request when a newer one starts.
  - States for searching, no results, and failed (with Try again). Swipe down, "x" or Android back closes it.
- **Route compare** (screen 3, `RouteCompare.png`):
  - A From/To bar with back and swap. Tapping From or To opens search to change it.
  - Safest and Fastest cards with time, distance, a score ring and up to 3 reason chips (`app/src/route/reasons.ts`).
  - The sheet is draggable; dragged up, it shows the score breakdown (Section 5.2 screen 7) and a "not yet checked" note.
  - The camera fits both routes.
- **Route lines** (Section 6.2):
  - Safest: solid teal with a white outline. Fastest: dashed grey.
  - White dots mark streets that are not yet checked.
  - Map tags read "Safest · 14 min" and "Fastest · 11 min". Tapping a card, a line or a tag selects that route.
  - When both routes are the same path, one card and one line show.
- Night scoring follows the clock (19:30 to 07:00). Tapping the chip overrides it for the session. Changing the mode re-plans the route.
- **Saved places**:
  - Tapping an unset chip opens search to choose it. Long press clears it, with Undo.
  - UTP is preset. It is inside the Seri Iskandar pilot area, so walks around campus and into town are routed.
  - Saved and recent places are stored on the phone only (AsyncStorage) and are never sent to the server.
- **Errors in plain words** (EN/BM): too far, too close, start or end off the network, no route, outside the pilot, no start point (with "Choose a start point"), and no internet (with Try again).
- **Layers sheet:** marked crossings, bus stops and shelters on or off for the session. Hazards always show.
- **Placeholders until later phases:** the snackbar (3 s, 5 s with Undo) says Report opens in Phase 5 and walking navigation in Phase 4.
- **App client** (`app/src/api/`):
  - One Supabase client, with sessions off until Phase 5.
  - Typed wrappers for `search_places`, `route_safe` and `map_in_view`. Each has a 12 s timeout and checks the response shape before the UI uses it.
  - Coordinates are sent rounded to 5 decimals.
- `app/src/map/polyline.ts`: a hand-written polyline decoder (no dependency). It matches Google's reference example and the server's point count.
- `20261011000005_map_view_and_unchecked.sql`:
  - `map_in_view(min_lon, min_lat, max_lon, max_lat)` runs as the caller, so RLS applies. It returns active hazards, amenities and counts, and refuses boxes over about 5.5 km.
  - `route_build` now also returns `u`, the polyline index ranges of not-yet-checked streets.
- The tab bar hides during search and route compare, matching the PNGs. Android back steps out one level.

### Dependencies
- `@supabase/supabase-js` 2.117.2 (MIT). Pinned to a release more than 2 weeks old.
- `@react-native-async-storage/async-storage` 2.2.0 (MIT). Version chosen by `expo install` for SDK 57.
- No URL polyfill is needed: React Native 0.86 ships `URL` and `URLSearchParams`.
- `npm audit` is unchanged at 30 issues, all in build tooling. None come from the new packages.
- **AsyncStorage is a native module, so a new development build is needed.**

### Payload (Section 7.4)
- `map_in_view` for a 1.3 km by 1.1 km view of the Old Town: about 1.5 KB.
- Routes grew by about 10 bytes each for `u`.

### Decisions
- Only hazards with status `active` show on the map. Pending hazards wait for Phase 5 confirmations (Section 7.2).
- The "Near you" counts cover the visible area, which is the same box the pins come from.
- Route lines are drawn in a fixed order (fastest under safest). The route that is not selected is faded instead of reordered.

### Fixed during emulator testing
- Route framing used the sheet's placeholder height on the first fit, so part of the route hid under the sheet. The map now refits once the cards have measured themselves, and home camera moves clear the padding compare left behind.
- Long-pressing a saved chip to clear it also opened the "Choose your Home" search, because the long-press handler vanished mid-press. The handler now stays set.
- Tapping Undo on the snackbar could reach the Report button underneath. The snackbar now sits above floating buttons and catches its own taps.
- The "compares the safest and fastest walk" hint no longer shows when choosing a saved place.
- The compare title read "2 walking routes" while loading or on an error; it now reads "Walking routes" until routes arrive.
- BM showed "1 walking route" in English: Hermes has no Malay plural rules, so `ms.json` now repeats each `_other` plural as `_one`.
- Route cards are more compact (smaller score ring, tighter padding, Fastest shows its two biggest warnings) so more map shows; text stays at 14 sp or more.
- The expanded sheet stops below the trip bar so the OpenStreetMap credit always has map behind it.

### Second pilot area: Seri Iskandar and UTP
- `ipoh_extract.py` has named areas (`--area ipoh` or `--area seri-iskandar`, `--bbox` still works) and writes each to its own folder: `out/ipoh/`, `out/seri-iskandar/`. The clipped file is now `area.osm.pbf`, next to an `area.json` with the area's name and box.
- `load_to_supabase.py` loads every area folder in one run (`python load_to_supabase.py out/ipoh out/seri-iskandar`), so one area can never wipe the other.
- Seri Iskandar box: 100.935, 4.345 to 100.990, 4.395. It covers the town centre, Iskandar Bestari, UiTM, Hospital Seri Iskandar, the Hentian bus station and the UTP campus.
- `20261011000006_area_labels.sql`: a place with no named street within 100 m and no neighbourhood within 1 km is labelled with its nearest town (within 15 km) instead of always "Ipoh".
- `20261011000008_route_per_area.sql`: `route_safe` used to snap only to the single largest network (Ipoh), so every Seri Iskandar walk failed. It now uses the largest network within 250 m of the start that has at least 500 junctions, one per pilot area, so isolated service roads still cannot strand a search.
- Load results (OSM extract of 2026-10-09, trunk roads included): Ipoh 6,058 segments, 246 amenities, 1,405 places; Seri Iskandar and UTP 4,310 segments, 57 amenities, 338 places. 10,368 segments and 7,528 junctions in total.
- Route checks: UTP to Hentian Seri Iskandar 2.8 km, UTP to UiTM 5.9 km, both in about 0.1 s. Ipoh to UTP returns `too_far`.
- App: `PILOT_AREAS` in `app/src/map/config.ts` lists both boxes. Recentre outside both shows the nearest one. On the first location fix inside Seri Iskandar, the map frames that area. "Ipoh pilot" wording now says "pilot areas" in EN and BM.

### Fixed after review
- **Detours around trunk roads:** Jalan Panglima Bukit Gantang Wahab, between the railway station and Ipoh Padang, is tagged `highway=trunk`, and the walk network left trunk roads out. Walks could not cross it, so Station to Ipoh Padang (400 m straight) routed at 1.3 km; it is now 510 m. Trunk roads are now walkable unless tagged `foot=no` or `motorroad=yes`, and `20261011000007_trunk_roads.sql` gives them every main-road penalty (Section 7.1).
- **Route tags** sit 20 to 80% along each route, where that route is farthest from the other, and at least a third of the trip apart when possible. They no longer stack on each other or on the start pin.
- **Crossing stacks:** pins of the same kind within 20 m show as one.
- **User dot:** the blue dot is drawn from the same position the app routes from, so it shows whenever "Your location" works. MapLibre's own location layer could stay hidden.

### Known issues
- Most route segments are still "not yet checked" until the corridor audit, so lines are largely dotted and Fastest often shows a high "not yet checked" warning.
- Seri Iskandar has very few mapped crossings, bus stops and sidewalks in OSM, so its routes are almost all "not yet checked".
- The guide's Section 7.3 steps still show the old single-folder extractor command and `ipoh-central.osm.pbf`; the README has the new commands.
- In the dev build the Expo dev-menu button floats over the swap button; release builds do not have it.
- Tapping a hazard pin does nothing yet; report cards come in Phase 5.
- ESLint and Prettier are still not set up (waiting for approval as dev dependencies).

## Phase 2: Search and routing API (2026-10-11)

### Added
- `20261011000004_search_and_routing.sql` (guide Sections 4.1, 7.1, 7.4):
  - `search_places(q, near_lon, near_lat)`: up to 10 places with name, area, category, coordinates (5 decimals) and straight-line distance from the optional near point. Matches with `word_similarity` or a substring, prefix matches first, one row per name per ~200 m.
  - `route_safe(start_lon, start_lat, end_lon, end_lat, mode)`: returns both the safest route (cost = length x (1 + penalty)) and the fastest route (cost = length) as JSON. Each route has an encoded polyline (precision 5), distance, time at 1.3 m/s, a 0 to 100 score, stats and turn steps. `same` is true when both are the same path.
  - Active hazards (`status = 'active'`, not expired) add +3.0 to every segment within 15 m at query time.
  - Both points snap to the nearest edge of the main network (at most 250 m away), and that edge is cut at the snap point, so a route starts exactly at the user.
  - Errors come back as `{"error": ...}`: `bad_mode`, `bad_point`, `too_far` (over 10 km), `too_close` (under 15 m), `start_off_network`, `end_off_network`, `no_route`.
  - Helpers live in a `private` schema that the API does not expose. `route_safe` runs as the owner because clients cannot read `road_segments`.
  - `road_vertices.component` and `unsafe_junction`, plus `road_segments.component`, are now set by `rebuild_network()`.
  - `private.label_places()` labels each place with the nearest named street within 100 m, else the nearest neighbourhood within 1 km, else Ipoh.
- `load_to_supabase.py` calls `private.label_places()` after `rebuild_network()`.

### Route JSON
- Route: `poly`, `dist` (m), `time` (s), `score` (0 to 100), `stats`, `steps`.
- `stats`: `sw` (% with sidewalk or path), `lit` (% lit), `unk` (% not yet checked), `nosw` (m with no sidewalk), `mx` (marked crossings), `ux` (unmarked main-road crossings), `hz` (active hazards within 15 m).
- Step: `t` (depart, left, right, slight_left, slight_right, straight, cross, arrive), `n` (street name), `l` (landmark `{k, n}`: crossing, signals, bus_stop, shelter or place), `x` (crossing kind: marked, signals, unmarked), `d` (m to the next step), `i` (index into the polyline points). The app builds the sentence in English or Bahasa Melayu.

### Results
- About 0.2 to 0.4 s per call.
- Station to Concubine Lane: 1,257 m, 16 min, score 95 by day.
- Station to Ipoh Parade: 3,229 m, 41 min, score 94 by day and 88 by night.
- Payload: both routes for Station to Ipoh Parade (3.2 km) are 1,189 bytes over the wire with gzip (4.6 KB uncompressed). Routes up to about 3 km are under 2 KB each even uncompressed.
- With a test hazard on the Station to Concubine Lane route, the safest route went around it (1,257 m to 1,463 m), and the fastest route reported `hz: 1` and dropped from 94 to 87. The test was rolled back.

### Decisions
- Score = 100 - 25 x the length-weighted average penalty, clamped to 0 to 100. A route made only of "not yet checked" streets scores 95 by day and 90 by night. To be tuned after test walks (Section 7.1).
- Steps under 15 m that are not crossings are merged into the step before, since phone GPS cannot tell them apart.
- Landmarks are only attached to turns.
- A separate sidewalk with no name takes the name of the road beside it.
- The app client, polyline decoding and types come in Phase 3 with the screens.

### Known issues
- Every route is 100% "not yet checked" until the corridor audit adds sidewalk and lighting tags, so safest and fastest often differ by only a few points.
- `mx` counts marked crossing nodes within 8 m of the route, which can include a crossing the route passes but does not use.

## Phase 1: Database and data (2026-10-11)

### Added
- Supabase project (Singapore) linked with the Supabase CLI 2.120.0. Migrations live in `supabase/migrations/` and are applied with `npx supabase db push`.
- `20261011000001_core_schema.sql`: PostGIS 3.3, pgRouting 3.4 and pg_trgm in the `extensions` schema. Tables `road_segments`, `road_vertices`, `amenities`, `places`, `reports`, `report_votes` (guide Section 8), RLS on in the same migration.
  - Map data is read-only for everyone; `road_segments` has no client access (routes come from `route_safe()` in Phase 2).
  - Guests (anonymous sign-in) can read but not write. `reports.user_id` is not readable by clients, so "Post anonymously" holds.
  - Report status and expiry are server-controlled. Hazards get `expires_at = now() + 7 days` on insert.
- `20261011000002_report_photos_bucket.sql`: public-read `report-photos` bucket, JPEG only, 2 MB limit. Only full users upload; only the uploader replaces or deletes.
- `20261011000003_network_functions.sql`: `rebuild_network()` builds junctions with `pgr_extractVertices` and applies the Section 7.1 penalties into `score_day` / `score_night`. `network_coverage` view to check a load. Neither is callable through the API.
- `data-scripts/load_to_supabase.py`: loads segments, amenities and 1,389 search places (POIs plus named streets), then calls `rebuild_network()`. Reads `DATABASE_URL` from a git-ignored `data-scripts/.env`.
- `ipoh_extract.py`: walk-network filter moved into `is_walkable()` so the loader shares it. Python deps now include `psycopg[binary]`; the data scripts run in a local `.venv`.

### Results (OSM extract of 2026-10-09)
- 5,723 segments, 4,346 junctions. Coverage matches `coverage-report.md`: 273.2 km of road, 0.5 km with sidewalk tagged, 4.6 km with lit tagged, 24.5 km of footpaths, 2.8 km of separate sidewalks.
- Day scores: 5,070 segments at 0.2 (not yet checked), 599 at 1.2 (junction with a main road and no marked crossing), 32 at 0.7 (fast traffic).
- The largest connected network holds 3,954 of 4,346 junctions (91%). The other 72 pieces are small islands such as isolated service roads.

### Decisions
- The network is read from `ipoh-central.osm.pbf`, not `walk-network.geojson`. The GeoJSON is simplified for display and can lose the shared vertex where two streets meet; routing needs exact junctions. Amenities still come from `amenities.geojson`.
- `report_votes` has a `vote` column (`confirm`, `gone`, `upvote`) so Still there and Gone can both be stored (screens 4 and 7).
- "Crossing a main road without a marked crossing" is applied, as a version 1 approximation, to minor roads and paths that meet a main road at a junction with no marked crossing or signal within 15 m, plus unmarked crossing edges over a main road.
- "Not yet checked" applies when a road's sidewalk is unknown or lighting is not tagged.
- Pilot corridor for sidewalk-level mapping (Section 7.5): Ipoh Railway Station to Birch Memorial Clock Tower to Concubine Lane, about 1.5 km. It is the area with the most sidewalk, crossing and signal data today.
- Three situations to support: a real walk in Ipoh (the pilot), a demo at UTP using a simulated walk along the corridor (Phase 7), and later pilot areas such as Seri Iskandar (`--bbox` in both scripts).

### Known issues
- OSM has almost no sidewalk or lighting tags in central Ipoh (100% unknown), so most segments carry only the "not yet checked" penalty until the corridor audit.
- Search should use `word_similarity` (`<%`) rather than `similarity` for partial names (Phase 2). Area labels from the nearest neighbourhood node are sometimes misleading and will be refined in Phase 2.

## Phase 0: Foundations (2026-10-10)

### Added
- Expo SDK 57 app in `app/`: TypeScript strict (plus `noUncheckedIndexedAccess`), Expo Router with routes in `app/src/app/`, bottom tabs Map, Community, Me. Android package `com.langkah.app`.
- Theme file `app/src/theme/theme.ts`: brand colours, darker text-safe variants that pass 4.5:1, 8 dp spacing, 12/16 dp radii, type scale from guide Section 6.2.
- Atkinson Hyperlegible Next 400 to 700, embedded at build time through the `expo-font` config plugin.
- i18n with i18next and expo-localization: `en.json` and `ms.json`, typed keys, follows the phone language with English as the fallback.
- App icon, Android adaptive icon (navy background), and native splash (white mark on navy), followed by a JS loading screen that matches `docs/screens/Splash.png`.
- Map tab: MapLibre with OpenFreeMap Positron and a light Langkah recolour, framed on central Ipoh, user location dot, recentre button, visible "© OpenStreetMap contributors" credit (tap for full credits), and an error banner if the map fails to load.
- Location rationale sheet (EN/BM) before the Android permission dialog, and a "Location is off" sheet with Open Settings when permission is blocked.
- `eas.json` with `development` (dev client, APK) and `preview` (APK) profiles.
- Root README, `.gitignore`, `app/.env.example`.
- Outside the pilot area, the recentre button frames central Ipoh and shows a dismissible banner, "You're outside the Ipoh pilot area" (EN/BM). It hides itself after 6 s.

### Decisions
- The native Android 12+ splash can only show an icon, so the wordmark, tagline and progress bar live in the JS loading screen.
- The day/night chip will control scoring. The dark night map switches on automatically after sunset (Phase 6).
- Saved-place chips (Home, UTP, Work) will be user-defined. A place outside the pilot area gets a friendly "outside the Ipoh pilot" state.
- Storage and background location permissions are blocked for now (least privilege).
- `react-dom` is pinned to the React version through npm `overrides`. `expo-router` pulls it in as a peer, and npm 10 on EAS refused the newer 19.3.0.
- EAS project linked: owner `affannajiy`, `extra.eas.projectId` set in `app.config.ts`.

### Known issues
- `npm audit` reports 30 issues (19 high), all in transitive dependencies of the Expo CLI and build tooling (`braces`, `node-forge`, `uuid`, `decode-uri-component`). They are not in the app bundle. `npm audit fix --force` would break the SDK 57 version pins, so we wait for upstream Expo fixes. Check again at each phase.
- ESLint and Prettier are not set up yet (they need approval as new dev dependencies).
