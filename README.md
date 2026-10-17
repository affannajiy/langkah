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
| 4 | Walking navigation, hazard banner, quick report, haptics | Done |
| 5 | Sign-in, report flow, community tab, trust rules and report expiry | Done |
| 6 | Arrival, Me tab, Settings, onboarding, night map, demo mode, empty and error states | Done |
| 7 | Demo readiness: demo photos, payload and accessibility checks, demo script, preview APK | Done, being reviewed |

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
| `app/src/api/` | Supabase client and typed calls: `langkah.ts` (search, routes, map view), `reports.ts` (reports, votes, Community, photos) |
| `app/src/auth/` | Guest session, Google sign-in (linked to the guest account) and the sign-in sheet |
| `app/src/features/map/` | Map tab pieces: search sheet, compare sheet, trip bar, home controls, layers |
| `app/src/app/navigate.tsx` | The walking screen, shown above the tabs |
| `app/src/app/arrival.tsx`, `settings.tsx`, `welcome.tsx` | Arrival screen, Settings, and first-launch onboarding (language, why location) |
| `app/src/features/nav/` | Walking screen pieces: instruction card, hazard banner, bottom bar, quick report sheet, route layers |
| `app/src/features/report/` | The 4-step report flow sheet and the category icons |
| `app/src/features/community/` | Community tab pieces: rows, detail sheet, map view, votes, CSV and GeoJSON export |
| `app/src/nav/` | Walk engine: line snapping, off-route and arrival, haptics, walk location service |
| `app/src/map/` | Map config (pilot areas), pins, route lines, user dot, location hooks |
| `app/src/components/` | Shared UI: text, buttons, sheets, chips, route cards, snackbar |
| `app/src/storage/` | On-phone storage: settings, saved and recent places, the report queue |
| `app/src/net/` | Online or offline, for the offline banners |
| `app/src/i18n/locales/` | `en.json` and `ms.json` |
| `app/src/theme/theme.ts` | All design tokens (colours, spacing, radii, type) |
| `supabase/migrations/` | Every schema change, function and RLS policy, in order |
| `data-scripts/` | `ipoh_extract.py` (clip and check OSM data), `load_to_supabase.py` (load and build the network) `seed_demo.py` (demo reports, photos and walk) and `check_payload.py` (Section 7.4 sizes). `demo-photos/` holds the demo report photos and their credits. `raw/`, `out/` and `.venv/` are git-ignored. |
| `council/` | The council dashboard: a static web page (plain HTML and JS, no build) on GitHub Pages. `config.js` is git-ignored. |
| `.github/workflows/` | `council-pages.yml` deploys `council/` to GitHub Pages |
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

1. **Build the development APK** (first time, and again only when a native package or a permission changes: AsyncStorage in Phase 3, `expo-task-manager` and the walk permissions in Phase 4, Google sign-in, the photo picker, the image resizer and file sharing in Phase 5, `expo-network` in Phase 6). Inside `app/`:
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
4. **Google sign-in on the emulator** needs a system image with Google Play (the Play Store icon in Device Manager), signed in to a Google account in Android Settings. To test with two accounts, add both in Settings, then use **Me**, **Sign out** and sign in with the other one.
5. **Fake your location.** In the emulator, click **...** (Extended controls), then **Location**. Search for a place and click **Set location**:
   - Ipoh Railway Station: 4.597368, 101.073437
   - UTP: 4.38545, 100.97958
6. **Fake a walk** with the demo GPX (see section 5, "Demo reports"):
   1. Set the location to Ipoh Railway Station and restart the app.
   2. Search **Concubine Lane**, pick the **Fastest** card and press Start.
   3. In **Extended controls**, **Location**, choose **Load GPX/KML**, open `data-scripts/out/demo-walk.gpx` and press **Play**. Raise the playback speed to go faster.
   4. Expect turn cards, three hazard banners, then "You have arrived". Start the **Safest** walk instead to see an off-route reroute.

Saving a file reloads the app on the emulator. Shake (Ctrl+M) opens the dev menu.

### First launch

A fresh install shows onboarding once: language (English or Bahasa Melayu), then why Langkah needs location and Android's permission prompt. To see it again, clear the app's data:

