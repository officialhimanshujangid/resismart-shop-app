import React from 'react';
import { Pressable, StyleSheet, TextInput as RNTextInput, useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ColorScheme, radii } from '../../constants/colors';

/**
 * Small shared pieces for the P1 business screens (purchases, stock, khata,
 * money). Layout rules they all keep (Owner's UI rules): nothing stretched to
 * the full width that should not be, no row that runs off a 320dp screen, and
 * touch targets of at least 48dp.
 */

/** Tablet / landscape: wide enough for the two-pane layouts (≥ 720dp). */
export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= 720;
}

/**
 * Two panes side by side on a tablet, stacked on a phone. The left pane is the
 * list, the right one the detail / form. On a phone only `left` is drawn when
 * `stackRight` is false (the caller navigates instead).
 */
export function TwoPane({
  left, right, stackRight = true,
}: { left: React.ReactNode; right?: React.ReactNode; stackRight?: boolean }) {
  const wide = useIsWide();
  if (wide && right) {
    return (
      <View style={styles.twoPane}>
        <View style={styles.paneLeft}>{left}</View>
        <View style={styles.paneRight}>{right}</View>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {left}
      {stackRight ? right : null}
    </View>
  );
}

/**
 * A quantity stepper with 48dp buttons and a typed field in the middle — the
 * "big touch targets" rule for counting and receiving. `min` defaults to 0.
 */
export function Stepper({
  c, value, onChange, min = 0, max, step = 1, label, testID,
}: {
  c: ColorScheme;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessibility name of the whole control, e.g. the item name. */
  label: string;
  testID?: string;
}) {
  const clamp = (n: number) => {
    let v = Number.isFinite(n) ? n : min;
    if (v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return Math.round(v * 1000) / 1000;
  };
  return (
    <View style={styles.stepper} testID={testID}>
      <Pressable
        onPress={() => onChange(clamp(value - step))}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel={`− ${label}`}
        style={[styles.stepBtn, { backgroundColor: c.surfaceVariant, opacity: value <= min ? 0.4 : 1 }]}
      >
        <MaterialCommunityIcons name="minus" size={22} color={c.primary} />
      </Pressable>
      <RNTextInput
        value={String(value)}
        onChangeText={(s) => onChange(clamp(Number(s.replace(/[^0-9.]/g, '')) || 0))}
        keyboardType="numeric"
        accessibilityLabel={label}
        selectTextOnFocus
        style={[styles.stepInput, { color: c.textPrimary, borderColor: c.divider }]}
      />
      <Pressable
        onPress={() => onChange(clamp(value + step))}
        disabled={max !== undefined && value >= max}
        accessibilityRole="button"
        accessibilityLabel={`+ ${label}`}
        style={[styles.stepBtn, { backgroundColor: c.surfaceVariant, opacity: max !== undefined && value >= max ? 0.4 : 1 }]}
      >
        <MaterialCommunityIcons name="plus" size={22} color={c.primary} />
      </Pressable>
    </View>
  );
}

/** A number on a card with its caption — wraps two to a row on a phone. */
export function StatTile({
  c, label, value, tone, testID,
}: { c: ColorScheme; label: string; value: string; tone?: string; testID?: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: c.surface, borderColor: c.divider }]} testID={testID}>
      <Text style={[styles.tileLabel, { color: c.textSecondary }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.tileValue, { color: tone ?? c.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** An inline notice. `tone` picks the colour: info (default), warn or error. */
export function Banner({
  c, tone = 'info', title, body, testID,
}: { c: ColorScheme; tone?: 'info' | 'warn' | 'error'; title?: string; body: string; testID?: string }) {
  const color = tone === 'error' ? c.error : tone === 'warn' ? c.warning : c.info;
  return (
    <View style={[styles.banner, { backgroundColor: `${color}1A`, borderColor: `${color}55` }]} testID={testID}>
      {title ? <Text style={[styles.bannerTitle, { color }]}>{title}</Text> : null}
      <Text style={[styles.bannerBody, { color: c.textPrimary }]}>{body}</Text>
    </View>
  );
}

/**
 * A compact action button that sizes to its label (never stretched), 44dp+
 * tall. `tone: 'danger'` for the destructive one.
 */
export function PillButton({
  c, label, onPress, icon, disabled, tone = 'primary', testID,
}: {
  c: ColorScheme; label: string; onPress: () => void; icon?: string; disabled?: boolean;
  tone?: 'primary' | 'outline' | 'danger'; testID?: string;
}) {
  const filled = tone === 'primary';
  const color = tone === 'danger' ? c.error : c.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={[
        styles.pill,
        filled ? { backgroundColor: color, borderColor: color } : { borderColor: color },
        disabled && { opacity: 0.45 },
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon as never} size={18} color={filled ? c.textInverse : color} /> : null}
      <Text style={[styles.pillText, { color: filled ? c.textInverse : color }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** A wrapping row of PillButtons — wraps instead of running off a narrow screen. */
export function ActionRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.actionRow}>{children}</View>;
}

const styles = StyleSheet.create({
  twoPane: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  paneLeft: { flex: 5, minWidth: 0, gap: 12 },
  paneRight: { flex: 4, minWidth: 0, gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 48, height: 48, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  stepInput: {
    minWidth: 56, maxWidth: 88, height: 48, borderWidth: 1, borderRadius: radii.sm,
    textAlign: 'center', fontSize: 18, fontWeight: '600', paddingHorizontal: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1, flexBasis: '45%', minWidth: 136, borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12, paddingHorizontal: 14, gap: 4,
  },
  tileLabel: { fontSize: 12, fontWeight: '600' },
  tileValue: { fontSize: 20, fontWeight: '700' },
  banner: { borderRadius: radii.card, borderWidth: 1, padding: 12, gap: 4 },
  bannerTitle: { fontSize: 13, fontWeight: '700' },
  bannerBody: { fontSize: 13, lineHeight: 19 },
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1.5, maxWidth: '100%',
  },
  pillText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
