# Changelog

## Phase 0: Foundations (2026-10-10)

### Added
- Expo SDK 57 app in `app/`: TypeScript strict (plus `noUncheckedIndexedAccess`), Expo Router with routes in `app/src/app/`, bottom tabs Map, Community, Me. Android package `com.langkah.app`.
- Theme file `app/src/theme/theme.ts`: brand colours, darker text-safe variants that pass 4.5:1, 8 dp spacing, 12/16 dp radii, type scale from guide Section 6.2.
- Atkinson Hyperlegible Next 400 to 700, embedded at build time through the `expo-font` config plugin.
- i18n with i18next and expo-localization: `en.json` and `ms.json`, typed keys, follows the phone language with English as the fallback.
- App icon, Android adaptive icon (navy background), and native splash (white mark on navy), followed by a JS loading screen that matches `docs/screens/Splash.png`.
- Map tab: MapLibre with OpenFreeMap Positron and a light Langkah recolour, framed on central Ipoh, user location dot, recentre button, visible "© OpenStreetMap contributors" credit (tap for full credits), and an error banner if the map fails to load.
- Location rationale sheet (EN/BM) before the Android permission dialog, and a "Location is off" sheet with Open Settings when permission is blocked.
- `eas.json` with `development` (dev client, APK) and `preview` (APK) profiles.
- Root README, `.gitignore`, `app/.env.example`.

### Decisions
- The native Android 12+ splash can only show an icon, so the wordmark, tagline and progress bar live in the JS loading screen.
- The day/night chip will control scoring. The dark night map switches on automatically after sunset (Phase 6).
- Saved-place chips (Home, UTP, Work) will be user-defined. A place outside the pilot area gets a friendly "outside the Ipoh pilot" state.
- Storage and background location permissions are blocked for now (least privilege).
- `react-dom` is pinned to the React version through npm `overrides`. `expo-router` pulls it in as a peer, and npm 10 on EAS refused the newer 19.3.0.
- EAS project linked: owner `affannajiy`, `extra.eas.projectId` set in `app.config.ts`.

### Known issues
- `npm audit` reports 30 issues (19 high), all in transitive dependencies of the Expo CLI and build tooling (`braces`, `node-forge`, `uuid`, `decode-uri-component`). They are not in the app bundle. `npm audit fix --force` would break the SDK 57 version pins, so we wait for upstream Expo fixes. Check again at each phase.
- ESLint and Prettier are not set up yet (they need approval as new dev dependencies).
