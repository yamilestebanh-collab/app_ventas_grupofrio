/**
 * Design tokens extracted from kold_field_v2_25screens.html CSS.
 * DARK MODE ONLY — no light theme.
 *
 * Every color, spacing, radius value comes from the mockup.
 * Do NOT add colors not in this file without updating the mockup first.
 */

export const colors = {
  // Brand
  primary: '#FF6B35',       // --k-o  Naranja KOLD
  primaryDark: '#E85D26',   // --k-od Pressed state
  primaryAlpha12: 'rgba(255,107,53,0.12)',
  primaryAlpha08: 'rgba(255,107,53,0.08)',
  primaryAlpha04: 'rgba(255,107,53,0.04)',

  // Backgrounds
  bg: '#0F1419',            // --k-bg  Main background
  card: '#1A1F26',          // --k-c   Card surface
  cardLighter: '#242B34',   // --k-c2  Inputs, secondary surfaces
  surface: '#141920',       // --k-s   Subtle surface

  // Text
  text: '#F0F0F0',          // --k-t   Primary text
  textDim: '#8B95A3',       // --k-td  Secondary text
  textOnPrimary: '#FFFFFF',

  // Semantic
  success: '#22C55E',       // --k-g
  successAlpha12: 'rgba(34,197,94,0.12)',
  successAlpha08: 'rgba(34,197,94,0.08)',

  error: '#EF4444',         // --k-r
  errorAlpha12: 'rgba(239,68,68,0.12)',
  errorAlpha08: 'rgba(239,68,68,0.08)',

  warning: '#F59E0B',       // --k-y
  warningAlpha12: 'rgba(245,158,11,0.12)',
  warningAlpha08: 'rgba(245,158,11,0.08)',

  info: '#3B82F6',          // --k-b
  infoAlpha12: 'rgba(59,130,246,0.12)',
  infoAlpha08: 'rgba(59,130,246,0.08)',

  cyan: '#06B6D4',          // --k-cy  Diamond, loyalty
  cyanAlpha12: 'rgba(6,182,212,0.12)',

  purple: '#8B5CF6',        // --k-p   Probability
  purpleAlpha12: 'rgba(139,92,246,0.12)',

  // Borders
  border: 'rgba(255,255,255,0.05)',
  borderLight: 'rgba(255,255,255,0.08)',
} as const;

export const spacing = {
  screenPadding: 20,
  cardPadding: 14,
  cardPaddingLg: 16,
  cardGap: 10,
  sectionGapTop: 16,
  sectionGapBottom: 8,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 14,
  xxl: 20,
} as const;

export const radii = {
  card: 14,
  button: 8,
  badge: 16,
  circle: 999,
  sm: 6,
  xs: 3,
} as const;

export const sizes = {
  statusBarHeight: 44,
  topBarHeight: 44,
  bottomNavHeight: 58,
  buttonMinHeight: 48,
  buttonSmMinHeight: 38,
  scoreRing: 50,
  scoreRingInner: 38,
  backButton: 34,
  iconSize: 18,
} as const;

// Badge variant colors
export const badgeVariants = {
  orange: { bg: colors.primaryAlpha12, text: colors.primary },
  green: { bg: colors.successAlpha12, text: colors.success },
  red: { bg: colors.errorAlpha12, text: colors.error },
  yellow: { bg: colors.warningAlpha12, text: colors.warning },
  blue: { bg: colors.infoAlpha12, text: colors.info },
  cyan: { bg: colors.cyanAlpha12, text: colors.cyan },
  purple: { bg: colors.purpleAlpha12, text: colors.purple },
  dim: { bg: 'rgba(139,149,163,0.08)', text: colors.textDim },
} as const;

export type BadgeVariant = keyof typeof badgeVariants;

// Stop card border colors by state
export const stopStateColors: Record<string, string> = {
  pending: colors.textDim,
  in_progress: colors.primary,
  done: colors.success,
  not_visited: colors.error,
  no_stock: colors.error,
  rejected: colors.error,
  closed: colors.textDim,
};
