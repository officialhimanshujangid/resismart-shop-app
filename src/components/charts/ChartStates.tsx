import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../constants/colors';

/**
 * The four states every chart primitive in this folder can be wrapped in —
 * skeleton, per-chart empty, error+retry, and a board-wide empty state for a
 * brand-new partner with no activity yet. Mirrors `mobile-society`'s
 * `ChartStates.tsx` one-for-one, built to the shop's own idiom (`ColorScheme`
 * passed in as `c`, react-native-paper `Text`, `MaterialCommunityIcons`, the
 * `EmptyBlock`/`ErrorBlock` shape already used by `features/more/ui.tsx`)
 * instead of NativeWind + lucide.
 */

/*
 * Every default sentence below is resolved INSIDE its component with `?? t(…)`,
 * never as a default parameter. A default parameter is evaluated where there is
 * no translator, and even given one it would be frozen at whichever language
 * happened to be current — these are the strings a screen reader speaks, so a
 * stale one is invisible to everybody who can see the screen.
 */

export function ChartSkeleton({ c, height = 64 }: { c: ColorScheme; height?: number }) {
  const { t } = useTranslation();
  return (
    <View
      style={{ height, borderRadius: radii.md, backgroundColor: c.surfaceVariant, opacity: 0.6 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('components.chart.loading')}
    />
  );
}

export function ChartEmpty({
  c, height = 64, label,
}: {
  c: ColorScheme;
  height?: number;
  label?: string;
}) {
  const { t } = useTranslation();
  const shownLabel = label ?? t('components.chart.empty');
  return (
    <View
      style={{
        height,
        borderRadius: radii.md,
        backgroundColor: c.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={shownLabel}
    >
      <MaterialCommunityIcons name="chart-box-outline" size={18} color={c.textDisabled} />
      <Text style={{ fontSize: 11, color: c.textSecondary }}>{shownLabel}</Text>
    </View>
  );
}

export function ChartError({
  c, height = 64, message, onRetry,
}: {
  c: ColorScheme;
  height?: number;
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const shownMessage = message ?? t('components.chart.error');
  return (
    <View
      style={{
        height,
        borderRadius: radii.md,
        backgroundColor: c.surfaceVariant,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={shownMessage}
    >
      <Text style={{ fontSize: 11, color: c.error, fontWeight: '600' }}>{shownMessage}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={t('common.tryAgain')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <MaterialCommunityIcons name="refresh" size={12} color={c.error} />
            <Text style={{ fontSize: 11, color: c.error, fontWeight: '600', flexShrink: 1 }}>{t('common.tryAgain')}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Common state props every primitive below accepts, in the same order. */
export interface ChartStateProps {
  loading?: boolean;
  error?: boolean | string;
  onRetry?: () => void;
}

/**
 * A board-wide empty state — swapped in for the whole KPI/chart section when
 * a partner genuinely has zero activity yet (a brand-new account, first
 * day), so the board reads as "nothing has happened yet" instead of four
 * flat-zero charts that look broken. Distinct from the per-chart `ChartEmpty`
 * above, which covers one primitive inside an otherwise-live board.
 */
export function EmptyBoard({
  c,
  title,
  body,
  icon = 'chart-line',
}: {
  c: ColorScheme;
  title?: string;
  body?: string;
  icon?: string;
}) {
  const { t } = useTranslation();
  const shownTitle = title ?? t('components.chart.emptyBoardTitle');
  const shownBody = body ?? t('components.chart.emptyBoardBody');
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 32,
        paddingHorizontal: 24,
        borderRadius: radii.card,
        backgroundColor: c.surface,
      }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('components.chart.emptyBoardA11y', { title: shownTitle, body: shownBody })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: radii.pill,
          backgroundColor: c.surfaceVariant,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={icon as never} size={24} color={c.primary} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '600', color: c.textPrimary, textAlign: 'center' }}>{shownTitle}</Text>
      <Text style={{ fontSize: 12, color: c.textSecondary, textAlign: 'center', lineHeight: 18 }}>{shownBody}</Text>
    </View>
  );
}
