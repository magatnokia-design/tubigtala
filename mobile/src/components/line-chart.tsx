import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { downsample, stats, type Point } from '@/domain/readings';
import { formatClock, formatDateTime } from '@/domain/format';
import { useTheme } from '@/hooks/use-theme';

const HEIGHT = 170;
const PAD = { top: 12, right: 12, bottom: 22, left: 40 };
const MAX_POINTS = 160;

/**
 * Line + soft area chart drawn with SVG. Missing values (null) break the line rather than
 * dropping to zero; the y-range fits the data with a little headroom.
 */
export function LineChart({ points, decimals, color, gradientId }: {
  points: Point[];
  decimals: number;
  color?: string;
  /** unique per chart on screen (SVG gradient ids are global) */
  gradientId: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const stroke = color ?? theme.tint;
  const data = downsample(points, MAX_POINTS);
  const s = stats(data.map((p) => p.v));

  if (!s || data.length < 2) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">Not enough readings in this range for a chart.</ThemedText>
      </View>
    );
  }

  const span = s.max - s.min || Math.max(Math.abs(s.max) * 0.1, 1);
  const yMin = s.min - span * 0.15;
  const yMax = s.max + span * 0.15;
  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  // Split into runs of consecutive valid points; a null ends a run.
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (const p of data) {
    if (p.v === null) { if (run.length) runs.push(run); run = []; } else run.push(p);
  }
  if (run.length) runs.push(run);

  const line = runs.map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v as number).toFixed(1)}`).join('')).join('');
  const area = runs
    .filter((r) => r.length > 1)
    .map((r) => `M${x(r[0].t)},${PAD.top + plotH}` + r.map((p) => `L${x(p.t).toFixed(1)},${y(p.v as number).toFixed(1)}`).join('') + `L${x(r[r.length - 1].t)},${PAD.top + plotH}Z`)
    .join('');
  const lastRun = runs[runs.length - 1];
  const last = lastRun[lastRun.length - 1];
  const timeLabel = t1 - t0 > 24 * 3_600_000 ? formatDateTime : formatClock;
  const ticks = [yMax - (yMax - yMin) * 0.1, (yMin + yMax) / 2, yMin + (yMax - yMin) * 0.1];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((v) => (
            <Line key={v} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={theme.border} strokeDasharray="4 4" />
          ))}
          {ticks.map((v) => (
            <SvgText key={`l${v}`} x={PAD.left - 6} y={y(v) + 4} fontSize={11} fill={theme.textSecondary} textAnchor="end" fontFamily={Fonts?.sans}>
              {v.toFixed(decimals)}
            </SvgText>
          ))}
          <Path d={area} fill={`url(#${gradientId})`} />
          <Path d={line} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={x(last.t)} cy={y(last.v as number)} r={5} fill={stroke} stroke={theme.background} strokeWidth={2} />
          <SvgText x={PAD.left} y={HEIGHT - 4} fontSize={11} fill={theme.textSecondary} fontFamily={Fonts?.sans}>{timeLabel(t0)}</SvgText>
          <SvgText x={width - PAD.right} y={HEIGHT - 4} fontSize={11} fill={theme.textSecondary} textAnchor="end" fontFamily={Fonts?.sans}>
            {timeLabel(t1)}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT },
  empty: { height: HEIGHT, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
