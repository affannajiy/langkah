# Langkah

Pedestrian safety and navigation for Ipoh and Seri Iskandar. Langkah treats the walker the way Waze treats the car: it compares the safest and the fastest walk, shows hazards and crossings, and guides you turn by turn with hazard alerts on the way.

UTP Technopreneurship Team Project, Group 4. Android only for the MVP.

- **Source of truth:** [docs/Langkah Tech Stack.md](docs/Langkah%20Tech%20Stack.md) (the guide).
- **Rules for AI agents:** [CLAUDE.md](CLAUDE.md).
- **Rulebooks:** [rulebooks/](rulebooks/) (engineering, security, UI/UX).
- **What changed in each phase:** [CHANGELOG.md](CHANGELOG.md).
- **Screen designs to match:** [docs/screens/](docs/screens/).

## Status

| Phase | What | State |
|---|---|---|
| 0 | Expo app, theme, fonts, tab bar, map with OpenFreeMap, location permission, EN and BM | Done |
| 1 | Supabase schema with RLS, OSM data loaded, routing network and safety scores | Done |
| 2 | `search_places` and `route_safe` (safest and fastest walk, day and night scoring) | Done |
| 3 | Map home, search sheet and route compare screens | Done |
| 4 | Walking navigation, hazard banner, quick report, haptics | Done, being reviewed |
| 5 | Sign-in, report flow, community tab, report expiry | Next |
| 6 and 7 | Arrival, Me tab, onboarding, demo readiness and preview APK | To do |

### Pilot areas

Routing, search and map data only cover these boxes. Outside them the app says so and shows the nearest one.

| Area | Box (west, south, east, north) | Covers |
|---|---|---|
| Central Ipoh | 101.068, 4.583, 101.100, 4.612 | Old Town, New Town, railway station, Concubine Lane to Ipoh Parade |
| Seri Iskandar and UTP | 100.935, 4.345, 100.990, 4.395 | Seri Iskandar town, Iskandar Bestari, UiTM, Hospital Seri Iskandar, the UTP campus |

A walk can be up to 10 km, so Ipoh to UTP (about 30 km) is refused with a clear message.

## Stack

