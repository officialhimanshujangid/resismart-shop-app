import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Switch, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii, themeColors } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { catalogApi } from '../../catalog/api';
import type { Product } from '../../catalog/types';
import { useDebouncedValue } from '../../billing/useDebouncedValue';
import { Sheet } from '../../p2/ui';
import { PillButton } from '../../p1/ui';

/**
 * Shared pieces for the commerce screens (C3–C6). The Owner's layout rules hold
 * for each: nothing stretched that should not be, no row off a 320dp screen,
 * 48dp targets, no empty gaps — and every screen carries its own two-line help
 * (en + hi) in `CommerceHint`.
 */

/**
 * "How this works" — the screen's own help, folded by default so it costs one
 * line. Opened, it is two or three plain sentences from `commerce.help.<key>`.
 */
export function CommerceHint({ c, helpKey, testID }: { c: ColorScheme; helpKey: string; testID?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.hint, { backgroundColor: `${c.info}12`, borderColor: `${c.info}40` }]} testID={testID ?? 'commerce-hint'}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.hintHead}
      >
        <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={c.info} />
        <Text style={[styles.hintTitle, { color: c.info }]} numberOfLines={1}>{t('commerce.common.howItWorks')}</Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.info} />
      </Pressable>
      {open ? <Text style={[styles.hintBody, { color: c.textPrimary }]}>{t(`commerce.help.${helpKey}`)}</Text> : null}
    </View>
  );
}

/** A screen that needs a feature the shop has not switched on. */
export function FeatureOff({ c, canSwitch, testID }: { c: ColorScheme; canSwitch: boolean; testID?: string }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.block, { backgroundColor: c.surface }]} testID={testID ?? 'feature-off'}>
      <MaterialCommunityIcons name="toggle-switch-off-outline" size={32} color={c.textDisabled} />
      <Text style={[styles.blockTitle, { color: c.textPrimary }]}>{t('commerce.common.offTitle')}</Text>
      <Text style={[styles.blockBody, { color: c.textSecondary }]}>
        {canSwitch ? t('commerce.common.offBodyOwner') : t('commerce.common.offBodyStaff')}
      </Text>
      {canSwitch ? (
        <PillButton c={c} icon="cog-outline" label={t('commerce.common.openSettings')} onPress={() => router.push('/commerce/settings' as Href)} />
      ) : null}
    </View>
  );
}

/** The person's role does not reach this screen. */
export function NoAccess({ c }: { c: ColorScheme }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.block, { backgroundColor: c.surface }]} testID="no-access">
      <MaterialCommunityIcons name="lock-outline" size={32} color={c.textDisabled} />
      <Text style={[styles.blockTitle, { color: c.textPrimary }]}>{t('commerce.common.noAccessTitle')}</Text>
      <Text style={[styles.blockBody, { color: c.textSecondary }]}>{t('commerce.common.noAccessBody')}</Text>
    </View>
  );
}

