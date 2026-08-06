import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ColorScheme, radii } from '../../../constants/colors';
import { Kpi, formatKpiValue, kpiToneColor } from '../../../api/analytics.api';
import { Sparkline, SparklinePoint } from '../../../components/charts';

/**
 * One tile of the Today board's KPI row — a headline number plus, where the
 * board actually carries a time series for it, a 14-day trend line.
 *
 * `sparkline` is deliberately OPTIONAL rather than always drawn: the board
 * behind this screen (`GET /analytics/partner/today`) publishes exactly one
 * series (`sales`, the 14-day sparkline the plan calls for), so it is wired
 * to the tiles that ARE that trend — today's sale and today's orders, both
 * drawn from the same underlying activity. `pending_decisions` and
 * `low_stock` are live gauges, not a history, and this codebase's own rule
 * for every other chart here is "never draw a shape the data does not
 * support" (see `Sparkline`'s own empty-state handling) — so those two tiles
 * render as a plain number instead of a fabricated flat line standing in for
 * a trend nobody measured.
 */
export function TodayKpiTile({
  c,
  kpi,
  icon,
  sparkline,
  sparklineColor,
}: {
  c: ColorScheme;
  kpi: Kpi;
  icon: string;
  sparkline?: SparklinePoint[];
  sparklineColor?: string;
}) {
  const toneColor = kpiToneColor(kpi, c);

  return (
    <View style={[styles.tile, { backgroundColor: c.surface }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: c.surfaceVariant }]}>
          <MaterialCommunityIcons name={icon as never} size={16} color={c.primary} />
        </View>
        <Text style={[styles.label, { color: c.textSecondary }]} numberOfLines={1}>
          {kpi.label}
        </Text>
      </View>

      <Text style={[styles.value, { color: c.textPrimary }]} numberOfLines={1}>
        {formatKpiValue(kpi.value, kpi.unit)}
      </Text>

      <View style={styles.footerRow}>
        {kpi.deltaPercent !== null ? (
          <Text style={[styles.delta, { color: toneColor }]}>
            {kpi.direction === 'UP' ? '▲' : kpi.direction === 'DOWN' ? '▼' : ''} {Math.abs(kpi.deltaPercent).toFixed(1)}%
          </Text>
        ) : kpi.reason ? (
          <Text style={[styles.delta, { color: c.textDisabled }]} numberOfLines={2}>
            {kpi.reason}
          </Text>
        ) : (
          <View />
        )}
        {sparkline ? (
          <Sparkline c={c} points={sparkline} color={sparklineColor} width={64} height={24} strokeWidth={1.5} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flexBasis: '48%', flexGrow: 1, borderRadius: radii.card, padding: 14, gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconWrap: { width: 24, height: 24, borderRadius: radii.xs, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '700', flex: 1, textTransform: 'uppercase', letterSpacing: 0.3 },
  value: { fontSize: 20, fontWeight: '800' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24 },
  delta: { fontSize: 11, fontWeight: '700', flex: 1 },
});
