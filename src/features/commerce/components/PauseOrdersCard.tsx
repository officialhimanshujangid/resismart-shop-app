import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { radii, type ColorScheme } from '../../../constants/colors';
import { usePartnerEntitlements } from '../../../hooks';
import { apiErrorMessage } from '../../../api/axios';
import { Sheet, ChoiceChips } from '../../p2/ui';
import { PillButton } from '../../p1/ui';
import { useCommerceAccess } from '../access';
import { useCommerceSettings } from '../hooks';
import {
  PAUSE_CHOICES, STOREFRONT_BOUNDS, clockText, isPausedNow, pauseBodyOf, storefrontOf, usePauseOrders,
  type PauseChoice, type StorefrontSettings,
} from '../storefrontApi';

/**
 * The one-tap "Pause orders" (CONTRACT-commerce §14 S-1, A-1): a timed pause
 * ends by itself, so "back at 6:30 PM" is the truth without any sweep.
 * Pausing needs ORDERS_MANAGE or STOREFRONT_MANAGE (the route's own any-of).
 */
export function useCanPauseOrders(): boolean {
  const { ready, hasModule, can } = usePartnerEntitlements();
  const access = useCommerceAccess();
  return ready && hasModule('ORDERS') && (can('ORDERS_MANAGE', 'FULL') || access.settings.section.storefront);
}

/** The state line + Pause / Resume. Used on Today and in Online shop settings. */
export function PausePanel({
  c, storefront, canPause, big, testID,
}: { c: ColorScheme; storefront: StorefrontSettings; canPause: boolean; big?: boolean; testID?: string }) {
  const { t } = useTranslation();
  const pause = usePauseOrders();
  const [sheet, setSheet] = useState(false);
  const paused = isPausedNow(storefront);
  const back = paused && storefront.pausedUntil ? clockText(storefront.pausedUntil, t) : '';

  const resume = () =>
    pause.mutate({ paused: false }, {
      onError: (e) => Alert.alert(t('commerce.storefront.pause.failed'), apiErrorMessage(e, t('commerce.common.saveFailed'))),
    });

  return (
    <View style={styles.panel} testID={testID ?? 'pause-panel'}>
      <View style={styles.stateRow}>
        <View style={[styles.icon, big && styles.iconBig, { backgroundColor: paused ? `${c.warning}22` : `${c.success}22` }]}>
          <MaterialCommunityIcons
            name={paused ? 'pause-circle-outline' : 'storefront-outline'}
            size={big ? 28 : 22}
            color={paused ? c.warning : c.success}
          />
        </View>
        <View style={styles.stateText}>
          <Text style={[styles.title, big && styles.titleBig, { color: c.textPrimary }]} testID="pause-state">
            {paused ? t('commerce.storefront.pause.pausedTitle') : t('commerce.storefront.pause.openTitle')}
          </Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            {paused
              ? (back ? t('commerce.storefront.pause.backAt', { time: back }) : t('commerce.storefront.pause.untilResume'))
              : t('commerce.storefront.pause.openBody')}
          </Text>
          {paused && storefront.pauseNote ? (
            <Text style={[styles.sub, { color: c.textSecondary }]} numberOfLines={3}>
              {t('commerce.storefront.pause.noteShown', { note: storefront.pauseNote })}
            </Text>
          ) : null}
        </View>
      </View>
      {canPause ? (
        <View style={styles.actions}>
          {paused ? (
            <PillButton c={c} icon="play" label={t('commerce.storefront.pause.resume')} onPress={resume}
              disabled={pause.isPending} testID="pause-resume" />
          ) : (
            <PillButton c={c} tone="outline" icon="pause" label={t('commerce.storefront.pause.pause')}
              onPress={() => setSheet(true)} disabled={pause.isPending} testID="pause-open" />
          )}
        </View>
      ) : null}
      <PauseSheet c={c} visible={sheet} onDismiss={() => setSheet(false)} />
    </View>
  );
}

/** How long, and an optional note for customers → POST /pause. */
export function PauseSheet({ c, visible, onDismiss }: { c: ColorScheme; visible: boolean; onDismiss: () => void }) {
  const { t } = useTranslation();
  const pause = usePauseOrders();
  const [choice, setChoice] = useState<PauseChoice>('60');
  const [note, setNote] = useState('');

  const confirm = () =>
    pause.mutate(pauseBodyOf(choice, note), {
      onSuccess: () => { setNote(''); onDismiss(); },
      onError: (e) => Alert.alert(t('commerce.storefront.pause.failed'), apiErrorMessage(e, t('commerce.common.saveFailed'))),
    });

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('commerce.storefront.pause.sheetTitle')}
      testID="pause-sheet"
      footer={(
        <PillButton c={c} icon="pause" label={pause.isPending ? t('common.saving') : t('commerce.storefront.pause.pause')}
          onPress={confirm} disabled={pause.isPending} testID="pause-confirm" />
      )}
    >
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('commerce.storefront.pause.howLong')}</Text>
      <ChoiceChips<PauseChoice>
        c={c}
        options={PAUSE_CHOICES.map((k) => ({ key: k, label: t(`commerce.storefront.pause.choice.${k}`) }))}
        value={[choice]}
        onChange={(v) => setChoice(v[0] ?? '60')}
        testID="pause-choices"
      />
      <TextInput
        mode="outlined"
        label={t('commerce.storefront.pause.note')}
        placeholder={t('commerce.storefront.pause.notePlaceholder')}
        value={note}
        onChangeText={(s) => setNote(s.slice(0, STOREFRONT_BOUNDS.maxPauseNote))}
        multiline
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent' }}
        testID="pause-note"
      />
      <Text style={[styles.sub, { color: c.textSecondary }]}>
        {t('commerce.storefront.pause.noteHint', { left: STOREFRONT_BOUNDS.maxPauseNote - note.length })}
      </Text>
    </Sheet>
  );
}

/**
 * Today's big Pause orders card. Drawn only for someone who may pause and may
 * read the settings; nothing at all otherwise (Today stays as it was).
 */
export function PauseOrdersCard({ c }: { c: ColorScheme }) {
  const access = useCommerceAccess();
  const canPause = useCanPauseOrders();
  const visible = canPause && access.settings.canView;
  const query = useCommerceSettings(visible);
  if (!visible || !query.data) return null;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]} testID="pause-orders-card">
      <PausePanel c={c} storefront={storefrontOf(query.data)} canPause big />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  panel: { gap: 10 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBig: { width: 52, height: 52, borderRadius: 26 },
  stateText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  titleBig: { fontSize: 17 },
  sub: { fontSize: 12.5, lineHeight: 18 },
  label: { fontSize: 12.5, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
});
