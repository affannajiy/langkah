# Final full test (preview APK)

One pass over the whole app on the **preview** APK with Phase 19 (this is Phase 20), before the final prototype. The emulator (Pixel 8) and a real phone (Honor) each take the rows they can. Mark each row Pass, Fail (with a note) or Skip, and log every fail or oddity in [test-notes.md](test-notes.md) under **Full test**.

Rows are grouped by screen and numbered afresh. "Was" is the row number in [final-test-run1.md](final-test-run1.md), where the last results are.

- **Emu**: Pixel 8 emulator, `eas build:run -p android --latest`, GPX playback.
- **Phone**: a real phone from the build link. Vibration, real GPS, compass, lock screen and battery tips only work here.
- **Laptop**: a browser, or `data-scripts/` with the venv on.

## Before

1. Open the Supabase dashboard (free projects pause after about 7 days). Migrations up to 24 are on the live project.
2. Demo hazards are younger than 7 days, or run `python seed_demo.py` in `data-scripts/`, then `python seed_demo.py --council-stats` for the council page.
3. The preview SHA-1 is in Google Cloud (README section 3), or skip the Google rows.
4. A new preview APK with Phase 19, then a fresh start: `adb shell pm clear com.langkah.app` (emulator), or reinstall (phone).
5. GPX: `data-scripts/out/demo-walk.gpx` (Ipoh, station to Concubine Lane) and `data-scripts/out/utp-walk.gpx` (V5C to V5 Cafe, 181 m, a left and a right). Play them as mock gps **and** network fixes with `--accuracy 5`; the emulator setup is in [test-notes.md](test-notes.md), Emulator-only notes.
6. Mock location at V5C (100.96418, 4.38748) for the UTP rows, at the railway station for the Ipoh rows.
7. For the motion row: Android Settings, Accessibility, **Remove animations**. For the council rows: the Pages URL is in Supabase **Redirect URLs** (README section 5).

## First launch

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 1 | 1 | Both | Splash | Open the app | Navy splash, logo mark, "Langkah", "Lebih selamat". No white flash. | |
| 2 | 2 | Both | Onboarding | Read how to start, pick Guest, read the location screen, allow location | No language step (English only for now). The Android prompt appears only after the explanation. Lands on the Map. | |
| 3 | 32 | Both | Demo account | Fresh start, on how to start pick the demo | Signed in as Demo Walker with points, reports and saved places filled in (Afrina is the helper who confirms). Reset demo on Me puts it back. | |
| 4 | 25 | Both | English only | Open Settings, then go through every tab | No language section in Settings. Everything in English, even on a phone set to Malay. | |
| 5 | 67 | Emu | N2 status bar | `pm clear`, Try the demo, tap the moon; then close and reopen the app | Light status bar icons on the night map at once, and on the first map screen after reopening. | |

## Map home

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 6 | 3 | Both | Map | Look at the map around Ipoh Railway Station | Positron map in Langkah colours, "(c) OpenStreetMap contributors" visible, orange diamond hazards, light blue crossings, pink bus stops. | |
| 7 | 4 | Both | Layers | Open Layers, turn bus stops off and on | Pins hide and come back. Hazards always show. | |
| 8 | 5 | Both | Peek sheet | Read the counts under the map | Hazard and improvement counts near you. Matches what Community shows for the same area. | |
| 9 | 41 | Both | Sponsored pins | Browse the map in Old Town | White teardrop pins tagged "Sponsored", at most 3 on screen. Tap one: sheet with Get voucher and Walk here. | |
| 10 | new (N4) | Emu | Location comes back | Location services off, open the app, "No thanks" on Google's dialog. Then turn location on from quick settings | Within about 5 s the map finds you (blue dot, distances in search), no restart. Also after leaving the app and coming back. | |