```bash
adb shell pm clear com.langkah.app
```

### Testing in Bahasa Melayu

The language picked in onboarding or in **Me**, **Settings** wins. Until one is picked, Langkah follows the phone. To switch only the app to Malay, without changing the whole emulator:

```bash
adb shell cmd locale set-app-locales com.langkah.app --locales ms-MY
```

Switch it back to the system language:

```bash
adb shell cmd locale set-app-locales com.langkah.app --locales ""
```

`adb` lives in `%LOCALAPPDATA%\Android\Sdk\platform-tools`.

## 3. Build an APK to share (demo and testers)

A **preview** APK runs on its own, with no laptop or dev server.

**Once, before the first preview build:** EAS builds from a copy of the repo, and `app/.env` is git-ignored, so the build never sees it. Push its three public `EXPO_PUBLIC_*` values to the EAS "preview" environment (the profile reads it through `"environment": "preview"` in `eas.json`). Without this the APK closes at launch with "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set". Inside `app/`:

```bash
eas env:push preview --path .env
```

Check with `eas env:list --environment preview`. Only the three `EXPO_PUBLIC_*` values belong there; never the service role key. Then build:

```bash
eas build -p android --profile preview
```

Open the build link on an Android phone and install the APK. Android asks once to allow installs from that source. No rooting is needed. To put the latest preview build on the emulator:

```bash
eas build:run -p android --latest
```

**Google sign-in in the preview APK:** EAS normally signs every profile of one app with the same keystore, so the Android OAuth client made for the development build usually covers the preview APK too. To check, run `eas credentials -p android`, pick the **preview** profile and compare its **SHA-1** with the one in Google Cloud console, Credentials. If it differs, create one more **OAuth client ID, Android** with package `com.langkah.app` and the new SHA-1. Nothing changes in the app or in Supabase.

If sign-in fails with DEVELOPER_ERROR, this SHA-1 is the cause; demo mode (section 4) still works.

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
| `…09_reports_community` | Trust rules (votes set status), `profiles`, `report_create`, `report_vote`, `community_reports`, `community_export`, `street_at`, `sync_profile`, nightly expiry on pg_cron |
| `…10_me_ratings_demo` | `walk_ratings` and `rate_walk` (Arrival), `my_reports` and `my_stats` (Me tab), the private `app_flags` demo switch and `app_status` |
| `…11_score_weights` | Table 9 penalties move into `private.score_weights`; `private.score_segments()` rescores without a rebuild (tuning: [docs/user-test-plan.md](docs/user-test-plan.md)) |

The app can call only `search_places`, `route_safe`, `map_in_view`, the report and Community functions above, plus the tables RLS allows. Road data is never read directly by the app.

### Report rules (guide Section 7.2)

| Kind | Starts | Becomes active | Ends |
|---|---|---|---|
| Hazard | Pending | 2 "Still there" from other people, or 1 if it has a photo. Only active hazards change routes. | 7 days after the last "Still there", or at once after 2 "Gone" since the last "Still there" |
| Improvement | Pending | 2 upvotes from other people | Never expires. Ranked by upvotes. |

- The reporter's own report never counts, and nobody votes on their own report. One vote per person per report; changing it counts as a new vote.
- A database trigger changes the status as soon as a vote lands. A pg_cron job (`langkah-expire-reports`, 03:00 Malaysia time) marks hazards past their expiry date as expired.
- Limits: 20 reports per person per day, Ipoh only, note up to 500 characters, photo must be the person's own upload.

### Sign-in setup (once)

Guests read everything. Writing a report or a vote needs Google sign-in (guide Section 5.2, screen 12). Both cost nothing.

1. **Supabase, Authentication, Sign In / Providers:**
   - Turn on **Allow anonymous sign-ins**.
   - Turn on **Allow manual linking** (lets a guest account be linked to Google, so it keeps its id).
   - Turn on **Google**. Paste the Web client ID and client secret from step 2. Leave **Skip nonce check** off.
