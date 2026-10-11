# Changelog

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
