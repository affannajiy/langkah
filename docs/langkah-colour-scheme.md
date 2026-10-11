# Langkah — Colour Scheme Reference

Base colour scheme for the Langkah pedestrian safety/navigation app. Built on the
Okabe-Ito colourblind-safe palette, chosen to stay distinguishable across protanopia,
deuteranopia, and tritanopia (the major forms of colour vision deficiency), while
avoiding the red/green pairing that causes the most confusion.

This is a starting base, not final. Colours may be adjusted as the prototype develops,
but any changes should be re-checked against a colourblind simulator before adoption.

---

## Why this palette

- Built on the Okabe-Ito palette, the standard reference set used in scientific and UI
  design specifically for colourblind accessibility.
- Avoids red vs green as a distinguishing signal entirely — the most common colourblind
  confusion line.
- Navy + sky blue as the brand identity keeps Langkah visually distinct from Grab's
  green and Waze's bright blue.
- Orange (hazard) vs teal (confirmation) gives a clear "needs attention" vs "you're
  good" visual language without touching red/green.

---

## Core palette

| Role | Colour | Hex |
|---|---|---|
| Primary (brand, base UI) | Deep navy blue | `#0F2A47` (alt: `#004369`) |
| Secondary / interactive (buttons, links, active route) | Sky blue | `#56B4E9` |
| Alert / hazard accent | Orange | `#E69F00` |
| Success / confirmation | Teal | `#009E73` |
| Optional highlight (community/upvote features) | Muted pink | `#CC79A7` |
| Neutral background | Off-white / light grey | `#F5F5F5` |
| Text | Near-black / dark navy | `#1A1A2E` |

**Rule:** Never encode meaning (hazard severity, route safety, success/failure) using
colour alone. Always pair colour with an icon, shape, border, or text label.

**Contrast check:** Verify all text/background pairs meet WCAG 2.1 minimum contrast
ratio of 4.5:1 (body text) before locking any screen design. `#0F2A47` on `#F5F5F5`
should clear this comfortably, but re-check with a contrast checker tool
(e.g. WebAIM Contrast Checker) once final shades are picked.

---

## Map layout guidance

Maps layer multiple colour-coded elements (route, hazards, amenities, terrain) at
once, so colour alone is not enough to keep them distinguishable. Shape, thickness,
border, and icon must carry meaning alongside colour.

### Base map layer
- Keep roads, buildings, and terrain in muted, low-saturation greys/off-whites so
  functional colours (route, hazards, amenities) stand out clearly.
- Avoid green for parks/greenery paired with red elsewhere — use muted olive/grey-green
  instead for base terrain.

### Route line
- Use primary navy or sky blue as a **thick, bold line** — thick lines are easier for
  the eye to interpret than thin ones.
- Add a **white outline/halo** around the route line so it stays visually distinct
  where it crosses hazard zones or other overlays.

### Hazard and amenity pins
- Never rely on pin colour alone to distinguish hazard type from amenity type — pair
  every pin with a distinct icon/shape:
  - Warning triangle → hazard
  - Umbrella → shelter
  - Striped icon → zebra crossing
  - Bus icon → bus stop
- Give every marker a **consistent white/light border** regardless of fill colour, to
  guarantee contrast against any map background (target: minimum ~11:1 contrast ratio
  via border, independent of the map's own colours).
- Use a **contrasting centre dot** (white or black depending on marker fill colour) so
  every pin has a clear focal point regardless of colour.

### Severity / status encoding
- Never encode hazard severity (minor vs. severe) using a colour gradient alone — pair
  with icon size, an exclamation count, or a text label ("Minor" / "Severe").
- For community upvote/improvement markers, show the actual upvote count as text next
  to the pin rather than relying on a colour-coded "heat" score alone.

---

## Validation tools (for future reference)

- **ColorBrewer** — colour schemes for maps, including colourblind-safe options
- **Coblis** or **Sim Daltonism** — colourblind simulators to preview mockups under
  different types of colour vision deficiency
- **WebAIM Contrast Checker** — verify text/background contrast ratios meet WCAG 2.1

Recommended: run any finalised screen or map mockup through a simulator before
committing it to the prototype or pitch deck.

---

## Open items / not yet decided

- Final exact shade of navy (`#0F2A47` vs `#004369`) — pick one once brand assets are
  in progress
- Whether the muted pink (`#CC79A7`) is used at all, or reserved only if a fifth
  distinct colour is needed for community features
- Dark mode variant (not yet explored)