| Part | What we use |
|---|---|
| App | Expo SDK 57, React Native 0.86, TypeScript strict, Expo Router (tabs: Map, Community, Me) |
| Map | `@maplibre/maplibre-react-native` with the OpenFreeMap Positron style, restyled. No Google Maps. |
| Backend | Supabase (Singapore): Postgres with PostGIS, pgRouting and pg_trgm, anonymous and Google sign-in, Storage |
| Data | OpenStreetMap via Geofabrik, processed by Python scripts in `data-scripts/` |
| Text | i18next with expo-localization, English and Bahasa Melayu, no hard-coded strings |
| Font | Atkinson Hyperlegible Next |
| Builds | EAS (Expo's cloud build), free tier |

The budget is RM0: every service above is free and none needs a card.

## Repository layout

| Folder | Contents |
|---|---|
| `app/` | The Expo app. Screens live in `app/src/app/` (Expo Router). |
| `app/src/api/` | Supabase client and typed calls (`search_places`, `route_safe`, `map_in_view`) |
| `app/src/features/map/` | Map tab pieces: search sheet, compare sheet, trip bar, home controls, layers |
| `app/src/app/navigate.tsx` | The walking screen, shown above the tabs |
| `app/src/features/nav/` | Walking screen pieces: instruction card, hazard banner, bottom bar, quick report sheet, route layers |
| `app/src/nav/` | Walk engine: line snapping, off-route and arrival, haptics, walk location service |
| `app/src/map/` | Map config (pilot areas), pins, route lines, user dot, location hooks |
| `app/src/components/` | Shared UI: text, buttons, sheets, chips, route cards, snackbar |
| `app/src/storage/` | On-phone storage: saved and recent places, the report queue |
| `app/src/i18n/locales/` | `en.json` and `ms.json` |
| `app/src/theme/theme.ts` | All design tokens (colours, spacing, radii, type) |
| `supabase/migrations/` | Every schema change, function and RLS policy, in order |
| `data-scripts/` | `ipoh_extract.py` (clip and check OSM data), `load_to_supabase.py` (load and build the network) and `seed_demo.py` (demo hazards and walk). `raw/`, `out/` and `.venv/` are git-ignored. |
| `docs/` | The guide, colour scheme, architecture diagram and final screen PNGs |
| `assets/logo/` | Master logo files. `app/assets/brand/` holds the copies the build uses. |
| `rulebooks/` | Engineering, security and UI/UX rulebooks |

## 1. Set up a Windows laptop (once)

1. Install **Git for Windows**, **Node.js LTS** and **VS Code**.
2. Install **Android Studio**, open it once and finish the setup wizard. It downloads the Android SDK and the emulator.
3. In Android Studio, open **Device Manager** and create a **Pixel 8** with a recent **Google APIs, x86_64** system image. Virtualization must be on (Task Manager, Performance, CPU).
4. Install the EAS CLI and log in to Expo:
   ```bash
   npm install -g eas-cli
   ```
   ```bash
   eas login
   ```
5. Install the app's packages:
   ```bash
   cd app
   npm install
   ```
6. Copy `app/.env.example` to `app/.env` and fill in the Supabase **Project URL** and **anon key** (Supabase dashboard, Project Settings, API). Ask the team lead for them.

See [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md) for the full list of tools and free accounts.

## 2. Run the app on the Android Emulator

Expo Go cannot run MapLibre, so we use our own **development build**: an APK with the native code, which loads the JavaScript live from your laptop.

1. **Build the development APK** (first time, and again only when a native package or a permission changes: AsyncStorage in Phase 3, `expo-task-manager` and the walk permissions in Phase 4). Inside `app/`:
   ```bash
   eas build -p android --profile development
   ```
   It takes about 10 to 20 minutes in Expo's cloud.
2. **Start the emulator** from Android Studio (Device Manager, Play). When the build finishes, answer **Yes** to "Install and run on emulator?". Or drag the APK onto the emulator window.
3. **Start the dev server** inside `app/`:
   ```bash
   npx expo start
   ```
   Press `a`, or open Langkah on the emulator and pick the server in the dev launcher. If the launcher does not find it, enter `http://10.0.2.2:8081` (the emulator's address for your laptop).
4. **Fake your location.** In the emulator, click **...** (Extended controls), then **Location**. Search for a place and click **Set location**:
   - Ipoh Railway Station: 4.597368, 101.073437
   - UTP: 4.38545, 100.97958
5. **Fake a walk** with the demo GPX (see section 5, "Demo hazards"):
   1. Set the location to Ipoh Railway Station and restart the app.
   2. Search **Concubine Lane**, pick the **Fastest** card and press Start.
   3. In **Extended controls**, **Location**, choose **Load GPX/KML**, open `data-scripts/out/demo-walk.gpx` and press **Play**. Raise the playback speed to go faster.
   4. Expect turn cards, three hazard banners, then "You have arrived". Start the **Safest** walk instead to see an off-route reroute.

Saving a file reloads the app on the emulator. Shake (Ctrl+M) opens the dev menu.

### Testing in Bahasa Melayu

Switch only the app to Malay, without changing the whole emulator:

```bash
adb shell cmd locale set-app-locales com.langkah.app --locales ms-MY
```

Switch it back to the system language:

```bash
adb shell cmd locale set-app-locales com.langkah.app --locales ""
```

`adb` lives in `%LOCALAPPDATA%\Android\Sdk\platform-tools`.

## 3. Build an APK to share (demo and testers)

A **preview** APK runs on its own, with no laptop or dev server:

```bash
eas build -p android --profile preview
```

Open the build link on an Android phone and install the APK. Android asks once to allow installs from that source. No rooting is needed. To put the latest preview build on the emulator:

```bash
eas build:run -p android --latest
```

## 4. Backend (Supabase)

The project is hosted on Supabase (Singapore region). Every change goes through a migration in `supabase/migrations/`; never edit the schema in the dashboard.

1. Link the CLI to the project (once, from the repo root):
   ```bash
   npx supabase link --project-ref <project-ref>
   ```
2. See which migrations are applied:
   ```bash
   npx supabase migration list
   ```
3. Apply new migrations:
   ```bash
   npx supabase db push
   ```

| Migration | What it does |
|---|---|
| `…01_core_schema` | Extensions, tables (`road_segments`, `road_vertices`, `amenities`, `places`, `reports`, `report_votes`), RLS on every table |
| `…02_report_photos_bucket` | Public-read `report-photos` bucket, JPEG only, 2 MB |
| `…03_network_functions` | First `rebuild_network()` and the `network_coverage` view |
| `…04_search_and_routing` | `search_places()`, `route_safe()`, area labels, connected components |
| `…05_map_view_and_unchecked` | `map_in_view()` for pins and counts, dotted "not yet checked" route parts |
| `…06_area_labels` | Places outside a named street or neighbourhood are labelled with their nearest town |
| `…07_trunk_roads` | Trunk roads count as main roads in the walk network |
| `…08_route_per_area` | `route_safe` routes inside the pilot area's own network (Ipoh or Seri Iskandar) |

The app can call only `search_places`, `route_safe` and `map_in_view`, plus the tables RLS allows. Road data is never read directly by the app.

## 5. Map data (OpenStreetMap)

The data scripts run on the laptop only. They need `DATABASE_URL`, which holds the database password, so it lives in the git-ignored `data-scripts/.env`.

### Set up Python (once)

Inside `data-scripts/`:

```bash
python -m venv .venv
```
```bash
.venv\Scripts\activate
```
```bash
pip install -r requirements.txt
```

Copy `data-scripts/.env.example` to `data-scripts/.env` and put in the **Session pooler** connection string (Supabase dashboard, Connect).

### Refresh the data (monthly, or after OSM edits)

1. Download `malaysia-singapore-brunei-latest.osm.pbf` (about 240 MB) from [download.geofabrik.de](https://download.geofabrik.de/asia/malaysia-singapore-brunei.html) into `data-scripts/raw/`.
2. Extract each pilot area into its own folder. Each run takes about 3 minutes.
   ```bash
   python ipoh_extract.py raw/malaysia-singapore-brunei-latest.osm.pbf out/ipoh --area ipoh
   ```
   ```bash
   python ipoh_extract.py raw/malaysia-singapore-brunei-latest.osm.pbf out/seri-iskandar --area seri-iskandar
   ```
   Each folder gets `area.json`, `area.osm.pbf` (the clipped data), `walk-network.geojson`, `amenities.geojson`, `coverage-report.md` and `preview.png`.
3. Load **all** areas in one run. The loader replaces every OSM row, so an area left out of the command disappears from the app. Audit rows are kept.
   ```bash
   python load_to_supabase.py out/ipoh out/seri-iskandar
   ```
   It rebuilds the routing network and the day and night safety scores, and prints a coverage summary.

### Demo hazards (testing and the demo)

The `reports` table is empty until people report (Phase 5). To test hazard banners and routing around hazards, add three demo hazards on the walk from Ipoh Railway Station to Concubine Lane:

```bash
python seed_demo.py
```

It also writes `out/demo-walk.gpx`, the fastest line of that walk, for the emulator to play back (section 2, step 5). Run it again to refresh the hazards. Remove them before a real launch:

```bash
python seed_demo.py --clear
```

### Add a new pilot area

1. Add it to `AREAS` in `data-scripts/ipoh_extract.py`.
2. Add the same box to `PILOT_AREAS` in `app/src/map/config.ts`.
3. Extract it, then load every area again (step 3 above).
4. Update the "pilot areas" wording in `en.json` and `ms.json`.

## 6. Checks

Run inside `app/` before each commit:

```bash
npm run typecheck
```
```bash
npm run doctor
```

Then test the phase's steps on the emulator (each phase in `CHANGELOG.md` lists them).

## How we work

- Work follows the phases in [KICKOFF_PROMPT.md](KICKOFF_PROMPT.md). Each phase ends with a summary, emulator test steps and a review before the next one starts.
- One feature branch per phase (for example `feat/phase-3`) with small, clear commits.
- Ask before adding a dependency, changing the schema outside a migration, or anything that costs money.

## Security

- Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` go in the app. The anon key is safe to ship because RLS protects every table.
- The **service role key** and the **database password** never go in the app, in git or in chat. `.env` files are git-ignored; keep the `.env.example` files up to date.
- Every new table turns on RLS in the same migration that creates it.
- Location stays on the phone. It is only sent as the start of a route request (including a reroute) and never stored.
- During a walk, location runs as a foreground service with a visible notification and stops when the walk ends. Langkah never asks for "Allow all the time" location (`ACCESS_BACKGROUND_LOCATION` is blocked).
- Quick reports and Still there / Gone answers wait on the phone until sign-in (Phase 5).

## Troubleshooting

| Problem | Fix |
|---|---|
| Dev launcher cannot find the server | Make sure `npx expo start` is running in `app/`, then enter `http://10.0.2.2:8081` in the launcher. |
| App crashes after `npm install` added a native package (for example "Cannot find native module 'ExpoTaskManager'") | Build a new development APK (section 2, step 1). |
| No hazard banner during the demo walk | Run `python seed_demo.py` again (hazards are active for 7 days), and start the **Fastest** walk, since Safest avoids the hazards. |
| The phone does not vibrate on the emulator | The emulator has no vibration motor. Check `adb shell dumpsys vibrator_manager`, or test on a real phone. |
| Map is blank | Check the emulator has internet. Tiles come from OpenFreeMap. |
| "Outside the pilot areas" | Set the emulator location inside one of the pilot boxes (section 2, step 4). |
| Search or routes fail | Check `app/.env`, then the Supabase project status in the dashboard. |
| A small gear button floats over the map | That is the Expo dev menu in development builds. Preview APKs do not have it. |

## Credits

Map data © OpenStreetMap contributors (ODbL 1.0). Tiles by OpenFreeMap / OpenMapTiles. Font: Atkinson Hyperlegible Next by the Braille Institute (SIL OFL). Icons: Lucide (ISC).
