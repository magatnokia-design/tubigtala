import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { chartSeries, niceTicks, stats, type Point } from '@/domain/readings';
import { formatClock, formatDateTime } from '@/domain/format';
import { useTheme } from '@/hooks/use-theme';

const PAD = { top: 12, right: 12, bottom: 22, left: 40 };
/** Below this height the chart tightens its top/bottom margins (Analytics on smaller phones). */
const COMPACT_BELOW = 110;
const PAD_COMPACT = { ...PAD, top: 6, bottom: 18 };
/** When the chart fills its parent: the least height it asks for. */
const MIN_FILL_HEIGHT = 60;
const MAX_POINTS = 160;
/** Default: 3 reading intervals of 60 s, the same point at which the station counts as stale. */
const DEFAULT_GAP_MS = 3 * 60_000;

/**
 * Line + soft area chart drawn with SVG. Missing values (null) and time gaps (station off or
 * offline for longer than `gapMs`) break the line rather than joining across them; a value with
 * no neighbours is drawn as a dot. The y-axis uses round numbers.
 *
 * With `height` it is that tall; without, it fills the space its parent gives it (flex: 1) and
 * measures itself, so a screen can share its height between several charts.
 */
export function LineChart({ points, decimals, color, gradientId, band, height, gapMs = DEFAULT_GAP_MS }: {
  points: Point[];
  decimals: number;
  color?: string;
  /** unique per chart on screen (SVG gradient ids are global) */
  gradientId: string;
  /** normal range, shaded behind the line */
  band?: [number, number];
  /** fixed height; leave out to fill the parent */
  height?: number;
  /** no reading for longer than this = a gap in the line */
  gapMs?: number;
}) {
  const theme = useTheme();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const width = box.width;
  const HEIGHT = height ?? box.height;
  const sizeStyle = height !== undefined ? { height } : styles.fill;
  const onLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox((b) => (b.width === w && b.height === h ? b : { width: w, height: h }));
  };
  const stroke = color ?? theme.tint;
  const data = chartSeries(points, MAX_POINTS, gapMs);
  const s = stats(data.map((p) => p.v));

  if (!s || data.length < 2) {
    // Empty frame with the same grid as a real chart, so the layout stays the same.
    return (
      <View style={[styles.empty, sizeStyle]}>
        {[0.2, 0.5, 0.8].map((f) => (
          <View key={f} style={[styles.emptyLine, { top: `${f * 100}%`, borderColor: theme.border }]} />
        ))}
        <ThemedText type="small" themeColor="textSecondary">No data yet</ThemedText>
      </View>
    );
  }

  const pad = HEIGHT < COMPACT_BELOW ? PAD_COMPACT : PAD;
  const span = s.max - s.min || Math.max(Math.abs(s.max) * 0.1, 1);
  const lo = s.min - span * 0.1;
  const hi = s.max + span * 0.1;
  const ticks = niceTicks(lo, hi, 3);
  const yMin = Math.min(lo, ticks[0] ?? lo);
  const yMax = Math.max(hi, ticks[ticks.length - 1] ?? hi);
  const tickDecimals = ticks.length > 1 && ticks.every((v) => Number.isInteger(v)) ? 0 : decimals;
  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const plotW = Math.max(width - pad.left - pad.right, 1);
  const plotH = Math.max(HEIGHT - pad.top - pad.bottom, 1);
  const x = (t: number) => pad.left + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const y = (v: number) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  // Split into runs of consecutive valid points; a null ends a run.
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (const p of data) {
    if (p.v === null) { if (run.length) runs.push(run); run = []; } else run.push(p);
  }
  if (run.length) runs.push(run);

  const dots = runs.filter((r) => r.length === 1).map((r) => r[0]);
  const line = runs.filter((r) => r.length > 1).map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v as number).toFixed(1)}`).join('')).join('');
  const area = runs
    .filter((r) => r.length > 1)
    .map((r) => `M${x(r[0].t)},${pad.top + plotH}` + r.map((p) => `L${x(p.t).toFixed(1)},${y(p.v as number).toFixed(1)}`).join('') + `L${x(r[r.length - 1].t)},${pad.top + plotH}Z`)
    .join('');
  const lastRun = runs[runs.length - 1];
  const last = lastRun[lastRun.length - 1];
  const timeLabel = t1 - t0 > 24 * 3_600_000 ? formatDateTime : formatClock;

  return (
    <View onLayout={onLayout} style={sizeStyle}>
      {width > 0 && HEIGHT > 0 && (
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((v) => (
            // Faint solid guide lines (dashed until 0.9.2): the line and the green normal band stand out.
            <Line key={v} x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={theme.border} strokeWidth={1} strokeOpacity={0.6} />
          ))}
          {ticks.map((v) => (
            <SvgText key={`l${v}`} x={pad.left - 6} y={y(v) + 4} fontSize={11} fill={theme.textSecondary} textAnchor="end" fontFamily={Fonts?.sans}>
              {v.toFixed(tickDecimals)}
            </SvgText>
          ))}
          {band && (() => {
            const top = Math.max(pad.top, Math.min(pad.top + plotH, y(band[1])));
            const bottom = Math.max(pad.top, Math.min(pad.top + plotH, y(band[0])));
            return bottom - top > 0 ? <Rect x={pad.left} y={top} width={plotW} height={bottom - top} fill={theme.levelNormal} opacity={0.08} /> : null;
          })()}
          <Path d={area} fill={`url(#${gradientId})`} />
          <Path d={line} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {dots.map((p) => (
            <Circle key={`d${p.t}`} cx={x(p.t)} cy={y(p.v as number)} r={2.5} fill={stroke} />
          ))}
          <Circle cx={x(last.t)} cy={y(last.v as number)} r={5} fill={stroke} stroke={theme.background} strokeWidth={2} />
          <SvgText x={pad.left} y={HEIGHT - 4} fontSize={11} fill={theme.textSecondary} fontFamily={Fonts?.sans}>{timeLabel(t0)}</SvgText>
          <SvgText x={width - pad.right} y={HEIGHT - 4} fontSize={11} fill={theme.textSecondary} textAnchor="end" fontFamily={Fonts?.sans}>
            {timeLabel(t1)}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: MIN_FILL_HEIGHT },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyLine: { position: 'absolute', left: PAD.left, right: PAD.right, borderTopWidth: 1, opacity: 0.6 },
});
