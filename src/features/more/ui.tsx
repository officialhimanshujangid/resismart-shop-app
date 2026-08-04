import React from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { ActivityIndicator, IconButton, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { ColorScheme, radii } from '../../constants/colors';

/**
 * Shared chrome for every screen under More — parties, staff, reports,
 * promotion, settings. One header shape so a partner does not relearn "how do
 * I get back" five times in one tab.
 */
export function Screen({
  title,
  subtitle,
  c,
  back = true,
  right,
  children,
  scroll = true,
  floating,
}: {
  title: string;
  subtitle?: string;
  c: ColorScheme;
  back?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** False for screens that build their own FlatList/ScrollView (avoids nested VirtualizedLists). */
  scroll?: boolean;
  /**
   * A FAB or other `position: absolute` element, rendered as a SIBLING of the
   * scroll body rather than inside it. React Native's default `position:
   * 'relative'` on every View means an absolute child anchors to its
   * IMMEDIATE parent — one dropped inside `children` would anchor to the
   * ScrollView's content container and scroll away with the list instead of
   * staying pinned to the screen.
   */
  floating?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        {back ? (
          <IconButton icon="chevron-left" size={26} onPress={() => router.back()} style={styles.backBtn} />
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: c.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        {right ?? <View style={styles.backSpacer} />}
      </View>
      {scroll ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.body}>{children}</View>
      )}
      {floating}
    </SafeAreaView>
  );
}

export function Loading({ c, label = 'Loading…' }: { c: ColorScheme; label?: string }) {
  return (
    <View style={styles.centerBlock}>
      <ActivityIndicator size="large" color={c.primary} />
      <Text style={[styles.centerText, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

export function ErrorBlock({ c, message, onRetry }: { c: ColorScheme; message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centerBlock}>
      <MaterialCommunityIcons name="alert-circle-outline" size={32} color={c.error} />
      <Text style={[styles.centerText, { color: c.textPrimary }]}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={[styles.retryBtn, { borderColor: c.primary }]}>
          <Text style={{ color: c.primary, fontWeight: '700' }}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyBlock({
  c, icon = 'inbox-outline', title, body,
}: { c: ColorScheme; icon?: string; title: string; body?: string }) {
  return (
    <View style={styles.centerBlock}>
      <MaterialCommunityIcons name={icon as never} size={32} color={c.textDisabled} />
      <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{title}</Text>
      {body ? <Text style={[styles.centerText, { color: c.textSecondary }]}>{body}</Text> : null}
    </View>
  );
}

export function SectionLabel({ c, children }: { c: ColorScheme; children: React.ReactNode }) {
  return <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>{children}</Text>;
}

/** A tappable row: icon, title/subtitle, trailing content (a chevron, a value, a switch). */
export function Row({
  c, icon, title, subtitle, right, onPress, danger,
}: {
  c: ColorScheme;
  icon?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const content = (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: c.surfaceVariant }]}>
          <MaterialCommunityIcons name={icon as never} size={20} color={danger ? c.error : c.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: danger ? c.error : c.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: c.textSecondary }]} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      {right ?? (onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={c.textDisabled} /> : null)}
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

export function Card({ c, children, style }: { c: ColorScheme; children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, { backgroundColor: c.surface }, style]}>{children}</View>;
}

/** A pill toggle strip — used for period pickers, party-side tabs, report keys. */
export function ChipRow<T extends string>({
  c, value, options, onChange,
}: { c: ColorScheme; value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[
              styles.chip,
              { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.border },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? c.textInverse : c.textPrimary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 4 },
  backBtn: { margin: 0 },
  backSpacer: { width: 48 },
  headerText: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 1 },
  body: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
  centerBlock: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  centerText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  retryBtn: { borderWidth: 1.5, borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 8, marginBottom: -4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.card, padding: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  card: { borderRadius: radii.card, padding: 16, gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
});