2. **Google Cloud console** (no billing account needed), APIs and Services:
   - **OAuth consent screen:** External, app name Langkah. While it is in Testing, add every tester's Google account under Test users.
   - **Credentials, Create OAuth client ID, Web application:** this gives the Web client ID and secret for Supabase.
   - **Credentials, Create OAuth client ID, Android:** package `com.langkah.app` and the SHA-1 of the EAS signing key. Get the SHA-1 with `eas credentials -p android` (pick the development profile). EAS usually signs every profile with the same key; if a build shows a different SHA-1, add one more Android client for it (section 3).
3. **`app/.env`:** add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the Web client ID from step 2, see `app/.env.example`). It is public by design; the client secret stays in Supabase only.

### Demo mode (no Google sign-in)

For a class demo, or for testing before the Google setup above is done, guests can be allowed to report and vote. The switch lives only in the database, so nobody can turn it on from the app. In the Supabase dashboard, **SQL Editor**:

```sql
update public.app_flags set demo_open_writes = true, updated_at = now();   -- on
update public.app_flags set demo_open_writes = false, updated_at = now();  -- off
```

While it is on, **Me**, **Settings** shows **Demo mode**. Turn on **Report without signing in** there. **Start as a new guest** gives the phone a fresh guest account, so one emulator can play two people (report, then confirm as the second guest). Every other rule still applies: categories, Ipoh only, 20 reports a day, no votes on your own report. Anonymous sign-ins must be on (step 1). **Turn demo mode off after the demo**, since anyone with the app can post as a guest while it is on.

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

### Demo reports (testing and the demo)

To test hazard banners, routing around hazards and the Community tab without waiting for real reports, add the demo reports: three active hazards on the walk from Ipoh Railway Station to Concubine Lane, one pending hazard, and three improvement requests with upvotes from three demo voters.

Five of them get an example photo from `data-scripts/demo-photos/`: real Malaysian streets from Wikimedia Commons (a broken path edge, a worn crossing, a blocked five-foot way, a flooded road and potholes). They were **not** taken at the Ipoh pins, so each note says where the photo is from. Authors and licences are in [demo-photos/CREDITS.md](data-scripts/demo-photos/CREDITS.md) and in the app under **Settings**, **About**. Uploading them needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `data-scripts/.env` (see `.env.example`; laptop only). Without them the reports are added without photos.

```bash
python seed_demo.py
```

It also writes `out/demo-walk.gpx`, the fastest line of that walk, for the emulator to play back (section 2, step 6). Run it again to refresh them. Remove them before a real launch:

```bash
python seed_demo.py --clear
```

### Council dashboard (web, guide Section 15.7)

A read-only page for MBI: improvement requests ranked by upvotes (with CSV and GeoJSON download), a hazard heatmap, 12-week trends and the most common report types. It calls one function, `council_data`, with the public anon key. No names or user ids. Public for the prototype; staff sign-in comes before a real sale.

**Sample data for the pitch** (about 150 backdated reports over 12 weeks by their own sample accounts; open improvements also show in the app's Community tab):

```bash
python seed_demo.py --council-stats
python seed_demo.py --clear-council-stats
```

`--clear` removes the demo photos the samples use too, so run `--council-stats` again after it.

**Preview on the laptop:** copy `council/config.example.js` to `council/config.js`, fill in the same URL and anon key as `app/.env`, then serve the folder and open http://localhost:8765:

```bash
python -m http.server 8765 --directory council
```

**Put it on GitHub Pages (once):**
1. GitHub repo, **Settings**, **Secrets and variables**, **Actions**, **Variables** tab: add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon key, never the service role key).
2. **Settings**, **Pages**, **Source**: **GitHub Actions**.
3. Push a change in `council/` to `main`, or open **Actions**, **Council dashboard**, **Run workflow** (that button only shows once the workflow file is on the default branch).
4. The page is at `https://affannajiy.github.io/langkah/`.

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

**Payload sizes** (guide Section 7.4). Inside `data-scripts/`, this calls the live API with the public key, the way the app does, and compares each answer with its budget:

```bash
python check_payload.py
```

**Accessibility** (guide Section 5.4): work through [docs/accessibility-check.md](docs/accessibility-check.md) on the preview APK.

**Walk ratings and weights** (guide Section 7.1). Inside `data-scripts/`, read-only:

