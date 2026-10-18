# Security policy

Langkah is a student prototype, but it handles real locations and real accounts, so we take security reports seriously.

## Reporting a vulnerability

**Please don't open a public issue for a security problem.**

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers can see the report.

Please include:
- what the problem is and where (app screen, SQL function, council page, script),
- the steps to reproduce it,
- what an attacker could do with it.

We aim to reply within 7 days and to fix confirmed problems before talking about them in public. We'll credit you in the fix unless you'd rather we didn't.

## Supported versions

Only the latest commit on `main` and the latest preview APK are supported. There are no older releases to patch.

## Scope

In scope:
- the Android app in `app/`,
- the database schema, functions and Row Level Security policies in `supabase/migrations/`,
- the council dashboard and live walk page in `council/`.

Out of scope:
- Supabase, Expo, OpenFreeMap, Open-Meteo and GitHub themselves (report those to their owners),
- the public anon key and the Google web client ID, which are public by design,
- the mock payments, top-ups and ads, which move no real money,
- denial of service by flooding the free-tier backend.

Please test only against your own accounts and data. Don't read, change or delete other people's reports or accounts, and stop as soon as you've shown the problem.

## How Langkah handles data

- Only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` go in the app. All three are public by design: RLS protects every table, and a Google client ID is sent with every sign-in. The Google **client secret** lives only in the Supabase dashboard.
- The **service role key** and the **database password** never go in the app, in git or in chat. `.env` files are git-ignored; keep the `.env.example` files up to date.
- Every new table turns on RLS in the same migration that creates it.
- Location stays on the phone. It is only sent as the start of a route request (including a reroute) and never stored. The one exception is **live walk share** (Phase 18), and only after the walker taps Share link: the server keeps the latest position (5 decimals) in one row, overwritten in place, wipes it when the walk arrives or ends, and deletes every share 2 hours after it started. The link's token is 128 random bits; the page sends no referrer and asks not to be indexed.
- Weather (Phase 18) is asked about the middle of the pilot area, never the user's position.
- Street checks (Phase 18) send only the street's OSM way ids and the answer, never the route. They need a Google or demo account, like reports.
- Council staff are decided by `private.council_staff`, checked in SQL on every status change. Signing in on the dashboard grants nothing by itself, and the sign-in form never says whether an email is on the list.
- During a walk, location runs as a foreground service with a visible notification and stops when the walk ends. Langkah never asks for "Allow all the time" location (`ACCESS_BACKGROUND_LOCATION` is blocked).
- Guests (Supabase anonymous accounts) can read but never write. RLS checks for a Google-signed-in account on every report, vote and photo upload. The one exception is demo mode, a database-only switch ([developer guide, section 4](docs/DEVELOPMENT.md#demo-mode-no-google-sign-in)) that lets guests write while it is on.
- Walk ratings store only the rating, day or night, route kind, score and length. No route line, start or end point.
- Deleting a report asks first, since it cannot be undone. The photo file is removed too.
- `reports.user_id` is never returned to the app. A first name (from Google) is shown only when the reporter turns off "Post anonymously". Emails are never shown.
- Report photos are re-encoded on the phone (about 1280 px, JPEG 70%), which drops EXIF and GPS tags. File names are random, so a photo URL does not identify anyone.
- The council export holds no names or user ids. Notes that start with `=`, `+`, `-` or `@` are escaped so a spreadsheet never runs them.
- Quick reports and Still there / Gone answers made as a guest, or with no signal, wait on the phone and are sent after sign-in. Sign-in is never asked for during a walk.
- The camera permission is asked for only when the user taps Take photo. The microphone permission is blocked.
- Demo accounts (Try the demo) and the demo crew only ever change demo data: their reports are hidden from everyone else, and their votes and street answers never count on real reports.
- Route requests are rate limited per user (30 a minute, 300 a day).
