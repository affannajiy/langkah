# Langkah

Pedestrian safety and navigation for central Ipoh. Langkah treats the walker the way Waze treats the car.
UTP Technopreneurship Team Project, Group 4.

The source of truth is [docs/Langkah Tech Stack.md](docs/Langkah%20Tech%20Stack.md). Project rules for AI agents are in [CLAUDE.md](CLAUDE.md).

## Repository layout

| Folder | Contents |
|---|---|
| `app/` | Expo app (SDK 57, TypeScript strict, Expo Router). Routes live in `app/src/app/`. |
| `supabase/` | Migrations, SQL functions, RLS policies, Edge Functions (from Phase 1) |
| `data-scripts/` | `ipoh_extract.py` and the loaders. `raw/` and `out/` are git-ignored. |
| `docs/` | Guide, colour scheme, architecture, final screen designs in `docs/screens/` |
| `assets/logo/` | Master logo files. `app/assets/brand/` holds copies used by the build. |
| `rulebooks/` | UI/UX, Security and Engineering rulebooks |

## Set up a Windows laptop (once)

1. Install **Git for Windows**, **Node.js LTS** and **VS Code**.
2. Install **Android Studio**, open it once and finish the setup wizard (it downloads the Android SDK and emulator).
3. In Android Studio, go to **Device Manager** and create a Pixel phone with a recent **Google APIs, x86_64** system image.
4. Install the EAS CLI and log in to Expo:
   ```bash
   npm install -g eas-cli
   eas login
   ```
5. Install the app's packages:
   ```bash
   cd app
   npm install
   ```
6. Copy `app/.env.example` to `app/.env` (Supabase values are needed from Phase 2 onwards).

## Build and run on the Android Emulator

Expo Go cannot run MapLibre, so we use our own development build. You only rebuild it when a native package changes.

1. Link the project to your Expo account (first time only, inside `app/`):
   ```bash
   eas init
   ```
2. Build the development APK in Expo's cloud (free tier, about 10 to 20 minutes):
   ```bash
   eas build -p android --profile development
   ```
3. Start the emulator from Android Studio. When the build finishes, answer **Yes** to "Install and run on emulator?".
4. Start the dev server and press `a` to open the app on the emulator:
   ```bash
   npm start
   ```
5. To fake your location: in the emulator, click **...** (Extended controls), go to **Location**, search "Ipoh Railway Station", then click **Set location**.

A **preview** APK runs on its own without a laptop. It is for testers and the demo:

```bash
eas build -p android --profile preview
```

Install it on a real phone by opening the APK link. Android asks once to allow installs from that source. No rooting or jailbreak is needed.

## Checks

Run inside `app/`:

```bash
npm run typecheck
npm run doctor
```

## Credits

Map data © OpenStreetMap contributors (ODbL 1.0). Tiles by OpenFreeMap / OpenMapTiles. Font: Atkinson Hyperlegible Next by the Braille Institute (SIL OFL).
