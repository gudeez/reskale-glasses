type Shades = Record<number, string>;
type Scale = { good: string; fair: string; weak: string; poor: string };

export declare const palette: {
  brand: Shades;
  surface: Shades;
  tier: { basic: string; pro: string; legendary: string };
  success: string;
  warning: string;
  danger: string;
  muted: string;
  up: string;
  down: string;
  flat: string;
  scale: Scale;
};

export declare const COLORS: {
  accent: string;
  accentText: string;
  white: string;
  black: string;
  placeholder: string;
  icon: string;
  muted: string;
  up: string;
  down: string;
  flat: string;
  warning: string;
  danger: string;
  success: string;
  scale: Scale;
  surface: Shades;
  selectedFill: string;
  switchOn: string;
  switchOff: string;
  chartLine: string;
  chartGrid: string;
  chartAxis: string;
};

export declare const fontSize: Record<string, [string, { lineHeight: string }]>;

export declare const SIZES: {
  thumbSm: number;
  thumb: number;
  thumbLg: number;
  thumbRadius: number;
  cardArtWidth: number;
  cardArtHeight: number;
};
