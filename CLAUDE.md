# Langkah: project rules for Claude Code

Langkah is a pedestrian safety and navigation Android app for Ipoh, Malaysia, built by Group 4 of UTP's Technopreneurship Team Project. It looks at the city from the walker's point of view: the pedestrian is treated the way Waze treats the car.

**Source of truth:** `docs/Langkah Tech Stack.md`. Read the relevant section before working on any feature, and cite the section number in your plan. If the code and the guide disagree, stop and ask. Do not silently pick one.

## Stack (do not change without asking)
- **App:** Expo (latest stable SDK), React Native, TypeScript in strict mode, Expo Router with a bottom tab bar (Map, Community, Me).
- **Map:** `@maplibre/maplibre-react-native` with the OpenFreeMap Positron style (`https://tiles.openfreemap.org/styles/positron`), restyled to Langkah colours. **No Google Maps and no `react-native-maps`.**
- **Builds:** EAS development build (Expo Go cannot run MapLibre). Android only for the MVP.
- **Backend:** Supabase.
  - Auth: anonymous guest sign-in plus Google sign-in.
  - Postgres with PostGIS, pgRouting and pg_trgm.
  - Storage for report photos.
  - Edge Functions in TypeScript, scheduled with pg_cron.
- **Data:** Python scripts in `data-scripts/` (pyosmium, shapely, pyproj). OpenStreetMap data is ODbL, so the "(c) OpenStreetMap contributors" credit must stay visible on the map.
- **Translations:** i18next with expo-localization. English and Bahasa Melayu from day one, with no hard-coded UI strings.
- **Budget:** RM0. Never add a paid service, or one that needs a card on file, without asking first.

## Repository layout
- `app/`: the Expo app
- `supabase/`: migrations, SQL functions, RLS policies, Edge Functions
- `data-scripts/`: `ipoh_extract.py`, the loaders and the scoring scripts. The `raw/` and `out/` folders are git-ignored.
- `docs/`: the guide, the colour scheme and diagrams
- `docs/screens/`: the 8 FINAL screen designs as PNGs, plus the logo boards. Match them closely.
- `assets/logo/`: the final logo files (app icon, Android adaptive icon foreground, splash mark, SVGs)

## Final design (Section 6.4 of the guide)
- **The screen PNGs in `docs/screens/` are the visual spec.** Build each screen to match its PNG: layout, spacing, colours, copy and icon shapes. If a PNG and the guide disagree, ask.
- **Font:** Atkinson Hyperlegible Next (Google Fonts, via `@expo-google-fonts/atkinson-hyperlegible-next` or the font files), weights 400 to 700. Never Inter or the system default.
- **Logo:** a person and their shadow forming an L. App icon `assets/logo/icon-1024.png`. Android adaptive icon foreground `assets/logo/adaptive-icon-foreground-1024.png` with background colour #0F2A47. Splash: navy #0F2A47 with `splash-mark-white-512.png`, the word "Langkah" and the tagline "Lebih selamat".
- **Hazard pins on the map:** orange #E69F00 diamonds with a dark outline and an exclamation mark, like Malaysian road warning signs. Crossings are light blue rounded squares with stripes, bus stops pink rounded squares.
- **No AI-template look:** no gradients, no emoji, no uppercase eyebrow labels, no identical placeholder cards. Use real report photos where the design shows them.

## UX rules (Sections 5 and 6 of the guide)
- **Nothing may block the screen during navigation.**
  - Use banners for time-sensitive information and bottom sheets for choices and forms.
  - Use snackbars (about 3 s) to confirm actions.
  - Use dialogs only for actions that cannot be undone.
- **Haptics come first, then text:**
  - one short pulse for a turn
  - two pulses for a hazard ahead
  - one long pulse on arrival
- **Never use colour alone.** Pair every colour with an icon and a word.
  - Touch targets are at least 48 dp, text at least 14 sp, with 4.5:1 contrast.
  - Route lines differ by pattern: safest is solid teal, fastest is dashed grey, unchecked streets are dotted.
- **Colours:**

  | Use | Colour |
  |---|---|
  | Navy | #0F2A47 |
  | Surface | #F5F5F5 |
  | Interactive | #56B4E9 |
  | Safe / confirmed | #009E73 |
  | Hazard / caution | #E69F00 |
  | Community | #CC79A7 |
  | Text | #1A1A2E |

- **Theme:** one font (Atkinson Hyperlegible Next), an 8 dp spacing grid, sheets with 16 dp corners and cards with 12 dp corners. All tokens live in one theme file.
- **Alerts are worded by landmark**, never by an assumed side of the road, because phone GPS is only accurate to 5 to 10 m.

## Data and payload rules (Section 7.4)
- The phone never downloads the dataset.
  - Routes come back as encoded polylines.
  - Hazards and amenities are fetched for the visible map area only.
  - Coordinates are rounded to 5 decimals.
- Report photos are resized to about 1280 px wide JPEG at about 70% quality before upload.

## Security
- Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` may reach the app. Keep the service role key out of the app and out of git.
- `.env` files are git-ignored. Keep `.env.example` up to date.
- Turn on Row Level Security for every table in the same migration that creates it.

## How to work with me
- **Work in the phases from the kickoff prompt.** At the end of each phase:
  1. Stop.
  2. Summarise what changed.
  3. List exactly how to test it on the Android Emulator.
  4. Wait for my OK.
- **Ask before:**
  - adding a dependency that isn't listed here
  - changing the database schema outside a migration
  - anything that costs money
- **Git:** small commits on feature branches, with clear messages.
- **Check before you rely on it:** for anything version-specific (Expo SDK, MapLibre, pgRouting functions), look at the installed version and its docs instead of relying on memory. For example, prefer non-deprecated pgRouting functions such as `pgr_extractVertices` over `pgr_createTopology`.
- **Comments:** write code comments in plain English, short.
