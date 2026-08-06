import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { CapacityView } from '../../../hooks';
import { ColorScheme, radii } from '../../../constants/colors';

/**
 * "4 of 5 services", drawn BEFORE the Add button — PARTNERS_PLAN §12.9: never
 * a 402 after the form. `cap` comes from `usePlanUsage().capacity('max_services')`.
 *
 * A services-specific twin of `catalog/components/UsageMeterBar.tsx` rather
 * than a reuse of it: that component's "not included" copy names the
 * catalogue by name, which would be the wrong sentence on this screen.
 */
export function ServiceUsageMeterBar({ cap, c }: { cap: CapacityView; c: ColorScheme }) {
  if (cap.comingSoon) {
    return (
      <View style={[styles.box, { backgroundColor: c.surfaceVariant }]}>
        <Text style={[styles.text, { color: c.textSecondary }]}>Service limits — coming soon</Text>
      </View>
    );
  }

  if (!cap.included) {
    return (
      <View style={[styles.box, { backgroundColor: c.error + '14' }]}>
        <Text style={[styles.text, { color: c.error }]}>
          Your plan does not include a price list. Upgrade from More → Settings to add services.
        </Text>
      </View>
    );
  }

  if (cap.limit === null) {
    return (
      <View style={[styles.box, { backgroundColor: c.surfaceVariant }]}>
        <Text style={[styles.text, { color: c.textSecondary }]}>{cap.used} services · unlimited on your plan</Text>
      </View>
    );
  }

  const fraction = cap.fraction ?? 0;
  const tone = cap.atLimit ? c.error : fraction > 0.8 ? c.warning : c.primary;

  return (
    <View style={[styles.box, { backgroundColor: c.surfaceVariant }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.text, { color: c.textPrimary }]}>
          {cap.used} of {cap.limit} {cap.noun || 'services'}
        </Text>
        {cap.atLimit && <Text style={[styles.atLimit, { color: c.error }]}>Limit reached</Text>}
      </View>
      <View style={[styles.track, { backgroundColor: c.divider }]}>
        <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: tone }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radii.sm, padding: 10, gap: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  text: { fontSize: 12.5, fontWeight: '600' },
  atLimit: { fontSize: 11.5, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
