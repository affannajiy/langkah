# Langkah: Claude Code kickoff prompt

## How to use this
1. **Set up the repo.**
   - Create an empty folder called `langkah` and copy in everything from this kit (see `SETUP_CHECKLIST.md`, Part B).
   - Run `git init` in the folder.
   - Make sure `CLAUDE.md` sits at the top level, which is where Claude Code reads it automatically.
2. **Start Claude Code.** Open the folder in VS Code, open a terminal there and run `claude`.
3. **Send the prompt.** Paste everything inside the box below as your first message.
4. **Work phase by phase.** Claude Code stops after each phase. Test on the emulator, then reply "OK, next phase", or say what to fix.

---

```text
You are the lead developer for Langkah, a pedestrian safety and navigation Android app for central Ipoh, Malaysia. It is a university Technopreneurship project (UTP, Group 4) with a working MVP due by Week 9 and a live demo in Weeks 11 to 12. The app treats the walker the way Waze treats the car: safest walking routes, live hazard alerts while walking, community hazard and improvement reports, an amenity layer, and a ranked improvement dataset for the city council.

READ FIRST, BEFORE ANY CODE
1. CLAUDE.md (project rules; they always apply)
2. docs/Langkah Tech Stack.md (source of truth). Sections 2 to 9 matter most:
   scope, stack, architecture, screen plan, design direction, data strategy, data model, software.
3. docs/langkah-colour-scheme.md and docs/Langkah Architecture.png
4. docs/screens/*.png: the FINAL screen designs, logo, loading screen and wordmark. Open every image; they are the visual spec each screen must match.
5. data-scripts/ipoh_extract.py (already written and tested on sample data)

Then reply with:
(a) a 10-line summary of what you understood,
(b) any conflicts, gaps or risks you see in the guide,
(c) the exact packages and versions you plan to install for Phase 0, after checking which Expo SDK is current.
Wait for my OK before writing code.

BUILD IN THESE PHASES. Stop at the end of each one with a summary and emulator test steps.

PHASE 0: Foundations
- Create the monorepo layout from CLAUDE.md: root README with setup steps, .gitignore, .env.example.
- Expo app, TypeScript strict, Expo Router with tabs Map, Community, Me. Android package id: com.langkah.app.
- Theme file with the colour, spacing, radius and type tokens. Load the Atkinson Hyperlegible Next font. i18n scaffold with en.json and ms.json.
- App icon, Android adaptive icon and splash screen from assets/logo/ (CLAUDE.md, Final design), so the first dev build already shows the Langkah logo and "Lebih selamat".
- MapLibre map on the Map tab with the OpenFreeMap Positron style, framed on central Ipoh (lon 101.068 to 101.100, lat 4.583 to 4.612), OSM credit visible, user location dot.
- eas.json with a "development" profile (developmentClient, internal distribution, APK) and a "preview" profile (APK). Add the location permission text in EN and BM.
- Done when: the dev build APK runs on the Android Emulator and shows central Ipoh with my location dot.

PHASE 1: Database and data
- Supabase migrations: enable postgis, pgrouting and pg_trgm. Create the road_segments, reports, report_votes, amenities and places tables from Section 8, with RLS in the same migration. Create a report-photos storage bucket with size and type limits.
- data-scripts/load_to_supabase.py: load walk-network.geojson and amenities.geojson (outputs of ipoh_extract.py) and OSM place names into the tables. Build the routing topology. Compute score_day and score_night using the penalty table in Section 7.1. Treat separate sidewalks (footway=sidewalk) and crossings (footway=crossing) as first-class edges (Section 7.5).
- Done when: SQL queries show scored segments for central Ipoh and a coverage summary matching coverage-report.md.

PHASE 2: Search and routing API
- search_places(q): fuzzy search with pg_trgm, top 10 results, name + area + coordinates.
- route_safe(start_lon, start_lat, end_lon, end_lat, mode 'day'|'night'): returns BOTH the safest and the fastest route. Each has an encoded polyline, distance, walking time at 1.3 m/s, safety score 0-100, reason stats (% with sidewalk, % lit, marked crossings, hazards on route, % not yet checked) and turn steps with street or landmark names.
- Active confirmed hazards add their penalty at query time.
- Done when: test calls between real Ipoh places (for example Ipoh Railway Station to Ipoh Parade) return sensible routes, with payloads under 2 KB each.

PHASE 3: Core screens (Section 6.3, screens 1 to 3). Match docs/screens/Main.png, Search.png and RouteCompare.png; later phases match their screens the same way.
- Map home: search pill, day/night chip, saved-place chips, Layers button, peek sheet, Report FAB.
- Search sheet.
- Route compare sheet: Safest and Fastest cards with reason chips. Both lines on the map, styled per the route-line rules.
- Done when: I can search a place, see both routes and pick one, in EN and BM.

PHASE 4: Walking navigation (screens 4 and 5)
- Navigation screen: instruction card with landmark, heading-up map, bottom bar with time and distance left, End and Quick report buttons.
- Off-route detection and reroute.
- Non-blocking hazard banner within about 50 m of a hazard on the active route: two-pulse haptic, Still there / Gone buttons, auto-hide after about 6 s.
- Quick report sheet: 6 tiles, 3 s auto-send with Undo, offline queue.
- Background location only during an active walk, asked for at the first walk.
- Done when: playing an emulator GPS route through Ipoh Old Town triggers turns, a hazard banner and arrival.

PHASE 5: Reports and community (screens 6 and 7)
- Guest = Supabase anonymous sign-in. Google sign-in only at the first report or vote, as a sheet, with the anonymous account linked.
- Report flow sheet in 4 steps: Hazard/Improvement, category, draggable pin, optional photo (resized) and note, "post anonymously" on by default.
- Community tab: Hazards and Improvements, list/map toggle, status chips, votes, report detail sheet.
- Sort by Top, Newest or Nearest. "Most requested in Ipoh" with CSV and GeoJSON export.
- Nightly expiry and confirmation rules from Section 7.2 using pg_cron and an Edge Function.
- Done when: two emulator accounts can report, confirm and upvote, and the routing reacts to an active hazard.

PHASE 6: Arrival, Me, onboarding, polish
- Arrival screen with stats, safety rating and "Spot anything new?".
- Me tab: my reports with status, saved places, contribution stats. Settings. Layers sheet. Automatic night map style.
- Onboarding: language, why location, permission.
- Empty and error states: no GPS, offline, no route, nothing nearby. Full BM translation pass.
- Done when: a first-time user can go from install to a finished walk without help.

PHASE 7: Demo readiness
- Preview APK build. Check payload sizes against Section 7.4 and the accessibility rules in Section 5.4.
- A demo-data seed script with sample reports on the pilot corridor, and a README demo script for the oral presentation.

GENERAL
- Keep every phase shippable. If something in the guide is unclear or looks wrong, ask instead of guessing.
- Before using any library API, check the installed version's docs.
- Keep a short CHANGELOG.md updated at the end of each phase.
```
