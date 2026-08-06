import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { ColorScheme, radii } from '../../constants/colors';

/**
 * A single proportional bar — `value` of `max` — for anything that reads as
 * "how full": a stock level against its low-stock threshold, one ranked row
 * of a "top items" list. Plain `View`s rather than SVG: a filled rectangle
 * gains nothing from the SVG runtime, and every OTHER primitive in this
 * folder (`Sparkline`, `MiniBars`, `DonutRing`) needs it for real geometry.
 *
 * EMPTY: `max <= 0` draws a zero-width track in `c.divider`, never a filled
 * bar — there is nothing to be "full" of.
 */
export function ProgressBar({
  c,
  value,
  max,
  color,
  height = 8,
  label,
  valueLabel,
  tone = 'default',
  accessibilityLabel,
}: {
  c: ColorScheme;
  value: number;
  max: number;
  /** Overrides `tone`. */
  color?: string;
  height?: number;
  label?: string;
  valueLabel?: string;
  tone?: 'default' | 'warn' | 'danger';
  /** Full override for the screen-reader summary. */
  accessibilityLabel?: string;
}) {
  const safeMax = max > 0 ? max : 0;
  const fraction = safeMax > 0 ? Math.min(1, Math.max(0, value / safeMax)) : 0;
  const barColor = color ?? (tone === 'danger' ? c.error : tone === 'warn' ? c.warning : c.primary);
  const shownValue = valueLabel ?? (safeMax > 0 ? `${Math.round(fraction * 100)}%` : '—');
  const defaultA11yLabel = `${label ?? 'Progress'}: ${shownValue}${safeMax > 0 ? ` (${value} of ${max})` : ''}`;

  return (
    <View style={{ gap: 4 }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? defaultA11yLabel}>
      {(label || valueLabel || safeMax > 0) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          {label ? (
            <Text style={{ fontSize: 12, color: c.textSecondary, flex: 1 }} numberOfLines={1}>
              {label}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {/* Always a visible number when there's one to show — the fill's
              width was never the only signal, per the house accessibility rule. */}
          <Text style={{ fontSize: 12, fontWeight: '700', color: c.textPrimary }} numberOfLines={1}>
            {shownValue}
          </Text>
        </View>
      )}
      <View style={{ height, borderRadius: radii.pill, backgroundColor: c.divider, overflow: 'hidden' }}>
        <View
          style={{
            height,
            width: `${fraction * 100}%`,
            borderRadius: radii.pill,
            backgroundColor: safeMax > 0 ? barColor : c.divider,
          }}
        />
      </View>
    </View>
  );
}