/** A labelled switch row with an optional hint; the whole row is the 48dp target. */
export function SwitchRow({
  c, label, hint, value, onValueChange, disabled, testID,
}: {
  c: ColorScheme; label: string; hint?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; testID?: string;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      style={[styles.switchRow, disabled && { opacity: 0.55 }]}
      testID={testID}
    >
      <View style={styles.switchText}>
        <Text style={[styles.switchLabel, { color: c.textPrimary }]}>{label}</Text>
        {hint ? <Text style={[styles.switchHint, { color: c.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </Pressable>
  );
}

/**
 * A label on the left and a SHORT input on the right (a number, an amount) —
 * never a full-width field for three digits. Wraps under the label below 340dp.
 */
export function NumberRow({
  c, label, hint, value, onChangeText, suffix, prefix, error, disabled, width = 110, testID,
}: {
  c: ColorScheme; label: string; hint?: string; value: string; onChangeText: (s: string) => void;
  suffix?: string; prefix?: string; error?: string; disabled?: boolean; width?: number; testID?: string;
}) {
  return (
    <View style={styles.numberRow}>
      <View style={styles.numberText}>
        <Text style={[styles.switchLabel, { color: c.textPrimary }]}>{label}</Text>
        {hint ? <Text style={[styles.switchHint, { color: c.textSecondary }]}>{hint}</Text> : null}
        {error ? <Text style={[styles.switchHint, { color: c.error }]}>{error}</Text> : null}
      </View>
      <TextInput
        mode="outlined"
        dense
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        disabled={disabled}
        error={!!error}
        accessibilityLabel={label}
        testID={testID}
        style={[styles.numberInput, { width }]}
        outlineStyle={{ borderRadius: radii.field }}
        left={prefix ? <TextInput.Affix text={prefix} /> : undefined}
        right={suffix ? <TextInput.Affix text={suffix} /> : undefined}
      />
    </View>
  );
}

/** A small tag: "Running", "Paused", "Scheduled". */
export function Tag({ c, label, tone = 'neutral', testID }: {
  c: ColorScheme; label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; testID?: string;
}) {
  const color = tone === 'good' ? c.success : tone === 'warn' ? c.warning : tone === 'bad' ? c.error : tone === 'info' ? c.info : c.textSecondary;
  return (
    <View style={[styles.tag, { backgroundColor: `${color}1A`, borderColor: `${color}55` }]} testID={testID}>
      <Text style={[styles.tagText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Product id → name, for chips that show what was picked. */
export type PickedProduct = Pick<Product, '_id' | 'name' | 'unit' | 'sellPaise'> & Partial<Product>;

/**
 * Search the catalogue and tap to pick. `multi` keeps the sheet open and ticks
 * rows; otherwise one tap picks and closes. Parents (sizes) can be hidden — an
 * offer, a bundle or a quick key names the SIZE that is sold (D-8).
 */
export function ProductPickerSheet({
  visible, onDismiss, onPick, title, picked = [], multi, hideParents = true, hideBundles, testID,
}: {
  visible: boolean;
  onDismiss: () => void;
  onPick: (p: PickedProduct) => void;
  title: string;
  picked?: string[];
  multi?: boolean;
  hideParents?: boolean;
  hideBundles?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 300);
  const [rows, setRows] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setBusy(true);
    catalogApi.search(debounced.trim(), 30)
      .then((r) => { if (alive) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [debounced, visible]);

  const c = themeColors(useColorScheme() === 'dark');
  const shown = rows.filter((p) => (!hideParents || !p.isVariantParent) && (!hideBundles || !p.bundleComponents?.length));
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} testID={testID}
      footer={multi ? <PillButton c={c} label={t('commerce.common.done')} onPress={onDismiss} /> : undefined}>
      <PickerBody
        c={c} q={q} setQ={setQ} busy={busy} rows={shown} picked={picked}
        onPick={(p) => { onPick(p); if (!multi) onDismiss(); }}
      />
    </Sheet>
  );
}

function PickerBody({
  c, q, setQ, busy, rows, picked, onPick,
}: { c: ColorScheme; q: string; setQ: (s: string) => void; busy: boolean; rows: Product[]; picked: string[]; onPick: (p: Product) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <TextInput
        mode="outlined"
        value={q}
        onChangeText={setQ}
        placeholder={t('commerce.common.searchItems')}
        accessibilityLabel={t('commerce.common.searchItems')}
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent' }}
        left={<TextInput.Icon icon="magnify" />}
        right={busy ? <TextInput.Icon icon={() => <ActivityIndicator size="small" />} /> : undefined}
      />
      {rows.map((p) => {
        const on = picked.includes(p._id);
        return (
          <Pressable
            key={p._id}
            onPress={() => onPick(p)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={p.name}
            style={[styles.pickRow, { borderBottomColor: c.divider }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>{p.name}</Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }} numberOfLines={1}>
                {formatPaise(p.sellPaise)} · {p.unit}
              </Text>
            </View>
            <MaterialCommunityIcons name={on ? 'check-circle' : 'plus-circle-outline'} size={24} color={on ? c.success : c.primary} />
          </Pressable>
        );
      })}
      {!busy && rows.length === 0 ? (
        <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('commerce.common.noItems')}</Text>
      ) : null}
    </>
  );
}

/** A picked item as a removable chip (wraps; never runs off the screen). */
export function PickedChip({ c, label, onRemove, testID }: { c: ColorScheme; label: string; onRemove?: () => void; testID?: string }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.picked, { backgroundColor: c.surfaceVariant, borderColor: c.divider }]} testID={testID}>
      <Text style={{ color: c.textPrimary, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      {onRemove ? (
        <IconButton icon="close" size={16} onPress={onRemove} style={{ margin: 0 }} accessibilityLabel={t('commerce.common.removeItem', { name: label })} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { borderRadius: radii.card, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
  hintHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  hintTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  hintBody: { fontSize: 13, lineHeight: 19, paddingBottom: 10 },
  block: { alignItems: 'center', gap: 8, padding: 24, borderRadius: radii.card },
  blockTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  blockBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 4 },
  switchText: { flex: 1, minWidth: 0 },
  switchLabel: { fontSize: 14, fontWeight: '600' },
  switchHint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  numberRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, minHeight: 52 },
  numberText: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
  numberInput: { backgroundColor: 'transparent', textAlign: 'right' },
  tag: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3, maxWidth: '100%' },
  tagText: { fontSize: 11.5, fontWeight: '700' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  picked: { flexDirection: 'row', alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, paddingLeft: 12, maxWidth: '100%', minHeight: 36 },
});
