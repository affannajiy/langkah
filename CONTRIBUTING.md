# Contributing to Langkah

Thanks for helping make walking in Ipoh safer. This page covers how to propose a change. How to set up and run everything is in the [developer guide](docs/DEVELOPMENT.md).

## Before you start

- **Read the guide first.** [docs/Langkah Tech Stack.md](docs/Langkah%20Tech%20Stack.md) is the source of truth. Find the section your change touches and name it in your issue or pull request. If the code and the guide disagree, say so in the issue instead of picking one.
- **Match the screens.** The PNGs in [docs/screens/](docs/screens/) are the visual spec: layout, spacing, colours, copy and icons.
- **Open an issue first** for anything bigger than a small fix, so we can agree on the approach before you write it.

## Ground rules

- **No new dependency, paid service or service that needs a card** without asking in the issue first. The running cost is RM0.
- **Schema changes go in a new migration** in `supabase/migrations/`, never in the Supabase dashboard. Every new table turns on Row Level Security in the same migration that creates it.
- **Only public keys reach the app:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. The service role key and the database password never go in the app, in git, in an issue or in a screenshot.
- **No hard-coded UI text.** Every string goes in both `app/src/i18n/locales/en.json` and `ms.json`.
- **Accessibility:** touch targets at least 48 dp, text at least 14 sp, 4.5:1 contrast, and never colour alone: pair it with an icon and a word.
- **Nothing blocks the screen during a walk.** Use banners, bottom sheets and snackbars; dialogs only for actions that can't be undone.
- **Alerts are worded by landmark**, never by a side of the road.
- **Keep the OpenStreetMap credit** visible on the map and in every export (ODbL).
- **No Google Maps and no `react-native-maps`.** The map is MapLibre with OpenFreeMap tiles.

## Making a change

1. Fork the repo and create a branch from `main`, for example `fix/arrival-retry` or `feat/sos-contacts`.
2. Keep commits small, with clear messages that say what changed and why.
3. Inside `app/`, run the checks:
   ```bash
   npm run typecheck
   ```
   ```bash
   npm run lint
   ```
4. Test the change on the Android Emulator or a phone, and write down the steps you used.
5. Open a pull request and fill in the template. Add screenshots for anything you can see.

## Code style

- TypeScript in strict mode. Follow the code around you: naming, file layout and how much it comments.
- Comments in plain English, short.
- Colours, spacing, radii and type come from `app/src/theme/theme.ts`, never written inline.
- One font: Atkinson Hyperlegible Next. No gradients, no emoji, no uppercase eyebrow labels.

## Reporting bugs and ideas

Use the issue templates. For a security problem, don't open an issue: see [SECURITY.md](SECURITY.md).

By taking part you agree to follow the [code of conduct](CODE_OF_CONDUCT.md). Contributions are released under the [MIT License](LICENSE).
