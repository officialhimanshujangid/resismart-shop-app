import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { CapacityView } from '../../../hooks';
import { ColorScheme, radii } from '../../../constants/colors';

/**
 * "42 of 50 invoices this month", drawn BEFORE the create/issue button —
 * PARTNERS_PLAN §12.9's rule: never a 402 after the form. Renders nothing
 * when the plan does not sell the capability at all (`included: false`) or
 * while it is unknown (`limit: 0` with `atLimit: false`, `usePlanUsage`'s
 * deliberately-not-blocking answer while loading) — a meter with nothing to
 * show is worse than no meter.
 */
export function UsageMeter({ capacity, c }: { capacity: CapacityView; c: ColorScheme }) {
  if (!capacity.included || !capacity.noun) return null;

  const unlimited = capacity.limit === null;
  const tone = capacity.atLimit ? c.error : capacity.fraction && capacity.fraction > 0.8 ? c.warning : c.primary;

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: c.textSecondary }]}>
          {unlimited ? `${capacity.used} ${capacity.noun}` : `${capacity.used} of ${capacity.limit} ${capacity.noun}`}
        </Text>
        {capacity.atLimit && (
          <Text style={[styles.limitLabel, { color: c.error }]}>Limit reached</Text>
        )}
      </View>
      {!unlimited && capacity.fraction !== null && (
        <ProgressBar progress={capacity.fraction} color={tone} style={[styles.bar, { backgroundColor: c.surfaceVariant }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '600' },
  limitLabel: { fontSize: 12, fontWeight: '700' },
  bar: { height: 6, borderRadius: radii.xs },
});
