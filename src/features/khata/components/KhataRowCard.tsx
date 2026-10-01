import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Checkbox, IconButton, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { formatI18nDate } from '../../../i18n';
import type { KhataRow } from '../api';

/**
 * One customer on the khata list (screen S14): what they owe, how old the
 * oldest unpaid bill is, the next collection date, over-limit / overdue flags,
 * and a one-tap Remind (share). In bulk mode the row is a checkbox instead.
 */
export function KhataRowCard({
  c, row, onOpen, onRemind, reminding, selectable, selected, onToggle,
}: {
  c: ColorScheme;
  row: KhataRow;
  onOpen: () => void;
  onRemind?: () => void;
  reminding?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={selectable ? onToggle : onOpen}
      style={[styles.row, { backgroundColor: c.surface }]}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: !!selected } : undefined}
      testID={`khata-${row.partyId}`}
    >
      {selectable ? <Checkbox status={selected ? 'checked' : 'unchecked'} onPress={onToggle} /> : null}
      <View style={styles.main}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{row.name}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
          {row.oldestOpenAgeDays !== undefined ? t('khata.oldest', { count: row.oldestOpenAgeDays }) : row.phoneMasked ?? ''}
        </Text>
        {row.collectionPlan?.nextDate ? (
          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
            {t('khata.nextCollection', { date: formatI18nDate(row.collectionPlan.nextDate, t) })}
          </Text>
        ) : null}
        <View style={styles.flags}>
          {row.overLimit ? <Text style={[styles.flag, { color: c.error, backgroundColor: `${c.error}1A` }]}>{t('khata.flagOverLimit')}</Text> : null}
          {row.overdueBeyondDays ? <Text style={[styles.flag, { color: c.warning, backgroundColor: `${c.warning}1A` }]}>{t('khata.flagOverdue')}</Text> : null}
          {row.isResidentLinked ? <Text style={[styles.flag, { color: c.info, backgroundColor: `${c.info}1A` }]}>{t('khata.flagApp')}</Text> : null}
        </View>
      </View>
      <View style={styles.side}>
        <Text style={[styles.amount, { color: row.outstandingPaise > 0 ? c.error : c.textSecondary }]}>{formatPaise(row.outstandingPaise)}</Text>
        {onRemind && !selectable ? (
          <IconButton
            icon="whatsapp"
            mode="contained-tonal"
            size={22}
            disabled={reminding}
            onPress={onRemind}
            accessibilityLabel={t('khata.remindName', { name: row.name })}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.card, paddingVertical: 10, paddingHorizontal: 12, minHeight: 64 },
  main: { flex: 1, minWidth: 0 },
  side: { alignItems: 'flex-end', flexShrink: 0 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700' },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  flag: { fontSize: 11, fontWeight: '700', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
});