## Search

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 11 | 6 | Both | Search | Search "Concubine" | Concubine Lane with distance and area. No score shown. Recent search saved. | |
| 12 | 57 | Emu | Nearby search | Mock location at V5C (100.96418, 4.38748). Search **cafe** | V5 Cafe (about 160 m) first; Ipoh cafes after it. Search **v5**: the V5 blocks and V5 Cafe, nearest first. | |
| 13 | 58 | Emu | Instant search | Type **cafe**, clear, type it again. Then close the app, reopen, type it once more | Second time and after the restart: results at once, no spinner. While typing a new word, the old results stay until the new ones land. | |
| 14 | 69 | Both | Reset demo | Me, **Reset demo**, then search **cafe** and start a walk | Recent places gone; the search asks the server again (saved searches cleared). The walk opens in 3D. | |

## Route compare

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 15 | 7 | Both | Route compare | Pick Concubine Lane | Safest solid teal, Fastest dashed grey, unchecked dotted. Cards with time, distance, score and what Fastest lacks. | |
| 16 | 8 | Both | Route detail | Expand the sheet | Breakdown: sidewalk %, lit %, marked crossings, hazards, amenities. | |
| 17 | 9 | Both | Day and night | Tap the moon, then the sun | Routes and scores change; the map goes dark at night. Never colour alone. | |
| 18 | 59 | Emu | Route on tap | Tap **V5 Cafe** in the results | Grey skeleton cards the size of the real ones (Start dimmed) for a moment, or the routes at once. Nothing jumps when they land. | |
| 19 | 60 | Emu | Instant toggles | On the route sheet tap the moon, then **Prefer cover**, then each again | New routes show at once, no skeletons (fetched in the background). Snackbar "Night scoring on" or "Day scoring on". | |
| 20 | 61 | Both | Route sheet header | Station to Concubine Lane, by day and by night | "2 walking routes" on one line, round moon or sun button and the star beside it. No long Night scoring pill. | |
| 21 | 62 | Both | Sheet motion | Open a route; press and hold buttons; turn **Remove animations** on and repeat | Lines draw from start to end, then the tags and dots show. Cards rise one after the other, the score ring fills, buttons shrink a little while held, snackbars slide up, the cover chip fades on change. With Remove animations: everything appears at once. | |
| 22 | 50 | Both | Rain and heat | Route compare. Tap **Prefer cover**; when it rains the chip turns on by itself | Chip with an icon, a word and a tick when on. Safest may change near covered walkways (the station); the score does not. | |
| 23 | 66 | Both | N1 cover | Station to Concubine Lane, Prefer cover off, then on | Safest is never worse with cover on: same or higher score, same or fewer hazards. (Server check: 827 m, score 72, no hazards both ways.) | |
| 24 | 51 | Both | Step-free | Settings, **Avoid steps** on, then route through the railway station | Step-free tag on the sheet, no stairs on either route, "Kerbs are not checked at N crossings". Off again restores the usual routes. | |

## Walk

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 25 | 63 | Emu | Start a walk | V5C to V5 Cafe, **Start**, then play `utp-walk.gpx` | The map shows the whole route, then swoops down behind the walker (about 1.2 s), tilted, buildings raised in 3D. The turn card slides down from the top. | |
| 26 | 70 | Emu | Walker size on Start | V5C to V5 Cafe, **Start**, play `utp-walk.gpx`; watch the swoop | The arrow starts small and grows with the swoop to its normal size; it never fills the screen, then shrinks. | |
| 27 | 64 | Emu | Walk in 3D | Keep the GPX playing; repeat at night | Navy arrow on the street pointing along the walk, gliding between fixes (no jumps). Walked part grey. Turn distance runs down smoothly; "Now" and the arrow box pulse at each turn with the haptic. Night: buildings faint navy, route still clear. Recentre returns to the tilted view. | |
| 28 | 71 | Emu | Map view button | During the walk, tap the view button three times | 3D, then 2D (flat, turns with the walk), then North (flat, north up, walker in the middle), then 3D again. Each tap names the view in a snackbar; the button shows an icon and a word. | |
| 29 | 72 | Emu | View remembered | Pick North, end the walk, start a new one; then Me, **Reset demo**, start again | The second walk opens in North; after Reset demo it opens in 3D. | |
| 30 | 73 | Emu | Pinch while walking | Pinch the map in and out, then tap the follow button | The arrow keeps a steady size on screen while pinching; follow returns to the chosen view. | |
| 31 | new (N6) | Emu | Night walker | Tap the moon, start a walk, play the GPX | The walker arrow is light blue with a white edge on the navy map, easy to see. By day it is navy. | |
| 32 | 10 | Emu | Navigation | Start **Fastest**, load `data-scripts/out/demo-walk.gpx`, Play | Turn banners, three hazard banners worded by landmark, auto-hide in about 6 s, nothing blocks the map. | |
| 33 | 11 | Emu | Hazard banner | Tap **Still there** on one banner | Snackbar about 3 s. The vote counts in Community. As a guest, the map banner says "1 report or vote is waiting on this phone" (G8). | |
| 34 | 12 | Emu | Reroute | Start **Safest** with the same GPX | Off-route notice and a new line (it may reroute again every 15 s, known). | |
| 35 | 13 | Both | Quick report | During a walk tap Quick report, pick one icon | Pinned at the current spot in one tap, snackbar confirms. | |
| 36 | 42 | Emu | No ads on a walk | Start a walk past a partner shop | No sponsored pin or popup during navigation. | |
| 37 | 49 | Emu | Voice | On the walk screen tap the speaker, play the GPX | "Voice guidance on" snackbar. Turns, hazards (by landmark) and arrival spoken after the pulse. Tap again: silence. Settings shows the same switch. | |
| 38 | 46 | Emu | Live share | Start a walk, tap **Share**, read the sheet, tap **Share link** | Sheet says what the friend sees and when it stops. Android share sheet opens with the walk.html link. The button now reads **Live**. | |

