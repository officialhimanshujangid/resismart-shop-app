import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  if (cap.comingSoon) {
    return (
      <View style={[styles.box, { backgroundColor: c.surfaceVariant }]}>
        <Text style={[styles.text, { color: c.textSecondary }]}>{t('services.meter.comingSoon')}</Text>
      </View>
    );
  }

  // >>> X2F — services share the ONE catalogue-items meter with products. Every
  // plan has a catalogue, so "not included" is never true: while loading, draw nothing.
  if (!cap.included) return null;

  if (cap.limit === null) {
    return (
      <View style={[styles.box, { backgroundColor: c.surfaceVariant }]}>
        <Text style={[styles.text, { color: c.textSecondary }]}>{t('planItems.unlimited', { used: cap.used })}</Text>
      </View>
    );
  }
  // <<< X2F

  const fraction = cap.fraction ?? 0;
  const tone = cap.atLimit ? c.error : fraction > 0.8 ? c.warning : c.primary;

  return (
    <View style={[styles.box, { backgroundColor: c.surfaceVariant }]}>
      <View style={styles.headerRow}>
        {/* `noun` is the SERVER's word and arrives in English — the same trade
            `features/billing/components/UsageMeter.tsx` documents. The fallback
            when the server sends none IS ours, so that one is translated. */}
        <Text style={[styles.text, { color: c.textPrimary }]}>
          {t('planItems.ofLimit', { used: cap.used, limit: cap.limit }) /* X2F */}
        </Text>
        {cap.atLimit && <Text style={[styles.atLimit, { color: c.error }]}>{t('services.meter.limitReached')}</Text>}
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
  atLimit: { fontSize: 11.5, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
