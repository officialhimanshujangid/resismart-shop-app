import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PressableScale } from '../../../theme/motion'; // M22 — press + haptic on the delivery tap
import { SuccessCheck } from '../../../components/ui/Feedback'; // M22 — the tick springs in
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { Pill } from '../../p2/ui';
import { PillButton, Stepper } from '../../p1/ui';
import { ViewRow, lineSummary, stateTone } from '../logic';

/**
 * One customer on the round. The whole row (≥64dp) is the button: one tap on a
 * DUE row marks it delivered. "Not delivered" (48dp) sits under it and is its own
 * undo. A paused / holiday row is greyed with who paused it, and still takes a
 * small "Delivered anyway" (the server counts a delivery even on a paused day).
 * "Qty" opens steppers to send a different quantity with the mark.
 */
export function DeliveryRow({
  c, v, onTap, onNotDelivered, onDeliveredAnyway, onSaveQty, disabled,
}: {
  c: ColorScheme;
  v: ViewRow;
  onTap: () => void;
  onNotDelivered: () => void;
  onDeliveredAnyway: () => void;
  onSaveQty: (edited: Record<string, number>) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState<Record<string, number>>({});
  const id = v.row.subscriptionId;
  const off = v.state === 'PAUSED' || v.state === 'HOLIDAY';
  const nd = v.state === 'NOT_DELIVERED';
  useEffect(() => { if (!open) setEdited({}); }, [open]);

  const stateLabel = `${t(`p2.subscriptions.state.${v.state}`)}${v.unsent ? ' ⏳' : ''}`;
  const heading = v.row.flatLabel || v.row.customerName;
  const tap = () => {
    if (disabled) return;
    if (v.state === 'DUE') onTap();
    else setOpen((o) => !o);
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: nd ? c.error : c.divider }]}>
      <PressableScale
        haptic={v.state === 'DUE'}
        onPress={tap}
        accessibilityRole="button"
        accessibilityLabel={`${heading}, ${stateLabel}`}
        accessibilityHint={v.state === 'DUE' ? t('p2.subscriptions.deliveries.tapHint') : undefined}
        testID={`delivery-row-${id}`}
        style={styles.main}
      >
        <View style={styles.text}>
          <Text style={[styles.flat, { color: off ? c.textSecondary : c.textPrimary }]} numberOfLines={1}>{heading}</Text>
          {v.row.flatLabel ? (
            <Text style={[styles.name, { color: c.textSecondary }]} numberOfLines={1}>{v.row.customerName}</Text>
          ) : null}
          <Text style={[styles.lines, { color: off ? c.textSecondary : c.textPrimary }]} numberOfLines={2}>
            {lineSummary(v.lines)}
          </Text>
          {v.row.pausedBy && off ? (
            <Text style={[styles.name, { color: c.warning }]} numberOfLines={1}>
              {t(`p2.subscriptions.pausedBy.${v.row.pausedBy}`)}
            </Text>
          ) : null}
        </View>
        <View style={styles.pillBox}>
          <Pill c={c} label={stateLabel} tone={stateTone(v.state)} testID={`delivery-state-${id}`} />
          {v.state === 'DELIVERED' || v.state === 'EXTRA' ? (
            <SuccessCheck size={26} />
          ) : null}
        </View>
      </PressableScale>

      <View style={styles.actions}>
        {off ? (
          <PillButton c={c} tone="outline" icon="truck-check-outline" label={t('p2.subscriptions.deliveries.deliveredAnyway')}
            onPress={onDeliveredAnyway} disabled={disabled} testID={`delivered-anyway-${id}`} />
        ) : (
          <Pressable
            onPress={onNotDelivered}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: nd, disabled: !!disabled }}
            accessibilityLabel={t('p2.subscriptions.deliveries.notDelivered')}
            testID={`not-delivered-${id}`}
            style={[styles.ndBtn, nd ? { backgroundColor: c.error, borderColor: c.error } : { borderColor: c.error }]}
          >
            <MaterialCommunityIcons name={nd ? 'undo' : 'close-circle-outline'} size={18} color={nd ? c.textInverse : c.error} />
            <Text style={{ color: nd ? c.textInverse : c.error, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
              {t('p2.subscriptions.deliveries.notDelivered')}
            </Text>
          </Pressable>
        )}
        {!nd && v.lines.length > 0 ? (
          <Pressable
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={t('p2.subscriptions.deliveries.changeQty')}
            testID={`qty-toggle-${id}`}
            style={[styles.qtyBtn, { borderColor: c.divider }]}
          >
            <Text style={{ color: c.primary, fontWeight: '600' }} numberOfLines={1}>{t('p2.subscriptions.deliveries.qty')}</Text>
            <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.primary} />
          </Pressable>
        ) : null}
      </View>

      {open && !nd ? (
        <View style={[styles.qtyPanel, { borderTopColor: c.divider }]}>
          {v.lines.map((l) => (
            <View key={l.lineKey} style={styles.qtyLine}>
              <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary }} numberOfLines={2}>{`${l.itemName} (${l.unit})`}</Text>
              <Stepper c={c} value={edited[l.lineKey] ?? l.qty} onChange={(n) => setEdited((e) => ({ ...e, [l.lineKey]: n }))}
                label={l.itemName} max={1000} step={l.qty > 0 && l.qty < 1 ? 0.5 : 1} testID={`qty-${id}-${l.lineKey}`} />
            </View>
          ))}
          <View style={styles.actions}>
            <PillButton c={c} icon="check" label={t('p2.subscriptions.deliveries.markDelivered')}
              onPress={() => { onSaveQty(edited); setOpen(false); }} disabled={disabled} testID={`qty-save-${id}`} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, overflow: 'hidden' },
  main: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 72, paddingHorizontal: 14, paddingVertical: 10 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  flat: { fontSize: 19, fontWeight: '800' },
  name: { fontSize: 13 },
  lines: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  pillBox: { alignItems: 'flex-end', gap: 6, maxWidth: '42%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  ndBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 14,
    borderRadius: radii.pill, borderWidth: 1.5, maxWidth: '100%',
  },
  qtyBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1 },
  qtyPanel: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 10, gap: 10 },
  qtyLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