```bash
python rating_report.py
```

The group test and tuning steps are in [docs/user-test-plan.md](docs/user-test-plan.md). The final full test on the preview APK is [docs/final-test.md](docs/final-test.md).

**Orphaned photos** (an upload whose report was never posted). Inside `data-scripts/`, lists them; add `--apply` to delete them:

```bash
python clean_photos.py
```

## 7. Demo script (oral presentation, 5 minutes)

### The day before

1. Install the latest **preview** APK on the demo phone and on the emulator (section 3). A preview build needs no laptop server.
2. Inside `data-scripts/`, run `python seed_demo.py`. The demo hazards stay active for 7 days, so run it again if the demo is later than that.
3. Turn **demo mode** on (section 4). On the demo device, open **Me**, **Settings** and turn on **Report without signing in**, so nobody waits for a Google sign-in on stage.
4. Language: English. Clear any old walks: `adb shell pm clear com.langkah.app`, then go through onboarding once.
5. Record a screen video of the full run (emulator: **Extended controls**, **Screen record**). It is the backup if the Wi-Fi fails, since routes and reports need the internet.

### On stage

Before starting: emulator location at Ipoh Railway Station (4.597368, 101.073437), `data-scripts/out/demo-walk.gpx` loaded in **Extended controls**, **Location**, not yet playing.

| Time | Show | Say |
|---|---|---|
| 0:00 | Title slide | Walking in Ipoh means broken five-foot ways, worn zebra crossings and floods after rain. Google Maps is built for cars. Langkah looks at the city from the walker's side, the way Waze does for drivers. |
| 0:40 | **Map** tab | The map shows crossings, bus stops and the hazards people reported, as orange diamond signs like Malaysian road signs. |
| 1:00 | Search **Concubine Lane** | Two routes: **Safest**, solid teal, scored on sidewalks, lighting and crossings, and **Fastest**, dashed grey. Safest is a little longer because it goes around three reported hazards. |
| 1:40 | Pick **Fastest**, press **Start**, press **Play** on the GPX | We take the fastest one on purpose. As we walk, Langkah warns by landmark, not by side of the road, because phone GPS is only accurate to 5 to 10 m. Two short vibrations mean a hazard ahead. |
| 2:30 | First hazard banner, tap it | Every hazard comes from a person: here a broken path edge, with a photo. These demo photos are real Malaysian streets from Wikimedia Commons, not these exact spots. |
| 3:00 | **Arrival** screen, tap a face | At the end, one question: how safe did it feel? That rating, never the route itself, helps score the streets. Tap **Spot anything new?** |
| 3:20 | Report flow: **Blocked path**, add a photo, **Send** | Reporting takes three taps. A hazard changes routes only after two other people confirm it, or one if it has a photo. |
| 3:50 | **Community** tab, **Top** | Improvements people want, ranked by upvotes: a zebra crossing at the station has three. The council can export this list as a spreadsheet. |
| 4:20 | **Me**, **Settings**, **Bahasa Melayu** | Every screen works in English and Bahasa Melayu. |
| 4:40 | Closing slide | All on free tools and open data: OpenStreetMap, Supabase and MapLibre, so it costs RM0 to run for the pilot. Next: more pilot areas such as Seri Iskandar, and offline maps. |

### If something goes wrong

| Problem | What to do |
|---|---|
| No internet | Play the backup video. Say the app needs data for routes, and offline maps are planned. |
| No hazard banner | You started **Safest**. Go back and start **Fastest**. |
| GPX does not move | Press **Play** again in **Extended controls**, or raise the playback speed. |
| Report fails with "sign in" | Demo mode is off in the database or in Settings (step 3). Skip to Community and show the existing reports. |

### After the demo

1. Turn demo mode **off** (section 4).
2. Before a real launch, remove the demo data with `python seed_demo.py --clear`.

## How we work

- Work follows the phases in [KICKOFF_PROMPT.md](KICKOFF_PROMPT.md). Each phase ends with a summary, emulator test steps and a review before the next one starts.
- One feature branch per phase (for example `feat/phase-3`) with small, clear commits.
- Ask before adding a dependency, changing the schema outside a migration, or anything that costs money.

