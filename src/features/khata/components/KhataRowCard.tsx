import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Checkbox } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { formatI18nDate } from '../../../i18n';
import type { KhataRow } from '../api';
// UX-P (A ShopKhata): DS tokens, press scale, kit button.
import { useAppTheme } from '../../../theme/useAppTheme';
import { fontFamily, type StatusTone, type TintName } from '../../../theme/tokens';
import { PressableScale } from '../../../theme/motion';
import { Button } from '../../../components/ui/Button';

/**
 * One customer on the khata list (screen S14): what they owe, how old the
 * oldest unpaid bill is, the next collection date, over-limit / overdue flags,
 * and a one-tap Remind (share). In bulk mode the row is a checkbox instead.
 *
 * UX-P (A ShopKhata): an initials avatar (colour picked from the name, so a
 * customer keeps theirs), the amount in Sora, and an AGE chip coloured by how
 * old the oldest unpaid bill is — 0–30 days green, 30–60 amber, 60+ red —
 * read from `oldestOpenAgeDays`, which the list already carries. Remind is a
 * labelled button now (same action, same screen-reader name).
 */
// Only tints whose icon colour reads ≥ 4.5:1 on their own soft ground (light) — initials are text.
const AVATAR_TINTS: TintName[] = ['blue', 'rose', 'violet'];

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('')
    .toUpperCase();
}

function tintFor(name: string): TintName {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

/** 0–30 days fine, 30–60 chase, 60+ late. */
export function ageTone(days: number): StatusTone {
  if (days >= 60) return 'danger';
  if (days >= 30) return 'warn';
  return 'success';
}

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
  const { ds, tints, status, shadow } = useAppTheme();
  const tint = tints[tintFor(row.name)];
  const age = row.outstandingPaise > 0 && typeof row.oldestOpenAgeDays === 'number' ? row.oldestOpenAgeDays : undefined;
  const agePair = age !== undefined ? status[ageTone(age)] : null;
  const due = row.outstandingPaise > 0;

  return (
    <PressableScale
      onPress={selectable ? onToggle : onOpen}
      style={[styles.card, { backgroundColor: ds.surface, borderColor: selected ? ds.primary : ds.line }, shadow('card')]}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: !!selected } : undefined}
      testID={`khata-${row.partyId}`}
    >
      <View style={styles.top}>
        {selectable ? <Checkbox status={selected ? 'checked' : 'unchecked'} onPress={onToggle} /> : null}
        <View style={[styles.avatar, { backgroundColor: tint.from }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[styles.avatarText, { color: tint.icon }]}>{initialsOf(row.name)}</Text>
        </View>
        <View style={styles.main}>
          <Text style={[styles.name, { color: ds.ink }]} numberOfLines={1}>{row.name}</Text>
          <Text style={[styles.meta, { color: ds.muted }]} numberOfLines={2}>
            {row.oldestOpenAgeDays !== undefined ? t('khata.oldest', { count: row.oldestOpenAgeDays }) : row.phoneMasked ?? ''}
          </Text>
          {row.collectionPlan?.nextDate ? (
            <Text style={[styles.meta, { color: ds.muted }]} numberOfLines={2}>
              {t('khata.nextCollection', { date: formatI18nDate(row.collectionPlan.nextDate, t) })}
            </Text>
          ) : null}
        </View>
        <View style={styles.side}>
          <Text style={[styles.amount, { color: due ? ds.ink : ds.muted }]} numberOfLines={1}>{formatPaise(row.outstandingPaise)}</Text>
          {agePair && age !== undefined ? (
            <View style={[styles.chip, { backgroundColor: agePair.bg }]} testID={`khata-age-${row.partyId}`}>
              <Text style={[styles.chipText, { color: agePair.fg }]}>{t('khata.ageDays', { count: age })}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {row.overLimit || row.overdueBeyondDays || row.isResidentLinked ? (
        <View style={styles.flags}>
          {row.overLimit ? <Flag label={t('khata.flagOverLimit')} fg={status.danger.fg} bg={status.danger.bg} /> : null}
          {row.overdueBeyondDays ? <Flag label={t('khata.flagOverdue')} fg={status.warn.fg} bg={status.warn.bg} /> : null}
          {row.isResidentLinked ? <Flag label={t('khata.flagApp')} fg={status.info.fg} bg={status.info.bg} /> : null}
        </View>
      ) : null}

      {onRemind && !selectable ? (
        <View style={styles.actions}>
          <Button
            variant="soft"
            size="sm"
            icon="whatsapp"
            label={t('khata.remind')}
            accessibilityLabel={t('khata.remindName', { name: row.name })}
            disabled={reminding}
            onPress={onRemind}
          />
          <View style={styles.openHint}>
            <Text style={[styles.openText, { color: ds.muted }]} numberOfLines={1}>{t('khata.openLedger')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={ds.muted} />
          </View>
        </View>
      ) : null}
    </PressableScale>
  );
}

function Flag({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.sora700, fontSize: 15 },
  main: { flex: 1, minWidth: 0, gap: 2 },
  side: { alignItems: 'flex-end', gap: 4, flexShrink: 0, maxWidth: '40%' },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 16 },
  amount: { fontFamily: fontFamily.sora700, fontSize: 17 },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  openHint: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  openText: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
});
