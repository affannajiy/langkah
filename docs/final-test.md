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
| 1 | Both | Splash | Open the app | Navy splash, logo mark, "Langkah", "Lebih selamat". No white flash. | |
| 2 | Both | Onboarding | Read how to start, pick Guest, read the location screen, allow location | No language step (English only for now). The Android prompt appears only after the explanation. Lands on the Map. | |
| 3 | Both | Map | Look at the map around Ipoh Railway Station | Positron map in Langkah colours, "(c) OpenStreetMap contributors" visible, orange diamond hazards, light blue crossings, pink bus stops. | |
| 4 | Both | Layers | Open Layers, turn bus stops off and on | Pins hide and come back. Hazards always show. | |
| 5 | Both | Peek sheet | Read the counts under the map | Hazard and improvement counts near you. Matches what Community shows for the same area. | |
| 6 | Both | Search | Search "Concubine" | Concubine Lane with distance and area. No score shown. Recent search saved. | |
| 7 | Both | Route compare | Pick Concubine Lane | Safest solid teal, Fastest dashed grey, unchecked dotted. Cards with time, distance, score and what Fastest lacks. | |
| 8 | Both | Route detail | Expand the sheet | Breakdown: sidewalk %, lit %, marked crossings, hazards, amenities. | |
| 9 | Both | Day and night | Switch the chip to night, then back | Routes and scores change; the map goes dark at night. Never colour alone. | |
| 10 | Emu | Navigation | Start **Fastest**, load `data-scripts/out/demo-walk.gpx`, Play | Turn banners, three hazard banners worded by landmark, auto-hide in about 6 s, nothing blocks the map. | |
| 11 | Emu | Hazard banner | Tap **Still there** on one banner | Snackbar about 3 s. The vote counts in Community. | |
| 12 | Emu | Reroute | Start **Safest** with the same GPX | Off-route notice and a new line (it may reroute again every 15 s, known). | |
| 13 | Both | Quick report | During a walk tap Quick report, pick one icon | Pinned at the current spot in one tap, snackbar confirms. | |
| 14 | Both | Arrival | Finish the walk | One long pulse (phone), distance, hazards avoided, rating faces, "Spot anything new?". | |
| 15 | Both | Rating | Tap a rating | Saved. `python rating_report.py` shows one more rating afterwards. | |
| 16 | Both | Report flow | Report an improvement with a photo | Four steps, pin confirm, photo, send. Shows in Community as pending. | |
| 17 | Both | Sign-in prompt | As a guest, try to report or vote with demo mode off | The sign-in sheet appears, not a dialog. | |
| 18 | Phone | Google sign-in | Sign in with Google | "Signed in as {name}" on Me. DEVELOPER_ERROR means the SHA-1 is missing. | |
| 19 | Both | Community: Hazards | Open the hazards list and map view | Pending and Active chips with icon and word. Still there and Gone work. | |
| 20 | Both | Community: Improvements | Sort Top, Newest, Nearest; upvote one | Count changes at once. Tap again takes it back. Zebra crossing at the station has 3. | |
| 21 | Both | Export | Export CSV and GeoJSON | Share sheet opens. File opens in Sheets or Files: ranked by upvotes, no names or ids. | |
| 22 | Both | Report detail | Open a report with a photo | Photo, category, mini map, status, votes, reported time, expiry. | |
| 23 | Both | Me | Open Me | My reports with status, saved places, stats. Delete your own test report works. | |
| 24 | Both | Settings | Turn vibration off, walk again | No pulses (phone); banners still show. Turn it back on. | |
| 25 | Both | English only | Open Settings, then go through every tab | No language section in Settings. Everything in English, even on a phone set to Malay. | |
| 26 | Both | Screen fit | Check every screen and sheet | Nothing cut off or under the nav bar. Text at least 14 sp, buttons easy to hit. | |
| 27 | Phone | Lock screen | Start a walk, lock the phone, walk a bit | Guidance keeps going, pulses still come. | |
| 28 | Phone | Battery tip | First walk on the Honor | The keep-running tip shows before the walk. | |
| 29 | Phone | Haptics | Walk a real route | One short pulse per turn, two for a hazard, one long on arrival. | |
| 30 | Phone | Real GPS | Walk outdoors for a few minutes | The dot follows you within about 10 m. No false reroutes when you stand still. | |
| 31 | Both | No internet | Turn data off, then search | A clear message, no crash. Back online works again. | |
| 32 | Both | Demo account | Fresh start, on how to start pick the demo | Signed in as Afrina with points, reports and saved places filled in. Reset demo on Me puts it back. | |
| 33 | Both | Wallet | Open Me, read the wallet card | Points balance and the last ledger lines with a reason each. | |
| 34 | Both | Earn points | Finish a walk and rate it, then report or vote once | New ledger lines for each, the snackbar names the points. Doing the same again past the daily cap adds nothing. | |
| 35 | Both | Daily check-in | Tap check-in on Me | Points once a day and the day count. A second tap the same day adds nothing. | |
| 36 | Both | Mock top up | Top up, pick an amount, a bank, log in, TAC | Every screen says demo, no real money. Receipt, then the points show in the wallet. Over RM500 a month is refused. | |
| 37 | Both | Mock ads | Watch an ad from Me | Marked as an ad and a mock. Close only after the countdown. Points paid once; past the daily cap it says so. | |
| 38 | Both | Points shop | Shop, redeem a voucher | Confirm sheet, then a code screen to show the cashier. It shows under My vouchers. | |
| 39 | Both | Too few points | Try a voucher that costs more than you have | A bottom sheet (not a dialog) with ways to earn or top up. | |
| 40 | Both | Cosmetics and Plus | Wear a frame or badge; get Plus with points | Frame shows on Me. Plus gives the gold frame, badge and 20 saved places; walk share says "coming later". | |
| 41 | Both | Sponsored pins | Browse the map in Old Town | White teardrop pins tagged "Sponsored", at most 3 on screen. Tap one: sheet with Get voucher and Walk here. | |
| 42 | Emu | No ads on a walk | Start a walk past a partner shop | No sponsored pin or popup during navigation. | |
| 43 | Laptop | Partner report | `python partner_report.py` in `data-scripts/` | Views and taps per shop from your test, a CSV written. | |
| 44 | Laptop | Council page | Open https://affannajiy.github.io/langkah/ | English only, no language button. Ranked requests with photos, heatmap, 12-week charts, report types. 30/90/365 switch works. CSV and GeoJSON download, no names. | |
| 45 | Phone | Council on phone | Open the same page on the phone | Fits the screen, no side scroll, map moves with a finger. | |

## After

1. Delete your test reports (Me, My reports), or leave them if they are real.
2. `python clean_photos.py` in `data-scripts/`: lists photos no report uses. Add `--apply` to delete them.
3. Write any fails in the Log of [user-test-plan.md](user-test-plan.md).
