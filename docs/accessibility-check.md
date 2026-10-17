# Accessibility check (guide Section 5.4, CLAUDE.md "UX rules")

Run this on the preview APK before the demo, and again after any screen changes.
Part A was checked in the code in Phase 7. Part B needs a person with the emulator
or a phone: tick each box.

## A. Code check (Phase 7)

| Rule | Result |
|---|---|
| Text at least 14 sp | Pass. Every style uses the theme scale (14 sp and up). The one exception is the "© OpenStreetMap contributors" map credit at 12 sp, a legal credit and not UI copy. |
| Contrast 4.5:1 for text | Fixed one fail: the "Safest" badge (teal text on the light green chip) was 4.21:1. `safeText` is now #006B4F: 5.15:1 on the chip, 6.53:1 on white. Every other text colour and background pair the app uses passes. |
| Touch targets at least 48 dp | Fixed one fail: the map credit's tap area was about 36 dp tall and is now 48 dp. The other small boxes found (Me list icons at 40 dp, the tab icon pill, the onboarding reason icons, the peek sheet count rows) are decorations inside a larger button, or not tappable. |
| Never colour alone | Pass. Route cards carry an icon and a word (shield + Safest, dashed line + Fastest), status chips carry an icon and a word, hazard pins are diamond shapes with "!", route lines differ by pattern (solid, dashed, dotted). |
| Screen reader labels | Pass. Every icon-only button has an `accessibilityLabel`. Every tappable element has a role. |
| Nothing blocks the screen during a walk | Pass. Banners and bottom sheets only. The one dialog is "Delete report", which cannot be undone. |

## B. Manual check on the emulator or a phone

**TalkBack** (Settings > Accessibility > TalkBack, or `adb shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService`):

- [ ] Map: swipe through the search bar, layers, recentre and tabs. Each one reads a clear name.
- [ ] Route compare: each card reads its time, its distance and Safest or Fastest.
- [ ] Walk: the turn card and the hazard banner are read out when they appear.
- [ ] Arrival: the five rating faces read "Very unsafe" to "Very safe" and say which one is selected.
- [ ] Report flow: category tiles, Take photo and Send all have names.

**Big text** (Settings > Display > Font size at the largest, and Display size at the largest):

- [ ] No text is cut off on the map, the route cards, the walk banner, Arrival, Community and Me.
- [ ] Bottom sheets still scroll to their last button.

**Other phone sizes** (emulator; undo with `adb shell wm density reset` and font scale 1.0):

```bash
adb shell wm density 540
adb shell settings put system font_scale 2.0
adb shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.threebutton
```

- [ ] 320 dp wide, text at 2.0x, 3-button bar: the tab bar shows all three tabs, no sheet peeks over it, Start is visible on route compare, the walk bar fits.
- [ ] Same with gesture navigation (`...navbar.gestural`).

**Outdoors and one hand:**

- [ ] Brightness at full, outdoors or under a desk lamp: the route line, hazard pins and banners are easy to see.
- [ ] Every button used during a walk (Quick report, End, recentre) is reachable with the thumb of the hand holding the phone.
- [ ] Haptics on a real phone: one short pulse for a turn, two pulses for a hazard ahead, one long pulse on arrival.

**Bahasa Melayu:**

- [ ] Switch to Bahasa Melayu in Me > Settings. Repeat the walk. No English left, nothing cut off (Malay strings are often longer).
