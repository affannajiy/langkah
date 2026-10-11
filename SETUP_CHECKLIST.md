# Langkah: setup checklist (Windows)

Everything you need to install so you can start the Claude Code build, and preview the app on your laptop as an APK, without touching your phone.

## Part A: Download and install

| # | Software | Why | Where |
|---|---|---|---|
| 1 | **Git for Windows** | Version control. Claude Code also uses its Git Bash shell. | git-scm.com/downloads/win |
| 2 | **Node.js LTS** | Runs Expo, the EAS CLI and the Supabase CLI | nodejs.org |
| 3 | **Visual Studio Code** | Editor | code.visualstudio.com |
| 4 | **Claude Code** | The AI coding agent. In PowerShell: `irm https://claude.ai/install.ps1 \| iex`, then open a new terminal and check with `claude --version`. Needs a Pro, Max, Team or Enterprise plan. | code.claude.com/docs/en/setup |
| 5 | **Android Studio** | Gives you the **Android Emulator**, a virtual phone on your desktop, plus the Android SDK and its own Java | developer.android.com/studio |
| 6 | **EAS CLI** | Builds the APK in Expo's cloud. In a terminal: `npm install -g eas-cli` | docs.expo.dev |
| 7 | **Miniforge** (data person only) | Python for `ipoh_extract.py` | github.com/conda-forge/miniforge |
| 8 | **scrcpy** (optional) | Mirrors a real Android phone onto the desktop for the pitch video | github.com/Genymobile/scrcpy |

**Not needed:**
- Docker: we use the hosted Supabase project.
- Google Maps keys: we use MapLibre and OpenFreeMap.
- Windows Subsystem for Android: discontinued in March 2025.
- Rooting or jailbreaking any phone.

**Laptop check before step 5:**
- Windows 10 or 11, 64-bit, 16 GB RAM recommended (8 GB works, but slowly), about 15 GB free disk.
- Virtualization must be on. Open Task Manager, go to Performance, then CPU, and check that it says "Virtualization: Enabled". If it doesn't, switch on Intel VT-x or AMD-V in the BIOS.

## Part B: The starter kit and repo layout

Copy the whole "Claude Code Kickoff" folder, rename the copy to `langkah`, and it is already arranged like this:

```
langkah/
  CLAUDE.md                     (from this kit)
  docs/
    Langkah Tech Stack.md       (from this kit)
    Langkah Architecture.png    (from this kit)
    langkah-colour-scheme.md    (from this kit)
    screens/                    (final screen designs, logo, loading screen, wordmark)
  assets/
    logo/                       (app icon, adaptive icon, splash mark, SVGs)
  data-scripts/
    ipoh_extract.py             (from this kit)
    requirements.txt
    .gitignore
```

Then run `git init` in the folder, start `claude` there, and paste the prompt from `KICKOFF_PROMPT.md`.

## Part C: Accounts (all free)

| Account | For | Notes |
|---|---|---|
| GitHub (Student Developer Pack) | Code repository | Invite the 3 teammates |
| Expo | EAS cloud builds | Run `eas login` once |
| Supabase | Backend | Create one project in the Singapore region (closest to Ipoh). Keep the service role key private. |
| Google Cloud | **Only** the OAuth client for Google sign-in | No Maps APIs and no billing account |
| Mapillary | Street imagery for the virtual audit | Data person only |

## Part D: Run the app on your desktop (Android Emulator)

1. **Create a virtual phone.** Open Android Studio, go to **Device Manager**, and create a device. Pick a Pixel phone with a recent Android system image (x86_64, "Google APIs"). Click Play to start it.
2. **Get the app onto it.** Once Claude Code has finished Phase 0 and built the app:
   - **Development build** (live reload while coding): run `eas build -p android --profile development`. When it finishes, accept the offer to install it on the running emulator, then run `npx expo start` in `app/`.
   - **Preview build** (runs on its own, for testers and demos): run `eas build -p android --profile preview`, then `eas build:run -p android --latest` to install it on the emulator.
   - **Any APK file:** drag it onto the emulator window, or run `adb install langkah.apk`.
3. **Fake a walk.** In the emulator, open **Extended controls** (the "..." on the side bar), go to **Location**, then **Routes**. Set a start and end point in Ipoh Old Town and press **Play route**. The app now thinks the phone is walking, which is how you test turn and hazard alerts at your desk.

## Part E: On a real phone later (still no jailbreak)

1. Open the APK link from the EAS build page on the phone, or send the APK to yourself.
2. Tap it. Android asks once to **allow installs from this source** (your browser or Files app). Allow it, and the app installs.

This is normal Android sideloading, not rooting, and it can be turned off again in Settings afterwards.

## Sources
- Claude Code setup: https://code.claude.com/docs/en/setup
- EAS APK builds: https://docs.expo.dev/build-reference/apk/
- MapLibre React Native with Expo (needs a dev build): https://maplibre.org/maplibre-react-native/docs/setup/expo
- Android Studio: https://developer.android.com/studio
- Windows Subsystem for Android end of support: https://learn.microsoft.com/en-gb/windows/android/wsa/
