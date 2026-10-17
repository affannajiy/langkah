# Final test notes (2026-10-17)

Build `e5808c9a` (commit 6fa9d5b), Pixel_8 emulator, fresh install. Results go in the Result column of `final-test.md`; this file keeps the detail, the bugs and the ideas for the optimisation phase.

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
