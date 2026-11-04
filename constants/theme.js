/**
 * The phone app's colors and text sizes — the ONE place they're written down.
 *
 * tailwind.config.js reads this file for its theme, so `text-up`, `bg-brand-500`
 * and `text-2xs` come from here; code that needs a raw value (an icon's color,
 * an ActivityIndicator, a placeholder) imports `COLORS` from here instead of
 * typing a hex. CommonJS because tailwind.config.js is loaded by Node.
 * See ENG-259 (one look across Search) and ENG-260 (one up/down color).
 */

const brand = {
  50: '#f0f9ff',
  100: '#e0f2fe',
  200: '#bae6fd',
  300: '#7dd3fc',
  400: '#38bdf8',
  500: '#0ea5e9',
  600: '#0284c7',
  700: '#0369a1',
  800: '#075985',
  900: '#0c4a6e',
};

/** Dark surfaces, from the page (0) up to the most raised control (5). */
const surface = {
  0: '#000000',
  1: '#111111',
  2: '#1a1a1a',
  3: '#242424',
  4: '#2e2e2e',
  5: '#383838',
};

const palette = {
  brand,
  surface,
  tier: {
    basic: '#6366f1',
    pro: '#8b5cf6',
    legendary: '#f59e0b',
  },
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  muted: '#6b7280',
  /**
   * A change that went up / down / didn't move — prices, momentum, sell-through.
   * One green and one red everywhere (lib/trend.ts picks between them), always
   * with a ▲/▼ so color is never the only signal.
   */
  up: '#34d399',
  down: '#f87171',
  flat: '#9ca3af',
  /**
   * A score from best to worst — sell-through rate, a card's grade, how sure
   * a reading is, how bad a defect is. `scale-good` … `scale-poor`; never a hex.
   */
  scale: {
    good: '#22c55e',
    fair: '#facc15',
    weak: '#f97316',
    poor: '#ef4444',
  },
};

/** Raw values for props that take a color, not a class. */
const COLORS = {
  accent: brand[500],
  accentText: brand[400],
  white: '#ffffff',
  black: '#000000',
  /** Placeholder text in a TextInput. */
  placeholder: palette.muted,
  /** Chevrons, close buttons and other quiet icons. */
  icon: '#9ca3af',
  muted: palette.muted,
  up: palette.up,
  down: palette.down,
  flat: palette.flat,
  warning: palette.warning,
  danger: palette.danger,
  success: palette.success,
  scale: palette.scale,
  surface,
  /** A selected row or option behind its content: the accent at 13% (hex alpha "22"). */
  selectedFill: `${brand[500]}22`,
  /** Switch track when on / off (react-native Switch). */
  switchOn: `${brand[500]}66`,
  switchOff: surface[5],
  /** Chart lines, grid and axis text (components/ebay/PriceChart.tsx). */
  chartLine: brand[500],
  chartGrid: surface[3],
  chartAxis: palette.muted,
};

/**
 * The text scale: Tailwind's xs–3xl plus one smaller step for badges, tags and
 * the section bar's labels. Nothing in between — no text-[10px]/[11px].
 */
const fontSize = {
  '2xs': ['11px', { lineHeight: '14px' }],
};

/**
 * Picture sizes, in dp, for item photos and card art in a list. Use these
 * instead of typing a width/height on an <Image>.
 */
const SIZES = {
  /** A small photo beside one line of text (sold listings). */
  thumbSm: 48,
  /** The photo in a result row (eBay, Radar, Facebook, Music). */
  thumb: 72,
  /** The big photo at the top of a detail screen. */
  thumbLg: 120,
  /** Rounded corners on a photo. */
  thumbRadius: 12,
  /** A trading card or game box: portrait, 5 : 7. */
  cardArtWidth: 60,
  cardArtHeight: 84,
};

module.exports = { palette, COLORS, fontSize, SIZES };
