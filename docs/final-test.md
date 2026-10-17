# Final full test (preview APK)

One pass over the whole app on the **preview** APK before the final prototype.
The emulator (Pixel 8) and a real phone (Honor) each take the rows they can.
Mark each row Pass, Fail (with a note) or Skip.

- **Emu**: Pixel 8 emulator, `eas build:run -p android --latest`, GPX playback.
- **Phone**: a real phone from the build link. Vibration, real GPS, lock screen and battery tips only work here.

## Before

1. Open the Supabase dashboard (free projects pause after about 7 days).
2. Demo hazards are younger than 7 days, or run `python seed_demo.py` in `data-scripts/`, then `python seed_demo.py --council-stats` for the council page.
3. The preview SHA-1 is in Google Cloud (README section 3), or skip the Google rows.
4. Fresh start on each device: `adb shell pm clear com.langkah.app` (emulator), or reinstall (phone).

## Checklist

| # | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|
| 1 | Both | Splash | Open the app | Navy splash, logo mark, "Langkah", "Lebih selamat". No white flash. || Pass. Native splash shows the mark only; "Langkah" and "Lebih selamat" show on the next screen. |
| 2 | Both | Onboarding | Read how to start, pick Guest, read the location screen, allow location | No language step (English only for now). The Android prompt appears only after the explanation. Lands on the Map. || Pass. Guest sign-in clean (B1 fixed). |
| 3 | Both | Map | Look at the map around Ipoh Railway Station | Positron map in Langkah colours, "(c) OpenStreetMap contributors" visible, orange diamond hazards, light blue crossings, pink bus stops. || Pass. Emulator needs a mock GPS fix. |
| 4 | Both | Layers | Open Layers, turn bus stops off and on | Pins hide and come back. Hazards always show. || Pass. |
| 5 | Both | Peek sheet | Read the counts under the map | Hazard and improvement counts near you. Matches what Community shows for the same area. | Pass. Near station: 2 hazards, 8 requests, same as the pins on screen. Community lists by distance, not by map area, so only a rough match. |
| 6 | Both | Search | Search "Concubine" | Concubine Lane with distance and area. No score shown. Recent search saved. || Pass. 3 results with distance and street. |
| 7 | Both | Route compare | Pick Concubine Lane | Safest solid teal, Fastest dashed grey, unchecked dotted. Cards with time, distance, score and what Fastest lacks. || Pass. Safest 94 / Fastest 60. Scores still doubtful (G2). Crossing pins pile up (G6). |
| 8 | Both | Route detail | Expand the sheet | Breakdown: sidewalk %, lit %, marked crossings, hazards, amenities. || Pass. Sidewalk, lit, marked and unmarked crossings, hazards, not yet checked. No amenities line (G7). |
| 9 | Both | Day and night | Switch the chip to night, then back | Routes and scores change; the map goes dark at night. Never colour alone. || Pass. Night 88/52, map goes dark. Star wraps to a new line (G3); dark status bar icons at night (G4). |
| 10 | Emu | Navigation | Start **Fastest**, load `data-scripts/out/demo-walk.gpx`, Play | Turn banners, three hazard banners worded by landmark, auto-hide in about 6 s, nothing blocks the map. | Pass. Turn banners count down; 3 hazard banners (Broken sidewalk, Unsafe crossing on Jalan Dato Sagor; Blocked path on Lorong Panglima), hide after about 5 s; arrived 650 m. |
| 11 | Emu | Hazard banner | Tap **Still there** on one banner | Snackbar about 3 s. The vote counts in Community. | Pass. Snackbar shows. As a guest the vote waits ("sent once you sign in") and went out as "Hazard vote +2" after demo sign-in. Waiting banner calls the vote a "report" (G8). |
| 12 | Emu | Reroute | Start **Safest** with the same GPX | Off-route notice and a new line (it may reroute again every 15 s, known). | Pass. "Off the route. Finding a new walk from here", new line, "Back on route"; rerouted once. Arrival then said "3 hazards avoided" though 2 hazard banners showed after the reroute (G12); 550 m vs 650 m for the same GPX (G13). |
| 13 | Both | Quick report | During a walk tap Quick report, pick one icon | Pinned at the current spot in one tap, snackbar confirms. | Pass. One tap (Flooding), 3 s undo countdown, "Reported" snackbar. Shows in My reports. |
| 14 | Both | Arrival | Finish the walk | One long pulse (phone), distance, hazards avoided, rating faces, "Spot anything new?". || Pass. 650 m, 4 min, 3 hazards flagged, +6 points, faces, Spot anything new. |
| 15 | Both | Rating | Tap a rating | Saved. `python rating_report.py` shows one more rating afterwards. | Pass. rating_report.py: 0 to 1 rating (day, fastest, felt 4, score 56). Sent when leaving the screen. |
| 16 | Both | Report flow | Report an improvement with a photo | Four steps, pin confirm, photo, send. Shows in Community as pending. | Pass. Improvement, kerb ramp, pin, photo, posted (+10). Shows in My reports as Pending with the photo. |
| 17 | Both | Sign-in prompt | As a guest, try to report or vote with demo mode off | The sign-in sheet appears, not a dialog. | Pass. Post report as guest opens the sign-in bottom sheet (Google, demo, Not now). |
| 18 | Phone | Google sign-in | Sign in with Google | "Signed in as {name}" on Me. DEVELOPER_ERROR means the SHA-1 is missing. | |
| 19 | Both | Community: Hazards | Open the hazards list and map view | Pending and Active chips with icon and word. Still there and Gone work. | Pass. List and map view; Gone 0 to 1 with snackbar; map pins show a clock badge when pending. Only Pending has a chip, Active shows none (G16). |
| 20 | Both | Community: Improvements | Sort Top, Newest, Nearest; upvote one | Count changes at once. Tap again takes it back. Zebra crossing at the station has 3. | Pass. Top, Newest, Nearest sort. Upvote 3 to 4, tap again back to 3. Station zebra (Jalan Dato Maharajalela) has 3. |
| 21 | Both | Export | Export CSV and GeoJSON | Share sheet opens. File opens in Sheets or Files: ranked by upvotes, no names or ids. | Pass. Export sheet, CSV opens the Android share sheet (langkah-most-requested-2026-10-17.csv). Columns: rank, report id, category, upvotes, status, street, lon, lat, date, note; no names or user ids. File not opened in Sheets (release build, no run-as). |
| 22 | Both | Report detail | Open a report with a photo | Photo, category, mini map, status, votes, reported time, expiry. | Pass. Photo, title, street, status, votes, time, mini map, delete for own report. |
| 23 | Both | Me | Open Me | My reports with status, saved places, stats. Delete your own test report works. | Pass. Saved places, My reports with status, stats (4 posted). Delete works with a dialog and snackbar. Starred shows raw {{n}} (G9); stock Android dialog (G10); points kept after delete (G11). |
| 24 | Both | Settings | Turn vibration off, walk again | No pulses (phone); banners still show. Turn it back on. | Pass. Vibration off: no pulses in dumpsys vibrator_manager during the walk, banners still show. With it on: turn 150 ms, hazard 150+150, arrival 700 ms. |
| 25 | Both | English only | Open Settings, then go through every tab | No language section in Settings. Everything in English, even on a phone set to Malay. | Pass. No language section in Settings. App locale set to ms-MY (adb cmd locale): still all English. |
| 26 | Both | Screen fit | Check every screen and sheet | Nothing cut off or under the nav bar. Text at least 14 sp, buttons easy to hit. | Pass with notes. Nothing cut off or under the nav bar on any screen tried. See G3 (night chip wraps), G9 (raw {{n}}). |
| 27 | Phone | Lock screen | Start a walk, lock the phone, walk a bit | Guidance keeps going, pulses still come. | |
| 28 | Phone | Battery tip | First walk on the Honor | The keep-running tip shows before the walk. | |
| 29 | Phone | Haptics | Walk a real route | One short pulse per turn, two for a hazard, one long on arrival. | |
| 30 | Phone | Real GPS | Walk outdoors for a few minutes | The dot follows you within about 10 m. No false reroutes when you stand still. | |
| 31 | Both | No internet | Turn data off, then search | A clear message, no crash. Back online works again. | Pass. Offline search: "Search is not working right now. Check your internet connection." with Try again; back online, Try again shows results. |
| 32 | Both | Demo account | Fresh start, on how to start pick the demo | Signed in as Afrina with points, reports and saved places filled in. Reset demo on Me puts it back. | Pass. Demo account signs in as "Demo Walker" (LGK-DEMO-01); Afrina is the helper account that confirms reports (test text is old). Points, reports, saved places filled. Reset demo (dialog) back to 1,500 points and 3 reports. |
| 33 | Both | Wallet | Open Me, read the wallet card | Points balance and the last ledger lines with a reason each. | Pass. 1,512 points, ledger lines with reasons. |
| 34 | Both | Earn points | Finish a walk and rate it, then report or vote once | New ledger lines for each, the snackbar names the points. Doing the same again past the daily cap adds nothing. | Pass. Walk +6, rating +5, Afrina confirmed +20; 1,512 to 1,543. Hazard quick report pays only on confirmation. |
| 35 | Both | Daily check-in | Tap check-in on Me | Points once a day and the day count. A second tap the same day adds nothing. | Pass. Check-in is automatic on open (no button, test text is old). Day 3 of 7; reopening the app adds nothing. |
| 36 | Both | Mock top up | Top up, pick an amount, a bank, log in, TAC | Every screen says demo, no real money. Receipt, then the points show in the wallet. Over RM500 a month is refused. | Pass. DEMO banner on every screen, made-up banks, pre-filled login and TAC, receipt LGK-0043, +1,100 points. Month cap checked in SQL (rolled back): RM410 ok, next RM100 refused (month_cap). Copy: "AfnanOnline online" (G15). |
| 37 | Both | Mock ads | Watch an ad from Me | Marked as an ad and a mock. Close only after the countdown. Points paid once; past the daily cap it says so. | Pass. Ad and mock label, close greyed until 0:00, +20 each. 5 a day, 6th says "No more ads today". Button still says +20 when capped (G14). |
| 38 | Both | Points shop | Shop, redeem a voucher | Confirm sheet, then a code screen to show the cashier. It shows under My vouchers. | Pass on retest (build b5390a00, B2 fixed). Voucher LGK-7C1D13, 1,505 to 1,355, code screen. Confirm is still a stock dialog (G10, later). |
| 39 | Both | Too few points | Try a voucher that costs more than you have | A bottom sheet (not a dialog) with ways to earn or top up. | Pass on retest. Guest with 5 points: bottom sheet "You need 145 more points" with ad, walk, vote, check-in and Top up. |
| 40 | Both | Cosmetics and Plus | Wear a frame or badge; get Plus with points | Frame shows on Me. Plus gives the gold frame, badge and 20 saved places; walk share says "coming later". | Pass on retest. Teal ring bought and in use (-200), Plus on until 16 Nov (-690), Plus badge on Me, starred "0 of 20", walk share "Coming later". |
| 41 | Both | Sponsored pins | Browse the map in Old Town | White teardrop pins tagged "Sponsored", at most 3 on screen. Tap one: sheet with Get voucher and Walk here. || Pass. 3 white Sponsored pins in Old Town. Tap: sheet with RM3 off, Get voucher 450 pts, Walk here, "Shops pay to show here" note. Counted by partner_report.py --real. |
| 42 | Emu | No ads on a walk | Start a walk past a partner shop | No sponsored pin or popup during navigation. | Pass. No sponsored pin or popup in any of the 200 frames of both walks. |
| 43 | Laptop | Partner report | `python partner_report.py` in `data-scripts/` | Views and taps per shop from your test, a CSV written. | Pass. partner_report.py: sample plus real counts; --real shows this test (Roti Bakar 2 views, 1 tap). CSV written to out/. |
| 44 | Laptop | Council page | Open https://affannajiy.github.io/langkah/ | English only, no language button. Ranked requests with photos, heatmap, 12-week charts, report types. 30/90/365 switch works. CSV and GeoJSON download, no names. || Pass. English only, KPIs load (11 hazards, 54 requests), map, ranked list, trends, types. CSV (55 lines) and GeoJSON built, no names, 5-decimal coords (captured in the page, not saved). CSV uses codes like street_lights, not labels (G18). |
| 45 | Phone | Council on phone | Open the same page on the phone | Fits the screen, no side scroll, map moves with a finger. | |

