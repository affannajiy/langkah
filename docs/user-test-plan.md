# Group test and tuning plan (guide Sections 7.1 and 12, week 10)

This is a team run-through, not a user study. Group 4 tests the app ourselves
over the 4 weeks before the final prototype, finds what breaks or feels wrong,
and tunes the safety weights once or twice. Nothing here is for publication.

## Before the first session

1. Apply migration `20261011000011_score_weights.sql` (`npx supabase db push`).
   The scores stay the same: the table starts with the Table 9 values.
2. Reseed the demo data if it is older than 7 days: `python seed_demo.py` in `data-scripts/`.
3. Install the latest preview APK on every phone (DEVELOPMENT.md section 3).
4. One person keeps the log below in this file (or a copy of it).

## Each session (about 45 minutes)

Use the Seri Iskandar and UTP pilot area for quick sessions on campus, and the
Ipoh corridor at least once. Do one walk in daylight and one after dark, since
the night score uses different weights.

| # | Task | What to look for |
|---|---|---|
| 1 | Search a place and compare the two routes | Does Safest really look safer? Is the extra distance worth it? |
| 2 | Walk the Safest route with the phone in a pocket | Turn and hazard vibrations come at the right time. Banners name a landmark, never a side of the road. |
| 3 | Lock the screen for part of the walk | Guidance keeps going. On Honor, Xiaomi, Oppo, vivo and Samsung, the battery tip appeared before the first walk. |
| 4 | Rate the walk on the arrival screen | Rate how safe it **felt**, not how good the app was. |
| 5 | Report one real hazard or improvement with a photo | Three taps or fewer. The pin lands where you are. |
| 6 | Confirm or upvote another person's report | The count changes, and the hazard starts changing routes once confirmed. |
| 7 | Switch to Bahasa Melayu for one walk | Nothing cut off or untranslated. |

If you can't walk, the emulator works with a GPX file (DEVELOPMENT.md section 7), but
rate only walks you really did.

## Tuning the weights

After 2 or 3 sessions (10 or more rated walks):

1. In `data-scripts/`, run `python rating_report.py` (add `--days 7` for the last week).
2. Look at the mismatches it lists, and at the notes in the log:
   - a high score that felt unsafe means a penalty is too low, or a danger is missing from the data;
   - a low score that felt safe means a penalty is too high.
3. Change **one rule at a time**, by a small step (about 0.2 to 0.5), in the Supabase SQL editor:

   ```sql
   update private.score_weights set night = 1.3, updated_at = now() where rule = 'unlit';
   select private.score_segments();
   ```

   `active_hazard` applies at route time and needs no rescore.
4. Walk or re-route the same trip, and check that the routes change the way you expected.
5. Write the change in the log, and update Table 9 in the guide (Section 7.1) at the end.

If a missing sidewalk or a wrong lighting tag caused the problem, fix it in
OpenStreetMap and reload the data instead of changing a weight (DEVELOPMENT.md section 5).

## Rules in `private.score_weights`

| Rule | Day | Night | Table 9 condition |
|---|---|---|---|
| `main_no_sidewalk` | 1.5 | 2.0 | No sidewalk on a main road |
| `minor_no_sidewalk` | 0.3 | 0.5 | No sidewalk on a residential road |
| `unlit` | 0 | 1.0 | Road not lit |
| `unmarked_main_crossing` | 1.0 | 1.5 | Crossing a main road without a marked crossing |
| `fast_traffic` | 0.5 | 0.7 | Traffic at 60 km/h or more next to the path |
| `unchecked` | 0.2 | 0.4 | Not yet audited |
| `active_hazard` | 3.0 | 3.0 | Active confirmed hazard |

## Log

| Date | Who | Area | Day or night | What happened | Weight change (if any) |
|---|---|---|---|---|---|
| | | | | | |
