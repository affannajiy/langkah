// All design tokens live here (guide Section 6.2, CLAUDE.md "Theme").
// Brand colours are for fills and icons. Text uses the *Text variants,
// which pass 4.5:1 on white and on their soft backgrounds.

export const colors = {
  // Brand (Okabe-Ito based)
  navy: '#0F2A47',
  surface: '#F5F5F5',
  white: '#FFFFFF',
  interactive: '#56B4E9',
  safe: '#009E73',
  hazard: '#E69F00',
  community: '#CC79A7',
  text: '#1A1A2E',

  // Text-safe variants (4.5:1 or better)
  textMuted: '#4B5563',
  interactiveText: '#1F6FB2',
  safeText: '#007A5A',
  hazardText: '#8A5A00',
  communityText: '#A0457A',
  onNavyAccent: '#B9D9F2',

  // Soft fills for chips, selected cards and the active tab
  interactiveSoft: '#E3F0FB',
  safeSoft: '#E3F4EE',
  hazardSoft: '#FDF3E0',
  communitySoft: '#F8E8F1',
  safeBadge: '#CDEBE0',
  neutralBadge: '#E8EBEF',

  // Base map land colour, shown while tiles load
  mapLand: '#E9ECF1',

  // Route lines (Section 6.2): safest solid teal with a white outline, fastest dashed grey.
  routeFastest: '#5B6472',
  routeOutline: '#FFFFFF',

  // Walked part of the line during a walk
  routeWalked: '#A7B0BC',

  // Raised box on navy (turn arrow on the instruction card)
  navyRaised: '#1E3F66',

  // The user's position dot and its soft halo
  userDot: '#1F6FB2',
  userHalo: 'rgba(86, 180, 233, 0.3)',

  border: '#D9DEE5',
  handle: '#C9D0D9',
  scrim: 'rgba(15, 42, 71, 0.45)',
} as const;

// 8 dp grid
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  card: 12,
  sheet: 16,
  pill: 999,
} as const;

// Minimum touch target (Section 5.4)
export const touchTarget = 48;

export const fontFamily = 'AtkinsonHyperlegibleNext';

// Type scale from Section 6.2. Sizes in sp. Nothing under 14 except the map credit.
export const type = {
  instruction: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
} as const;

export type TypeVariant = keyof typeof type;

export const shadow = {
  // Soft shadow, only for sheets and floating buttons
  floating: {
    elevation: 4,
    shadowColor: '#0F2A47',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
} as const;

export const theme = { colors, spacing, radius, touchTarget, fontFamily, type, shadow };
