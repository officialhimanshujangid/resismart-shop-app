import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { ActionRow, PillButton } from '../../p1/ui';
import { LineDraft, emptyLine } from '../logic';
import { MAX_LINES } from '../types';

/**
 * The lines of a plan / subscription: item, unit, quantity per delivery and the
 * rate in rupees (tax-inclusive — the price the customer agreed to). Keys are
 * short and stable ('L1', 'L2' …) so a later change keeps each line's history.
 */
export function LinesEditor({
  c, lines, onChange,
}: { c: ColorScheme; lines: LineDraft[]; onChange: (next: LineDraft[]) => void }) {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<LineDraft>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  return (
    <View style={{ gap: 10 }}>
      {lines.map((l, i) => (
        <View key={l.lineKey} style={[styles.card, { borderColor: c.divider, backgroundColor: c.surface }]} testID={`line-${l.lineKey}`}>
          <View style={styles.head}>
            <Text style={{ flex: 1, color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {t('p2.subscriptions.lines.line', { n: i + 1 })}
            </Text>
            {lines.length > 1 ? (
              <IconButton icon="delete-outline" size={22} onPress={() => onChange(lines.filter((_, k) => k !== i))}
                accessibilityLabel={t('p2.subscriptions.lines.remove')} />
            ) : null}
          </View>
          <AppInput label={t('p2.subscriptions.lines.item')} value={l.itemName} onChangeText={(v) => set(i, { itemName: v })} />
          <View style={styles.wrap}>
            <AppInput style={styles.small} label={t('p2.subscriptions.lines.unit')} value={l.unit}
              onChangeText={(v) => set(i, { unit: v })} autoCapitalize="none" />
            <AppInput style={styles.small} label={t('p2.subscriptions.lines.qty')} value={l.qty}
              onChangeText={(v) => set(i, { qty: v.replace(/[^0-9.]/g, '') })} keyboardType="numeric" />
            <AppInput style={styles.small} label={t('p2.subscriptions.lines.rate')} value={l.rate}
              onChangeText={(v) => set(i, { rate: v.replace(/[^0-9.]/g, '') })} keyboardType="numeric" />
          </View>
        </View>
      ))}
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.lines.taxNote')}</Text>
      {lines.length < MAX_LINES ? (
        <ActionRow>
          <PillButton c={c} tone="outline" icon="plus" label={t('p2.subscriptions.lines.add')} onPress={() => onChange([...lines, emptyLine(lines)])} testID="line-add" />
        </ActionRow>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.card, padding: 10, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { flexGrow: 1, flexBasis: 86, minWidth: 86 },
});