## Arrival

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 39 | 14 | Both | Arrival | Finish the walk | One long pulse (phone), distance, hazards avoided, rating faces, "Spot anything new?". | |
| 40 | new (G1) | Emu | Arrival offline | Play the GPX to the end with data off (airplane mode just before arriving) | Arrival screen shows, then a snackbar "Could not save this walk. Check your connection." with **Try again**. Data on, Try again: the walk points appear. | |
| 41 | 15 | Both | Rating | Tap a rating | Saved. `python rating_report.py` shows one more rating afterwards. | |
| 42 | 54 | Both | Street checks | Finish a walk signed in (Google or demo) | "Help check these streets": up to 3 questions. Answer one: "Two walkers agree" (demo) and +2 points. The next route on that street asks the next question. | |

## Reports and Community

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 43 | 16 | Both | Report flow | Report an improvement with a photo | Four steps, pin confirm, photo, send. Shows in Community as pending. | |
| 44 | 17 | Both | Sign-in prompt | As a guest, try to report or vote with demo mode off | The sign-in sheet appears, not a dialog. | |
| 45 | 19 | Both | Community: Hazards | Open the hazards list and map view | Pending and Active chips with icon and word. Still there and Gone work. | |
| 46 | 20 | Both | Community: Improvements | Sort Top, Newest, Nearest; upvote one | Count changes at once. Tap again takes it back. Zebra crossing at the station has 3. | |
| 47 | 21 | Both | Export | Export CSV and GeoJSON | Share sheet opens. File opens in Sheets or Files: ranked by upvotes, no names or ids. | |
| 48 | 22 | Both | Report detail | Open a report with a photo | Photo, category, mini map, status, votes, reported time, expiry. | |

## Me, points and shop

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 49 | 23 | Both | Me | Open Me | My reports with status, saved places, stats. Delete your own test report works. | |
| 50 | 55 | Both | Badges | Open **Me** | Badges card: weekly streak and 8 badges, earned ones say Earned with a tick, others show progress. | |
| 51 | 33 | Both | Wallet | Open Me, read the wallet card | Points balance and the last ledger lines with a reason each. | |
| 52 | 34 | Both | Earn points | Finish a walk and rate it, then report or vote once | New ledger lines for each, the snackbar names the points. Doing the same again past the daily cap adds nothing. | |
| 53 | 35 | Both | Daily check-in | Open the app on two days, then twice on the same day | Check-in is automatic on open: points once a day and the day count. A second open the same day adds nothing. | |
| 54 | 36 | Both | Mock top up | Top up, pick an amount, a bank, log in, TAC | Every screen says demo, no real money. Receipt, then the points show in the wallet. Over RM500 a month is refused. | |
| 55 | 37 | Both | Mock ads | Watch an ad from Me | Marked as an ad and a mock. Close only after the countdown. Points paid once; past the daily cap it says so. | |
| 56 | 38 | Both | Points shop | Shop, redeem a voucher | Confirm sheet, then a code screen to show the cashier. It shows under My vouchers. | |
| 57 | 39 | Both | Too few points | Try a voucher that costs more than you have | A bottom sheet (not a dialog) with ways to earn or top up. | |
| 58 | 40 | Both | Cosmetics and Plus | Wear a frame or badge; get Plus with points | Frame shows on Me. Plus gives the gold frame, badge and 20 saved places. No live share perk (free for everyone). | |
| 59 | 56 | Both | Plus | Open Langkah Plus | No live walk share perk (it is free for everyone now). | |
| 60 | 24 | Both | Settings | Turn vibration off, walk again | No pulses (phone); banners still show. Turn it back on. | |

