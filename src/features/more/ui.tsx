import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { ActivityIndicator, IconButton, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../constants/colors';
import { fontFamily, radius, MIN_TOUCH } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { useIsOnline } from '../../hooks/useIsOnline';
import { HelpButton } from '../help/HelpButton';
// M19 — motion for every More-area screen: rise + stagger (opt-in), press scale, skeletons, error shake.
import { PressableScale, Rise } from '../../theme/motion';
import { SkeletonList } from '../../components/ui/States';
import { useShake } from '../../components/ui/Feedback';
import Animated from 'react-native-reanimated';

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
  help = true,
  rise = false,
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
  /**
   * The "?" that opens Help for this screen (PLAN-02). It only ever fills the
   * EMPTY right slot: a screen that passes its own `right` keeps it untouched.
   * False on the Help screens themselves.
   */
  help?: boolean;
  /**
   * M19 — the DS screen-open motion: each top-level child rises in, 100 ms apart
   * (capped, so a long page never waits). Opt-in so screens that run their own
   * Rise are not animated twice; reduce-motion shows everything at once.
   */
  rise?: boolean;
}) {
  const { t } = useTranslation();
  const body = rise
    ? React.Children.toArray(children).map((child, i) => (
      <Rise key={(child as { key?: React.Key }).key ?? i} index={Math.min(i, 6)}>{child}</Rise>
    ))
    : children;
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.header}>
        {back ? (
          <IconButton icon="chevron-left" size={26} onPress={() => router.back()} style={styles.backBtn} accessibilityLabel={t('common.back')} />
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: c.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        {right ?? (help ? <HelpButton c={c} /> : <View style={styles.backSpacer} />)}
      </View>
      {scroll ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={styles.body}>{children}</View>
      )}
      {floating}
    </SafeAreaView>
  );
}

/**
 * The shared "we are fetching" state.
 *
 * The offline label is not decoration. React Query now knows when the phone is
 * off the network (`lib/queryClient.ts` wires `onlineManager` to NetInfo) and
 * HOLDS a query rather than firing it into a dead radio — which is right, but
 * it means a pending query in a basement never fails and never resolves, so
 * every screen that renders this while offline would otherwise spin silently
 * until the signal came back. The caller's own label is overridden rather than
 * appended to: "Loading your payments…" is not what is happening, and the
 * reason is the same on every screen.
 */
export function Loading({ c, label, skeleton }: { c: ColorScheme; label?: string; skeleton?: number }) {
  const { t } = useTranslation();
  const online = useIsOnline();
  // M19 — `skeleton={n}`: n row-shaped placeholders instead of a lone spinner (DS §5).
  // The offline line still shows, because a held query never resolves on its own.
  if (skeleton) {
    return (
      <View style={styles.skeletonBlock}>
        <SkeletonList rows={skeleton} />
        {!online || label ? (
          <Text style={[styles.centerText, { color: c.textSecondary }]}>
            {online ? label : t('common.offlineWaiting')}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.centerBlock}>
      <ActivityIndicator size="large" color={c.primary} />
      <Text style={[styles.centerText, { color: c.textSecondary }]}>
        {online ? (label ?? t('common.loading')) : t('common.offlineWaiting')}
      </Text>
    </View>
  );
}

export function ErrorBlock({ c, message, onRetry }: { c: ColorScheme; message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  // M19 — one small shake when an error appears (or its text changes); none under reduce-motion.
  const { style: shakeStyle, shake } = useShake();
  React.useEffect(() => { shake(); }, [message, shake]);
  return (
    <Animated.View style={[styles.centerBlock, shakeStyle]} accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name="alert-circle-outline" size={32} color={c.error} />
      <Text style={[styles.centerText, { color: c.textPrimary }]}>{message}</Text>
      {onRetry ? (
        <PressableScale onPress={onRetry} accessibilityRole="button" style={[styles.retryBtn, { borderColor: c.primary }]}>
          <Text style={{ color: c.primary, fontWeight: '600' }}>{t('common.tryAgain')}</Text>
        </PressableScale>
      ) : null}
    </Animated.View>
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
  const { shadow } = useAppTheme();
  const content = (
    // Hairline edge: the light page is pure white (Owner 2026-10-06).
    <View style={[styles.row, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, shadow('card')]}>
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
      {right ?? (onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={c.iconMuted} /> : null)}
    </View>
  );
  if (!onPress) return content;
  // M19 — press scale (DS §5) and a real button for screen readers.
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join('. ')}
    >
      {content}
    </PressableScale>
  );
}

export function Card({ c, children, style }: { c: ColorScheme; children: React.ReactNode; style?: object }) {
  const { shadow } = useAppTheme();
  // Hairline edge: the light page is pure white (Owner 2026-10-06), so a card
  // never relies on ground-vs-surface contrast. A caller's own style still wins.
  return <View style={[styles.card, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, shadow('card'), style]}>{children}</View>;
}

/**
 * A pill toggle strip — used for period pickers, party-side tabs, report keys.
 *
 * `value` takes `''` as well as a key, and that widening is load-bearing rather
 * than defensive: some of these strips ask a question the business may never
 * have answered (`settings/where-you-work.tsx` is the one that does), and there
 * is no key that honestly represents "nobody has said". `''` matches no `o.key`,
 * so every chip renders inactive and the strip claims nothing. Every existing
 * caller passes a real key and is unaffected — `T` still widens to `T | ''`.
 */
export function ChipRow<T extends string>({
  c, value, options, onChange,
}: { c: ColorScheme; value: T | ''; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <PressableScale
            key={o.key}
            scaleTo={0.95}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            hitSlop={4}
            style={[
              styles.chip,
              { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.border },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? c.textInverse : c.textPrimary }]}>{o.label}</Text>
          </PressableScale>
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
  // D0 (DS v1 §2): screen titles in Sora 600; no fontWeight with a custom face.
  title: { fontSize: 17, fontFamily: fontFamily.sora600 },
  subtitle: { fontSize: 12, marginTop: 1 },
  body: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 40, gap: 12 },
  skeletonBlock: { gap: 10, paddingVertical: 4 },
  centerBlock: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  centerText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  retryBtn: { borderWidth: 1.5, borderRadius: radii.pill, paddingHorizontal: 20, minHeight: MIN_TOUCH, justifyContent: 'center', marginTop: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 8, marginBottom: -4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.row, padding: 14, minHeight: 64 },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  card: { borderRadius: radii.card, padding: 16, gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 7, minHeight: 36, justifyContent: 'center', borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
});
