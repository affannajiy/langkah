# Changelog

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