## Security

- Only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` go in the app. All three are public by design: RLS protects every table, and a Google client ID is sent with every sign-in. The Google **client secret** lives only in the Supabase dashboard.
- The **service role key** and the **database password** never go in the app, in git or in chat. `.env` files are git-ignored; keep the `.env.example` files up to date.
- Every new table turns on RLS in the same migration that creates it.
- Location stays on the phone. It is only sent as the start of a route request (including a reroute) and never stored.
- During a walk, location runs as a foreground service with a visible notification and stops when the walk ends. Langkah never asks for "Allow all the time" location (`ACCESS_BACKGROUND_LOCATION` is blocked).
- Guests (Supabase anonymous accounts) can read but never write. RLS checks for a Google-signed-in account on every report, vote and photo upload. The one exception is demo mode, a database-only switch (section 4) that lets guests write while it is on.
- Walk ratings store only the rating, day or night, route kind, score and length. No route line, start or end point.
- Deleting a report asks first (the app's only dialog, since it cannot be undone). The photo file is removed too.
- `reports.user_id` is never returned to the app. A first name (from Google) is shown only when the reporter turns off "Post anonymously". Emails are never shown.
- Report photos are re-encoded on the phone (about 1280 px, JPEG 70%), which drops EXIF and GPS tags. File names are random, so a photo URL does not identify anyone.
- The council export holds no names or user ids. Notes that start with `=`, `+`, `-` or `@` are escaped so a spreadsheet never runs them.
- Quick reports and Still there / Gone answers made as a guest, or with no signal, wait on the phone and are sent after sign-in. Sign-in is never asked for during a walk.
- The camera permission is asked for only when the user taps Take photo. The microphone permission is blocked.

## Troubleshooting

| Problem | Fix |
|---|---|
| Dev launcher cannot find the server | Make sure `npx expo start` is running in `app/`, then enter `http://10.0.2.2:8081` in the launcher. |
| App crashes after `npm install` added a native package (for example "Cannot find native module 'ExpoTaskManager'") | Build a new development APK (section 2, step 1). |
| "Google sign-in is not set up in this build yet" | Add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to `app/.env` and restart `npx expo start`. |
| Google sign-in fails with "Could not sign in" (DEVELOPER_ERROR in the log) | The Android OAuth client's SHA-1 does not match the build's keystore, or the package name is wrong (section 4, sign-in setup). |
| "Google Play services is missing" | Use an emulator image with the Play Store, and sign in to a Google account in Android Settings. |
| Reports never appear for a guest, or every write fails | Check **Allow anonymous sign-ins** and **Allow manual linking** are on in Supabase. |
| Onboarding shows every launch | The app cannot save on the phone. Check storage on the emulator, or clear the app's data once (`adb shell pm clear com.langkah.app`). |
| Demo mode is missing from Settings | The database switch is off (section 4, demo mode). Reopen the app after turning it on. |
| No hazard banner during the demo walk | Run `python seed_demo.py` again (hazards are active for 7 days), and start the **Fastest** walk, since Safest avoids the hazards. |
| The phone does not vibrate on the emulator | The emulator has no vibration motor. Check `adb shell dumpsys vibrator_manager`, or test on a real phone. |
| Map is blank | Check the emulator has internet. Tiles come from OpenFreeMap. |
| "Outside the pilot areas" | Set the emulator location inside one of the pilot boxes (section 2, step 4). |
| Search or routes fail | Check `app/.env`, then the Supabase project status in the dashboard. |
| A small gear button floats over the map | That is the Expo dev menu in development builds. Preview APKs do not have it. |

## Credits

Map data © OpenStreetMap contributors (ODbL 1.0). Tiles by OpenFreeMap / OpenMapTiles. Font: Atkinson Hyperlegible Next by the Braille Institute (SIL OFL). Icons: Lucide (ISC). Demo report photos: Wikimedia Commons, by Encik Tekateki, Wiki Asmah, Two hundred percent and Taufik (CC BY-SA and CC BY, see [data-scripts/demo-photos/CREDITS.md](data-scripts/demo-photos/CREDITS.md)).
