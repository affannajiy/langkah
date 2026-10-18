# Langkah: developer guide

Everything needed to set up, run, build, seed and demo Langkah. The overview is in the [README](../README.md); the full design is in the [guide](Langkah%20Tech%20Stack.md).

## Contents

- [Repository layout](#repository-layout)
- [1. Set up a Windows laptop](#1-set-up-a-windows-laptop-once)
- [2. Run the app on the Android Emulator](#2-run-the-app-on-the-android-emulator)
- [3. Build an APK to share](#3-build-an-apk-to-share-demo-and-testers)
- [4. Backend (Supabase)](#4-backend-supabase)
- [5. Map data (OpenStreetMap)](#5-map-data-openstreetmap)
- [6. Checks](#6-checks)
- [7. Demo script](#7-demo-script-oral-presentation-5-minutes)
- [How we work](#how-we-work)
- [Troubleshooting](#troubleshooting)

## Repository layout

| Folder | Contents |
|---|---|
| `app/` | The Expo app. Screens live in `app/src/app/` (Expo Router). |
| `app/src/api/` | Supabase client and typed calls: `langkah.ts` (search, routes, map view), `reports.ts` (reports, votes, Community, photos), `points.ts` (wallet, shop, top-up, ads) |
| `app/src/auth/` | Guest session, Google sign-in (linked to the guest account) and the sign-in sheet |
| `app/src/features/map/` | Map tab pieces: search sheet, compare sheet, trip bar, home controls, layers |
| `app/src/app/navigate.tsx` | The walking screen, shown above the tabs |
| `app/src/app/arrival.tsx`, `settings.tsx`, `welcome.tsx` | Arrival screen, Settings, and first-launch onboarding (language, why location) |
| `app/src/features/nav/` | Walking screen pieces: instruction card, hazard banner, bottom bar, quick report sheet, route layers |
| `app/src/features/report/` | The 4-step report flow sheet and the category icons |
| `app/src/features/community/` | Community tab pieces: rows, detail sheet, map view, votes |
| `app/src/app/shop.tsx`, `plus.tsx`, `topup.tsx`, `ad.tsx` | Shop, Langkah Plus, mock top-up and mock ad screens |
| `app/src/features/points/`, `topup/`, `ads/` | Wallet cards, voucher and low-points sheets, the mock bank and e-wallet steps, the parody ad brands |
| `app/src/points/` | Points snackbar, Plus status, partner offer text |
| `app/src/route/` | Route card reasons (the chips) |
| `app/src/api/share.ts`, `notices.ts`, `streets.ts`, `badges.ts` | Live walk share, council news, street checks and badges (Phase 18) |
| `app/src/nav/liveShare.ts`, `nav/voice.ts` | Sends the latest position while a share is live; spoken guidance |
| `app/src/weather/` | Rain and heat from Open-Meteo for the pilot area (Phase 18) |
| `app/src/features/arrival/` | Street checks on the Arrival screen (Phase 18) |
| `app/src/route/routeCache.ts`, `route/warmUp.ts`, `storage/searchCache.ts` | Route and search caches, server warm-up at launch (Phase 19) |
| `app/src/features/nav/WalkerPuck.tsx`, `nav/useCompass.ts` | The walker arrow, compass cone and GPS ring on the walk map (Phase 19) |
| `app/src/theme/motion.ts`, `components/ScalePressable.tsx` | Shared motion: Reduce Motion, enter, press scale (Phase 19) |
| `app/plugins/` | Config plugins (`withNetworkPing.js`: HTTP/2 pings so requests recover after a network change) |
| `app/src/nav/` | Walk engine: line snapping, off-route and arrival, haptics, walk location service |
| `app/src/map/` | Map config (pilot areas), pins, route lines, user dot, location hooks |
| `app/src/components/` | Shared UI: text, buttons, sheets, chips, route cards, snackbar |
| `app/src/storage/` | On-phone storage: settings, saved and recent places, the report queue |
| `app/src/net/` | Online or offline, for the offline banners |
| `app/src/i18n/locales/` | `en.json` and `ms.json` |
| `app/src/theme/theme.ts` | All design tokens (colours, spacing, radii, type) |
| `supabase/migrations/` | Every schema change, function and RLS policy, in order |
| `data-scripts/` | `ipoh_extract.py` (clip and check OSM data), `load_to_supabase.py` (load and build the network), `seed_demo.py` (demo reports, photos, walk, council and partner samples), `check_payload.py` (Section 7.4 sizes), `rating_report.py`, `partner_report.py` and `clean_photos.py`. `demo-photos/` holds the demo report photos and their credits. `raw/`, `out/` and `.venv/` are git-ignored. |
| `council/` | The council dashboard and the live walk page (`walk.html`): static web pages (plain HTML and JS, no build) on GitHub Pages. `config.js` is git-ignored. |
| `.github/workflows/` | `council-pages.yml` deploys `council/` to GitHub Pages |
| `docs/` | The guide, colour scheme, architecture diagram, final screen PNGs, revenue plan, and the test checklists and notes |
| `.easignore` | What EAS leaves out of the build upload. It replaces `.gitignore` for EAS, so keep the two in step. |
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

See [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md) for the full list of tools and free accounts.

## 2. Run the app on the Android Emulator

Expo Go cannot run MapLibre, so we use our own **development build**: an APK with the native code, which loads the JavaScript live from your laptop.

1. **Build the development APK** (first time, and again only when a native package or a permission changes: AsyncStorage in Phase 3, `expo-task-manager` and the walk permissions in Phase 4, Google sign-in, the photo picker, the image resizer and file sharing in Phase 5, `expo-network` in Phase 6, `expo-build-properties` in Phase 15, `expo-speech` in Phase 18). Inside `app/`:
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

The prototype is English only: `ENGLISH_ONLY` in `app/src/i18n/index.ts` is `true`, so the language choice is hidden and the steps below have no effect. Set it to `false` to bring Malay back.

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
| `…11_score_weights` | Table 9 penalties move into `private.score_weights`; `private.score_segments()` rescores without a rebuild (tuning: [docs/user-test-plan.md](user-test-plan.md)) |
| `…12_points_and_demo` | `point_ledger`, `point_balances`, the earn functions with daily caps, daily check-in, the demo account and Reset demo |
| `…13_shop_topup_plus` | `shop_items`, `user_items`, `shop_buy`, `plus_buy`, `cosmetic_use`, `topup_mock`, `ad_finish`. Turns off the default EXECUTE grant on `public` |
| `…14_partners` | `partners`, sponsored pins in `map_in_view`, `partner_seen` counts |
| `…15_council_dashboard` | `council_data(p_days)` for the dashboard |
| `…16_final_test_fixes` | `points_add` spend fix, points taken back on report delete, unchecked streets lower the shown score |
| `…17_walk_detail` | `road_segments.covered`, the new amenity kinds, covered lines in `map_in_view` and `route_safe` (`stats.cov`) |
| `…18_live_share` | `walk_shares` (latest position only), `share_start`, `share_update`, `share_stop`, `share_view`, cleanup every 10 minutes on pg_cron |
| `…19_route_options` | `route_safe` gains `p_cover` (prefer cover, rule `uncovered_weather`) and `p_step_free` (no stairs, `stats.kx`) |
| `…20_fixed_loop` | `reports.council_status`, `private.council_staff`, `council_set_status`, `user_notices`, `my_notices`; `cs` in Community, Me and the dashboard |
| `…21_street_checks` | `street_answers`, `private.street_facts`, `street_answer`, street questions (`q`) on routes, a scoped rescore |
| `…22_badges` | `my_badges()`: eight badges and the weekly walk streak |
| `…23_search_nearby` | `search_places` ranks by match, then distance from the user |
| `…24_cover_never_less_safe` | With prefer cover on, Safest is never less safe than the plain Safest |
| `…25_fix_batch` | Phase 20: the demo crew and Afrina, `reports.is_demo` (demo data stays in the demo), `street_asks` (answers only for streets the app asked about), the `route_safe` rate limit, walk ids so a retried walk is saved once, the amenities count on routes |

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

Five of them get an example photo from `data-scripts/demo-photos/`: real Malaysian streets from Wikimedia Commons (a broken path edge, a worn crossing, a blocked five-foot way, a flooded road and potholes). They were **not** taken at the Ipoh pins, so each note says where the photo is from. Authors and licences are in [demo-photos/CREDITS.md](../data-scripts/demo-photos/CREDITS.md) and in the app under **Settings**, **About**. Uploading them needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `data-scripts/.env` (see `.env.example`; laptop only). Without them the reports are added without photos.

```bash
python seed_demo.py
```

It also writes `out/demo-walk.gpx`, the fastest line of that walk, for the emulator to play back (section 2, step 6). Run it again to refresh them. Remove them before a real launch:

```bash
python seed_demo.py --clear
```

### Council dashboard (web, guide Section 15.7)

A page for MBI: improvement requests ranked by upvotes (with CSV and GeoJSON download), a hazard heatmap, 12-week trends and the most common report types. It reads with one function, `council_data`, and the public anon key. No names or user ids. Reading is public for the prototype.

**Staff sign-in (Phase 18, once):** staff mark a request Planned or Fixed; the reporter is told in the app and gets +50 points when it is fixed.
1. Supabase dashboard, **Authentication**, **URL Configuration**, **Redirect URLs**: add `https://affannajiy.github.io/langkah/` (and `http://localhost:8765/` for the laptop preview).
2. The staff member needs a Supabase account with that email (a Google sign-in in the app counts, or **Authentication**, **Users**, **Add user**). Nobody can sign up from the page.
3. Put the email on the staff list in the **SQL editor** (never in git):
   ```sql
   insert into private.council_staff (email, name) values ('someone@mbi.gov.my', 'Name');
   ```
4. On the page: **Staff sign in**, enter the email, open the link from the email on the same device.

Supabase's built-in mailer sends only a few emails an hour, which is enough for staff.

**Live walk page (Phase 18):** `walk.html?t=TOKEN` deploys with the dashboard; the app's Share button links to it. Nothing to set up.

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

**Accessibility** (guide Section 5.4): work through [docs/accessibility-check.md](accessibility-check.md) on the preview APK.

**Walk ratings and weights** (guide Section 7.1). Inside `data-scripts/`, read-only:

```bash
python rating_report.py
```

The group test and tuning steps are in [docs/user-test-plan.md](user-test-plan.md). The final full test on the preview APK is [docs/final-test.md](final-test.md).

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

**Extras to swap in (Phases 18 and 19),** if there is time or instead of a row above:

| Show | Say |
|---|---|
| During the walk, tap **Share**, then **Share link**; open the link on a laptop | A friend follows the walk live until you arrive. Only the latest position is kept, and it is deleted on arrival. |
| The speaker button on the walk screen | Voice guidance in English, after the vibration, for walkers who keep the phone in a pocket. |
| Route compare when it rains, or tap **Prefer cover** | Safest leans onto five-foot ways and covered paths. |
| **Arrival**: answer a street check | Almost every street is unchecked in OpenStreetMap. Two walkers agreeing fill the gap and the street is rescored at once. |
| Council page: **Staff sign in**, **Mark fixed** | The council closes the loop. The reporter is told in the app and earns 50 points. |
| **Me**, **Badges** | Badges and a weekly walk streak; they never buy ranking. |
| **Start** a walk, then the view button (3D, 2D, North) | The camera swoops down behind the walker like a car sat-nav, with buildings in 3D. One tap flattens it, another turns north up. |

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

- Work follows the phases in [KICKOFF_PROMPT.md](../KICKOFF_PROMPT.md). Each phase ends with a summary, emulator test steps and a review before the next one starts.
- One feature branch per phase (for example `feat/phase-3`) with small, clear commits.
- Ask before adding a dependency, changing the schema outside a migration, or anything that costs money.

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