## Laptop: friend's page, council and partners

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 61 | 47 | Laptop | Friend's page | Open the shared link, play the GPX | Dot moves about every 15 s, route line, "About N min left", "Updated just now". Map credit visible. | |
| 62 | 48 | Both | Share ends | Arrive (or End), reload the friend's page | "Arrived at hh:mm" (or "ended the walk"), "position was deleted". In SQL, the row has no position. After 15 min the link says it ended. | |
| 63 | 68 | Laptop | N3 friend's page | Open a live share link in a small browser window, then make it bigger | The map fills its box at once and again after the resize, no reload. | |
| 64 | 43 | Laptop | Partner report | `python partner_report.py` in `data-scripts/` | Views and taps per shop from your test, a CSV written. | |
| 65 | 44 | Laptop | Council page | Open https://affannajiy.github.io/langkah/ | English only, no language button. Ranked requests with photos, heatmap, 12-week charts, report types. 30/90/365 switch works. CSV and GeoJSON download, no names. | |
| 66 | 45 | Phone | Council on phone | Open the same page on the phone | Fits the screen, no side scroll, map moves with a finger. | |
| 67 | 52 | Laptop | Staff sign-in | Council page, **Staff sign in**, your email, open the link | "Signed in as staff". Mark planned, Mark fixed and Reopen under each request. | |
| 68 | 53 | Both | Fixed loop | Mark one of your own requests **Fixed**, then reopen the app | Snackbar: "Fixed: the council fixed your request … +50 points". Fixed by council chip in Community and Me. Ledger line. The request leaves the ranked list on the page. | |

## Real phone only

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 69 | 18 | Phone | Google sign-in | Sign in with Google | "Signed in as {name}" on Me. DEVELOPER_ERROR means the SHA-1 is missing. | |
| 70 | 27 | Phone | Lock screen | Start a walk, lock the phone, walk a bit | Guidance keeps going, pulses still come. | |
| 71 | 28 | Phone | Battery tip | First walk on the Honor | The keep-running tip shows before the walk. | |
| 72 | 29 | Phone | Haptics | Walk a real route | One short pulse per turn, two for a hazard, one long on arrival. | |
| 73 | 30 | Phone | Real GPS | Walk outdoors for a few minutes | The dot follows you within about 10 m. No false reroutes when you stand still. | |
| 74 | 65 | Phone | Compass and GPS ring | Walk outside, turn the phone; then indoors | A light-blue cone turns with the phone. Indoors (GPS worse than 15 m) a soft ring around the arrow. | |

## Whole app

| # | Was | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|---|
| 75 | 26 | Both | Screen fit | Check every screen and sheet | Nothing cut off or under the nav bar. Text at least 14 sp, buttons easy to hit. | |
| 76 | 31 | Both | No internet | Turn data off, then search | A clear message, no crash. Back online works again. | |

## After

1. Delete your test reports (Me, My reports), or leave them if they are real.
2. `python clean_photos.py` in `data-scripts/`: lists photos no report uses. Add `--apply` to delete them.
3. Every fail is in [test-notes.md](test-notes.md), Full test, with its row number and an idea for the fix.
4. Reset the demo (Me, Reset demo) so the next run starts clean.