### Demo upgrade (Phases 18 to 24, guide Section 16)

Before: a new preview APK (`expo-speech` is native). For row 52, the Pages URL is in Supabase **Redirect URLs** (README section 5, Council dashboard).

| # | Where | Area | Step | Expect | Result |
|---|---|---|---|---|---|
| 46 | Emu | Live share | Start a walk, tap **Share**, read the sheet, tap **Share link** | Sheet says what the friend sees and when it stops. Android share sheet opens with the walk.html link. The button now reads **Live**. | |
| 47 | Laptop | Friend's page | Open the shared link, play the GPX | Dot moves about every 15 s, route line, "About N min left", "Updated just now". Map credit visible. | |
| 48 | Both | Share ends | Arrive (or End), reload the friend's page | "Arrived at hh:mm" (or "ended the walk"), "position was deleted". In SQL, the row has no position. After 15 min the link says it ended. | |
| 49 | Emu | Voice | On the walk screen tap the speaker, play the GPX | "Voice guidance on" snackbar. Turns, hazards (by landmark) and arrival spoken after the pulse. Tap again: silence. Settings shows the same switch. | |
| 50 | Both | Rain and heat | Route compare. Tap **Prefer cover**; when it rains the chip turns on by itself | Chip with an icon, a word and a tick when on. Safest may change near covered walkways (the station); the score does not. | |
| 51 | Both | Step-free | Settings, **Avoid steps** on, then route through the railway station | Step-free tag on the sheet, no stairs on either route, "Kerbs are not checked at N crossings". Off again restores the usual routes. | |
| 52 | Laptop | Staff sign-in | Council page, **Staff sign in**, your email, open the link | "Signed in as staff". Mark planned, Mark fixed and Reopen under each request. | |
| 53 | Both | Fixed loop | Mark one of your own requests **Fixed**, then reopen the app | Snackbar: "Fixed: the council fixed your request … +50 points". Fixed by council chip in Community and Me. Ledger line. The request leaves the ranked list on the page. | |
| 54 | Both | Street checks | Finish a walk signed in (Google or demo) | "Help check these streets": up to 3 questions. Answer one: "Two walkers agree" (demo) and +2 points. The next route on that street asks the next question. | |
| 55 | Both | Badges | Open **Me** | Badges card: weekly streak and 8 badges, earned ones say Earned with a tick, others show progress. | |
| 56 | Both | Plus | Open Langkah Plus | No live walk share perk (it is free for everyone now). | |

## After

1. Delete your test reports (Me, My reports), or leave them if they are real.
2. `python clean_photos.py` in `data-scripts/`: lists photos no report uses. Add `--apply` to delete them.
3. Write any fails in the Log of [user-test-plan.md](user-test-plan.md).
