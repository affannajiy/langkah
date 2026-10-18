# Final test notes (2026-10-17)

Build `e5808c9a` (commit 6fa9d5b), Pixel_8 emulator, fresh install. Results are in `final-test.md` (G and N rows use its **Run 1 #** column, F rows its **#** column); this file keeps the detail, the bugs and the ideas for the optimisation phase.

## Blockers

| # | Found in | Problem | Fix |
|---|---|---|---|
| B1 | Row 2 | Live Supabase has **anonymous sign-ins turned off** (`/auth/v1/settings` gives `anonymous_users: false`). Guest sign-in fails, so every RPC fails with "permission denied": `partner_seen`, `walk_finish`, and so on. `supabase/config.toml` says `true`, so the live project drifted. | Dashboard: Authentication, Sign In / Providers, Allow anonymous sign-ins, **then Save changes**. Fixed 2026-10-17. |
| B2 | Rows 38, 40 | **Every points spend fails** (voucher, Plus, cosmetics): "Could not finish. No points were spent." `points_add` upserts `point_balances` with `values (p_user, v_amount)`; for a spend that is negative, and Postgres checks `CHECK (balance >= 0)` on the proposed insert row before `ON CONFLICT` runs. Reproduced in SQL as the demo user (rolled back). | New migration replacing `points_add`: `insert ... values (p_user, 0, now()) on conflict do nothing;` then `update point_balances set balance = balance + v_amount`. The `not_enough` check in `shop_buy` already guards the floor. |

## Bugs

| # | Found in | Problem | Idea |
|---|---|---|---|
| G1 | Row 14 | When a server call fails (for example `walk_finish`) the user sees nothing, and the rating looks saved. | A snackbar: "Could not save, try again". |
| G2 | Rows 7 and 8 | Scoring looks wrong. Concubine Lane from the station: Safest is 8% sidewalk, 0 marked crossings, "100% not yet checked", scores **91**; Fastest is 30% sidewalk, 1 marked crossing, scores **80**. Unknown streets seem to count as good. | Check the scoring weights for unknown sidewalk and lighting (guide Section 7). Retest 2026-10-17: Safest 94 with 6% sidewalk, 0% lit, 100% not yet checked, while the sheet itself says unchecked streets "are not counted as safe". Night: 88 with 0% lit. |
| G3 | Row 9 | At night the "Night scoring" chip is wider and pushes the star button onto its own line. | Fixed chip width, or an icon-only star on the same row. |
| G4 | Row 9 | At night the status bar icons stay dark on the dark map. | Light status bar style when the map is dark. |
| G5 | Row 7 | The "Fastest · 6 min" route label sits on top of the end pin. | Place labels at the middle of each line, away from the ends. |
| G6 | Row 7 | Light blue crossing pins pile on top of each other in clusters (3 or 4 overlapping squares near Club Road and Panglima). | Cluster or hide overlapping crossing icons below a zoom level; `iconAllowOverlap: false` for crossings. |
| G7 | Row 8 | The route breakdown has no amenities line (the test expects one). | Add amenities (shelters, lit stops) to the breakdown, or drop it from the test. |
| G8 | Row 11 | After a guest taps Still there, the map banner says "1 report is waiting on this phone". It is a vote, not a report. | Word it "1 answer is waiting" or count votes and reports apart. |
| G9 | Row 23 | Me, Starred places shows a raw `{{n}} of 3`. `en.json` `starred.count` uses `{{n}}`, but `me.tsx:500` passes `count`. | Change the string to `{{count}} of {{max}}` (both locale files). |
| G10 | Row 23 | The Delete report confirm is the stock Android alert (system font, uppercase teal buttons), not the Langkah style. | A small branded dialog component (still a dialog, since it cannot be undone). |
| G11 | Row 23 | Deleting your own report keeps its +10 points, so post and delete can farm points up to the daily cap. | Reverse the ledger line on delete, or only pay once the report is confirmed. |
| G12 | Row 12 | After a reroute the arrival screen said "3 hazards avoided" while 2 hazard banners showed on the new line. The count comes from the first route. | Count hazards on the walked line, or say "flagged" as on the Fastest walk. |
| G13 | Row 12 | The same GPX walked gives 650 m on Fastest but 550 m on Safest after a reroute. Distance seems to drop the part before the reroute. | Sum the trail, not the route. |
| G14 | Row 37 | After the 5th ad the button still reads "Ad +20"; the cap shows only after a tap. | Grey the button and show "5 of 5 today". |
| G15 | Row 36 | Bank list: "Afnan Bank, AfnanOnline online". | Drop the second "online". |
| G16 | Row 19 | Hazard cards: Pending has a chip with icon and word, Active has none (test expects both). | Add an Active chip. |
| G17 | Row 25 | After a cold start the map opens zoomed out on the whole city ("Zoom in to see hazards") instead of near the user. | Start at the last camera, or at the user at street zoom. |
| G18 | Row 44 | Council CSV and GeoJSON use codes (`street_lights`, `zebra_crossing`) instead of the English labels. | Add a readable type column. |

## Emulator-only notes (not app bugs)

- The locate button uses `Accuracy.Balanced`, and the emulator gives no Balanced fix without a mock network provider. It works on a real phone. Test setup: `adb shell cmd location providers add-test-provider gps|network`, then `set-test-provider-location ... --accuracy 5`.
- Release builds block `run-as`, so exported files cannot be pulled from the app; check the export code instead.
- Haptics can be checked on the emulator: `adb shell dumpsys vibrator_manager` lists every pulse with its length (turn about 150 ms, hazard about 430 ms pattern, arrival 700 ms).
- After `-wipe-data` the photo picker is empty: `adb push` a JPEG to `/sdcard/Pictures` (with `MSYS_NO_PATHCONV=1` in Git Bash) and send a media scan broadcast.
- Test fixes need `--accuracy 5`: the walk drops anything worse than 30 m (`walkLocation.ts`), so a 100 m mock fix leaves the walk stuck on "Walk to the start of the route".

## Ideas for the optimisation phase

- APK is 154 MB and the EAS upload is 299 MB. Add an `.easignore`; check for split ABIs (`arm64-v8a` only for the Honor) and unused assets.

## Fix batch (build b5390a00)

All retested on the emulator on 17 Oct 2026 and passing: rows 38, 39, 40; G2 (72 and 37 by day, 69 and 29 at night, same lines); G3; G4; G9 ("0 of 20" with Plus); G11 ("Report deleted, points taken back -20"); G12 and G13 (same GPX: 650 m, 1 hazard avoided); G14; G15; G16.

| # | Fix | Where |
|---|---|---|
| B2 | `points_add` makes sure the balance row exists, then runs an `UPDATE`. Checked in SQL (rolled back): voucher and Plus go through. | Migration 16 |
| G2 | New display-only weight `unchecked_score` 0.8: an all-unchecked route shows about 74, not 94. Routing weights unchanged (raising `unchecked` made Safest walk through hazards). Guide Section 7.1 updated. | Migration 16 |
| G11 | Deleting your own report takes back its photo bonus and confirmation points (capped at the balance). New ledger reason `report_deleted`. | Migration 16, `WalletCards.tsx` |
| G3 | Mode chip and star are kept in one group; the title may wrap instead. | `CompareSheet.tsx` |
| G4 | Light status bar icons while a map screen is focused at night. | `useMapStatusBar.ts` |
| G9 | `starred.count` uses `{{count}}`. | `en.json`, `ms.json` |
| G12 | Hazards met = most of first line, line after reroute, and banners shown. | `navigate.tsx` |
| G13 | Reroute adds the stretch walked off the line. | `useWalk.ts` |
| G14 | Ad button reads "Ads done" and dims after the 5th ad. | `WalletCards.tsx` |
| G15 | Afnan Bank product is "AfnanGo". | `providers.ts` |
| G16 | Hazard rows show Pending or Active. | `ReportRow.tsx` |

Left for the optimisation phase: G1, G5, G6, G7, G8, G10, G17, G18, and the 66 lint findings already in the project.

## Demo upgrade test (build 47d6f7eb, 18 Oct 2026)

Pixel_8 emulator, installed over the old build, then `pm clear` and Try the demo. GPX played as mock gps and network fixes, 1.5 s per point. Rows 46 to 51 and 54 to 56 pass. Rows 52 and 53 (staff sign-in by email link, Fixed loop) are left for you.

| # | Found in | Note | Idea |
|---|---|---|---|
| N1 | Row 50 | With cover on (turned on by the rain forecast), Safest becomes the 700 m route with 1 hazard and score 59. Off, Safest is the 900 m route with no hazards and score 69. Cover can pull Safest onto a less safe line. | Check the cover bonus weight against hazards, or name the line "Safest with cover" when they differ. |
| N2 | First launch | At night the status bar icons were dark on the dark map on the first map screen after install. After leaving and coming back they were light (G4 fix works then). | Set the light style on first focus too. |
| N3 | Row 47 | In a browser that opened small, the friend's map stayed at 400 x 300 in the corner until a reload. Seen only in the Claude browser pane, not checked on a phone. | Call `map.resize()` on load, or check on row 45's phone. |

Still open from before: G5 route label on the end pin, G6 crossing pins pile up near the station.

## Feel upgrade (Phase 19, 18 Oct 2026)

N1, N2 and N3 are fixed in Phase 19 (guide Section 17.6); retest in `final-test.md` rows 66 to 68. N1 checked on the server: Station to Concubine Lane with cover on keeps the 827 m line, score 72, no hazards, and `route_safe` still answers in about 0.34 s.

### Feel upgrade test (18 Oct 2026)

Pixel_8 emulator. Rows 57 to 64 and 66 to 69 pass; rows 58 and 64 after a fix and a rebuild. Row 65 needs a phone outside.

| # | Found in | Note | Idea |
|---|---|---|---|
| N4 | Row 58 retest | Opened with location services off and "No thanks" on Google's dialog, then location turned on: the app stayed without a position (Choose a start point) until it was restarted. `useHere` tries the watch once and does not retry. | Restart the watch when the app comes back to the front or the location setting changes. |
| N5 | Row 58 retest | On a cold start, taps on the search bar did nothing for the first few seconds after the map showed. | Check what holds the JS thread at launch (cache loads, warm-up). |
| N6 | Row 64 | At night the navy walker arrow on the navy map is readable only by its white edge. | Light-blue fill at night. |

### Fixes before the full test (Phase 19)

Built before the full test (guide Section 17.8): N4 (location comes back without a restart), N6 (light-blue walker at night), G1 (arrival says when the walk could not be saved, with Try again), G8 (waiting banner says "report or vote"). Retest in the new `final-test.md`: row 10 (N4), 31 (N6), 33 (G8) and 40 (G1). Still open: N5 (slow taps on a cold start), G5, G6, G7, G10, G17, G18.

## Full test (Phase 20, preview APK with Phase 19)

Build: `5fdee194` (EAS lists commit b07e5b8 because 7065da4 was committed 1.5 min after the build started; the bundle has the Phase 19 strings), commit 7065da4, date 18 Oct 2026. Devices: Pixel_8 emulator (Android 15, zone Asia/Kuala_Lumpur) and the laptop. The Honor phone was not tested, so the phone rows are Skip. Row numbers are the **#** column of `final-test.md` (Run 2).

Result: 63 Pass, 3 Fail (rows 10, 15, 40), 10 Skip (47, 66 to 74). Retests: N6 (row 31) and G8 (row 33) are fixed; N4 (row 10) and G1 (row 40) still fail. Known open items seen again: G5 and G6 (pins pile up at the station), G7 (row 16), G10 (stock dialogs: Reset demo, redeem, Get, Get Plus), G17 (cold start opens zoomed out on the city), G18 (council CSV codes). N5 not seen.

Static checks: `tsc` clean; lint 0 errors, 88 warnings (66 before Phase 19). No secrets tracked in git; RLS on for every table; every security definer function sets `search_path`; pg_cron jobs succeed.

| # | Row | Problem | Idea |
|---|---|---|---|
| F1 | 42 | **High.** With `demo_open_writes` on, any "Try the demo" guest can call `street_answer` for any named street: nothing checks that they walked it. Afrina agrees at once, so the fact is applied and routes are rescored for everyone. This test left live facts: lit=yes on Jalan Dato Sagor (osm 98614413) and sidewalk=yes on 98614413 and 784975870 (`street_answers` ids 13 to 18). Reset demo does not remove them. | Keep demo answers demo-only (Afrina agrees, but no road fact is written), or require a finished walk whose route has that osm_id. Remove the 3 test facts and their answers. |
| F2 | 35, 43 | Demo reports reach everyone: Afrina's automatic confirm can make a demo hazard (and a demo report with a photo) active on the public map, and pays the guest +20. | Show demo reports only to that demo user, or never let Afrina's vote activate a report. |
| F3 | 10 | **Fail, N4 retest.** Location services off on a cold start: Google's Location Accuracy dialog comes back after every "No thanks" (5 times in logcat), so the map can't be reached. In `useHere.ts` AppState 'active' (the dialog closing) starts a new attempt and `watchPositionAsync` asks again. The "leave and come back with location on" half works (found in < 5 s). | Retry on 'active' only when location services changed (check `hasServicesEnabledAsync` first), or at most once per refusal. |
| F4 | 40 | **Fail, G1 retest.** The "Could not save this walk" snackbar with Try again shows, but hides after 5 s (`SHOW_WITH_ACTION_MS`) and is the only way to retry. Turning data back on takes longer, so the walk is never saved (seen twice). | Queue the walk like reports (`reportQueue`) and send it when back online; keep a retry row on the Arrival screen until it is saved. |
| F5 | 15 | With Safest selected, the dashed Fastest line can't be seen: the first stretch is under Safest, the rest under its own "Fastest · 8 min" tag and the hazard pins. Visible only after tapping Fastest. | Draw the unselected line so it shows beside or above the selected one; put its tag on a stretch the two routes don't share. |
| F6 | 3, 45, 46, 65 | Demo duplicates: each "Try the demo" makes a new guest and `demo_fill` deletes only that guest's rows, so old demo reports stay. Now 5 x "Demo: street light out", 5 x "Demo: no ramp for prams" (an improvement: never expires, ranked on the council page and in its CSV), 4 x "broken drain cover". 16 anonymous users were made today. Each demo confirm also extends the seeded hazards' life. | Flag demo rows and delete all of them in `demo_fill`, or reuse one demo account; a pg_cron job to drop old anonymous users; leave demo rows out of the council ranking. |
| F7 | 2 | Welcome: the +5 check-in snackbar shows on first launch over "Continue as guest" (navy on navy) before anything is picked. The "Try the demo" row appears about 1 s later and pushes both buttons up about 200 px (layout shift, mis-tap risk). Minor: "Continue with Google" has no G icon; Welcome.png has "Sign in with Google" with it. | Check in after onboarding ends; keep the demo row's space from the start. |
| F8 | 2 | The location screen says "Location stays on your phone", but nearby search, routing, quick reports and live share send the position (PDPA notice accuracy). | Say what is sent and when, e.g. "Sent only to find routes and places, never stored with your name". |
| F9 | 7, 60 | Switches: the on track #56B4E9 is 2.3:1 on white, the off track 1.4:1 (WCAG 1.4.11 asks 3:1). The hit area is 46 x 27 dp and the row label can't be tapped. | Darker track colours; make the whole row the switch (48 dp). |
| F10 | 16, 17 | The Safest card shows at most 3 chips with the good ones first, so the "% not yet checked" warning drops off (night case). | Always keep the unchecked or hazard chip; drop a good chip instead. |
| F11 | 39, 41, 75 | Arrival: the rating card text and the street questions sit below the fixed buttons with no scroll cue. No snackbar for the +5 rating points. The selected "Very unsafe" face is drawn in safe teal. Offline, the rating fails silently, and the walk save retry is not idempotent (could count twice). | Scroll hint or a shorter top part; snackbar for the points; colour faces by meaning; queue the rating; send the walk with a client id. |
| F12 | 33, 42 | `onAnswer` in `navigate.tsx` shows "Thanks. Your answer was sent." for any non-network error, even when nothing was saved. | Show an error snackbar for the other errors. |
| F13 | 32, 72 | Turn and arrival pulses go out as `USAGE_TOUCH` (one-shot `Vibration.vibrate`), hazard pulses as UNKNOWN. Android drops touch vibrations when Touch feedback is off, so turns and arrival may be silent on such phones. 8 turn pulses on the station walk, 5 in the first 30 s. | Vibrate with alarm or notification usage. Check on the Honor first. |
| F14 | 14, 50, 53 | Check-in chips show done and today by colour only (as in Wallet.png). The badge reads "7-day check-in 0 of 1" while the card says Day 4 of 7. After Reset demo the card shows Day 3 and today's check-in is missing until the app restarts. The reset dialog still says "Your language stays". | Tick icon on done days; say what the badge counts; check in again after a reset; drop the language line. |
| F15 | 45 | Community cards split "400 m" across two lines ("400 / m"). | Non-breaking space between number and unit. |
| F16 | 76 | Offline search shows "Search is not working right now..." under a "Places found" heading. | Hide the heading when there are no results. |
| F17 | 31 | The navy turn card has no visible edge on the navy night map. | Light border or a lighter card at night. |
| F18 | 25 | On Start, one frame of the Map home (search, chips, Report, peek) flashes between the route sheet and the walk screen. | Hide the home overlays before the walk screen shows. |
| F19 | 24, 75 | With Step-free on, the route sheet leaves about 50 dp of map and the destination is under the sheet. At 130% font the same happens on the route sheet, and the Work chip runs under the layers button. | Cap the sheet height or open it lower; end the chip row before the layers button. |
| F20 | 32 | End walk has no confirm and no undo. | Undo snackbar for about 5 s. |
| F21 | 3, 47 | Docs out of date: row 47 (in-app export was removed in Phase 15) and guide Sections 2, 5.2 and 6.3 still say Export CSV; row 3 says saved places are filled in (only the UTP preset is). | Update the guide and the test sheet. |
| F22 | 58 | "With Plus" gold text is 2.6:1 on white. In Cosmetics the Use and In use buttons are read as just "Use" (no item name). Getting Plus doesn't put the gold frame on; you have to tap Use. | Darker gold; label "Use, Plus gold frame"; wear the gold frame when Plus starts. |
| F23 | 43, 61, 65 | Code and security notes: photo file names use `Math.random` (public bucket); exported files (council CSV and GeoJSON) carry no "(c) OpenStreetMap contributors" (guide 7.3); the unused `community_export` is still granted to anon; `route_safe` is anon-callable with no rate limit; the APK asks for SYSTEM_ALERT_WINDOW; CDN scripts on the web pages have no SRI; walk.html logs 3 MapLibre "Expected value to be of type number, but found null" warnings. | `crypto.randomUUID` names; add the credit line; revoke the grant; a simple per-user limit; drop the permission; add integrity hashes; guard the null values in the layer. |
| F24 | 54, 55 | Snackbars cover the main button for about 3 s: the ad's call-to-action and "Spend in the shop" on the top-up receipt (and Welcome, F7). The ad's "Order now" looks like a button but does nothing. The mock brands copy real slogans and names ("finger lickin'", "I'm lovin'", Tiger2u, BICC Clicks, PBe and others), which may read as real brands in a public demo. | Lift snackbars above the bottom buttons; make the CTA look inert; more clearly made-up names. |
| F25 | - | Lint: 88 warnings (66 before Phase 19). | Clear the new ones in the fix phase. |
| F26 | 8 | Expanding the peek sheet shows only the counts, not the nearby list (guide 6.3 says it expands to the list). | Add the nearby list or update the guide. |
| F27 | 49 | Report times say "just now" for up to 59 minutes (`timeAgo`). | "N min ago" under an hour. |

Fix plan for every note above: guide Section 18 (Fix Batch, Phase 20), retest as Run 3 in `final-test.md`.

Test data left on the live project (to clean in the fix phase, not done here): the street facts in F1; the demo duplicates in F6; 16 anonymous users from today; the photo of the deleted test report (`clean_photos.py` lists it after 1 day). The demo account was reset at the end.

Emulator left with: zone Asia/Kuala_Lumpur, gps and network test providers on, animation and font scales back to 1.
