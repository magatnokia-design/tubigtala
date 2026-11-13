/**
 * TubigTala design tokens: the one source of colours, spacing and corner sizes for the app
 * (constants/theme.ts re-exports them) AND the landing page (website/). Plain values only - no
 * React Native or CSS imports - so the website's Vite build can import this file directly.
 * Water blues on white; the app is light-only by design.
 */

export const palette = {
  text: '#0B2540', // deep water navy
  background: '#FFFFFF',
  backgroundElement: '#EEF7FD', // pale water, cards
  backgroundSelected: '#D7ECFA',
  textSecondary: '#4F6B85',
  tint: '#0079CE', // logo blue: buttons, header, accents, splash background
  tintDeep: '#085698', // logo deep blue: pressed states, centre tab
  onTint: '#FFFFFF',
  border: '#CFE4F3',
  live: '#13865A',
  stale: '#B26A00',
  offline: '#C9372C',
  noData: '#4F6B85',
  notice: '#E3F2FC',
  onNotice: '#0B3D63',
  warning: '#FFF4DE',
  onWarning: '#6B4100',
  // Reading status (domain/thresholds.ts): text/border colour and soft background
  levelNormal: '#13865A',
  levelNormalBg: '#E7F6EE',
  levelWarning: '#B26A00',
  levelWarningBg: '#FFF4DE',
  levelCritical: '#C9372C',
  levelCriticalBg: '#FDECEA',
  overlay: 'rgba(11,37,64,0.45)',
  // Gauge tracks on the Water tab (pH acidic / neutral / basic; temperature cool / warm)
  scaleAcid: '#F5A35C',
  scaleNeutral: '#3CC28A',
  scaleBase: '#6A7FE0',
  scaleCool: '#7CC3F0',
  scaleWarm: '#F2A65A',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 10, card: 18, pill: 999 } as const;
