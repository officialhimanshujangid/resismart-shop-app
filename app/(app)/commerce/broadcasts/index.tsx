import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../../src/constants/colors';
import { apiErrorMessage } from '../../../../src/api/axios';
import { newIdempotencyKey } from '../../../../src/lib/idempotency';
import { whenText } from '../../../../src/features/commerce/format';
import { Card, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../../src/features/more/ui';
import { ActionRow, PillButton } from '../../../../src/features/p1/ui';
import { Rise } from '../../../../src/theme/motion'; // M23
import { ProgressBar } from '../../../../src/components/charts';
import { useCommerceAccess } from '../../../../src/features/commerce/access';
import { useBroadcasts, useCancelBroadcast, useSendBroadcast } from '../../../../src/features/commerce/hooks';
// >>> GAP-C-SHOP
import { useUnscheduleBroadcast } from '../../../../src/features/commerce/hooks';
// <<< GAP-C-SHOP
import { weeklyLeft } from '../../../../src/features/commerce/logic';
import type { Broadcast, BroadcastStatus } from '../../../../src/features/commerce/types';
import { CommerceHint, FeatureOff, NoAccess, Tag } from '../../../../src/features/commerce/components/ui';

const TONE: Record<BroadcastStatus, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  DRAFT: 'neutral', SCHEDULED: 'info', SENDING: 'good', SENT: 'good', CANCELLED: 'neutral', FAILED: 'bad',
};

/**
 * "Send offer" (C5, D-1): push + in-app messages to this shop's own customers.
 * A rolling 7-day allowance (the meter), drafts, scheduled sends, history.
 */
export default function BroadcastsScreen() {
  const { t, i18n } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const on = access.has('BROADCAST');
  const list = useBroadcasts(access.broadcasts.canSend);
  const send = useSendBroadcast();
  const cancel = useCancelBroadcast();
  // >>> GAP-C-SHOP
  const unschedule = useUnscheduleBroadcast();
  // <<< GAP-C-SHOP
  const sendKeys = useRef<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  if (!access.broadcasts.canSend) {
    return <Screen rise title={t('commerce.broadcasts.title')} c={c}><NoAccess c={c} /></Screen>;
  }

  const weekly = list.data?.weekly;
  const left = weeklyLeft(weekly);
  const rows = list.data?.data ?? [];

  const doSend = (b: Broadcast) => {
    // One key per broadcast's send intent; a retry of the same tap reuses it.
    sendKeys.current[b.id] = sendKeys.current[b.id] ?? newIdempotencyKey('broadcast-send');
    send.mutate({ id: b.id, key: sendKeys.current[b.id] }, {
      onSuccess: (out) => {
        delete sendKeys.current[b.id];
        setNotice(out.status === 'SCHEDULED'
          ? t('commerce.broadcasts.scheduledToast', { when: whenText(out.scheduledAt, t) })
          : t('commerce.broadcasts.sentToast', { count: out.audienceCount ?? 0 }));
      },
      onError: (e) => Alert.alert(t('commerce.broadcasts.sendFailed'), apiErrorMessage(e)),
    });
  };
  // MP-1 (c2): "Send now" on a draft is confirmed first, like the web ("Send this offer now?").
  const askSend = (b: Broadcast) => {
    const later = !!b.scheduledAt && new Date(b.scheduledAt).getTime() > Date.now();
    const n = b.audienceCount ?? 0;
    Alert.alert(
      later ? t('commerce.broadcasts.confirmScheduleTitle') : t('commerce.broadcasts.confirmSendTitle'),
      later
        ? t('commerce.broadcasts.confirmScheduleBody', { when: whenText(b.scheduledAt, t), count: n })
        : n > 0 ? t('commerce.broadcasts.confirmSendBody', { count: n }) : t('commerce.broadcasts.confirmSendBodyNone'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: later ? t('commerce.broadcasts.schedule') : t('commerce.broadcasts.sendNow'), onPress: () => doSend(b) },
      ],
    );
  };
  const askCancel = (b: Broadcast) => Alert.alert(t('commerce.broadcasts.cancelTitle'), t('commerce.broadcasts.cancelBody', { title: b.title }), [
    { text: t('common.notNow'), style: 'cancel' },
    {
      text: t('commerce.broadcasts.cancel'), style: 'destructive',
      onPress: () => cancel.mutate(b.id, { onError: (e) => Alert.alert(t('commerce.broadcasts.cancelFailed'), apiErrorMessage(e)) }),
    },
  ]);

  // >>> GAP-C-SHOP — "Remove schedule": the time goes and the message is a draft again; nothing is sent.
  const askUnschedule = (b: Broadcast) => Alert.alert(
    t('commerce.broadcasts.unscheduleTitle'),
    t('commerce.broadcasts.unscheduleBody', { title: b.title, when: whenText(b.scheduledAt, t) }),
    [
      { text: t('common.notNow'), style: 'cancel' },
      {
        text: t('commerce.broadcasts.unschedule'),
        onPress: () => unschedule.mutate(b.id, {
          onSuccess: () => setNotice(t('commerce.broadcasts.unscheduledToast', { title: b.title })),
          onError: (e) => Alert.alert(t('commerce.broadcasts.unscheduleFailed'), apiErrorMessage(e)),
        }),
      },
    ],
  );
  // <<< GAP-C-SHOP

  return (
    <Screen
      title={t('commerce.broadcasts.title')}
      c={c}
      floating={<Snackbar visible={!!notice} onDismiss={() => setNotice(null)} duration={2500}>{notice}</Snackbar>}
    >
      <View style={styles.wrap}>
        <CommerceHint c={c} helpKey="broadcasts" />
        {!on ? <FeatureOff c={c} canSwitch={access.settings.section.growthBroadcast} /> : null}

        {weekly ? (
          <Card c={c}>
            <Text style={{ color: c.textPrimary, fontWeight: '700' }} testID="broadcast-weekly">
              {t('commerce.broadcasts.weekly', { used: weekly.used, max: weekly.max })}
            </Text>
            <ProgressBar
              c={c}
              value={weekly.used}
              max={weekly.max}
              tone={left === 0 ? 'warn' : 'default'}
              valueLabel={`${weekly.used}/${weekly.max}`}
              accessibilityLabel={t('commerce.broadcasts.weekly', { used: weekly.used, max: weekly.max })}
            />
            {left === 0 ? (
              <Text style={{ color: c.warning, fontSize: 12.5 }}>
                {weekly.nextAllowedAt
                  ? t('commerce.broadcasts.nextAfter', { when: whenText(weekly.nextAllowedAt, t) })
                  : t('commerce.broadcasts.noneLeft')}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {on ? (
          <ActionRow>
            <PillButton c={c} icon="bullhorn-outline" label={t('commerce.broadcasts.new')} onPress={() => router.push('/commerce/broadcasts/compose' as Href)} testID="broadcast-new" />
          </ActionRow>
        ) : null}

        {list.isPending ? <Loading c={c} skeleton={4} /> : null}
        {list.isError ? <ErrorBlock c={c} message={apiErrorMessage(list.error)} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && rows.length === 0 ? (
          <EmptyBlock c={c} icon="bullhorn-outline" title={t('commerce.broadcasts.emptyTitle')} body={t('commerce.broadcasts.emptyBody')} />
        ) : null}
        {rows.map((b, i) => (
          // M23 — the first screenful rises in on a stagger.
          <Rise key={b.id} index={Math.min(i, 6)}>
          <Card c={c}>
            <View style={styles.head} testID={`broadcast-${b.id}`}>
              <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 15, flex: 1, minWidth: 0 }} numberOfLines={2}>{b.title}</Text>
              <Tag c={c} label={t(`commerce.broadcasts.status.${b.status}`)} tone={TONE[b.status]} />
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 13 }} numberOfLines={2}>{b.body}</Text>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>
              {b.status === 'SCHEDULED' && b.scheduledAt ? t('commerce.broadcasts.goesAt', { when: whenText(b.scheduledAt, t) }) : null}
              {b.status === 'SENT' ? t('commerce.broadcasts.sentTo', { count: b.audienceCount ?? 0, when: whenText(b.sentAt, t) }) : null}
              {b.status === 'DRAFT' ? t('commerce.broadcasts.draftNote') : null}
            </Text>
            {/* M23 — the coded reason in the reader's language; the server's English only for old rows. */}
            {b.status === 'FAILED' && (b.failureNote || b.failureCode) ? (
              <Text style={{ color: c.error, fontSize: 12 }}>
                {b.failureCode && i18n.exists(`commerce.broadcasts.failure.${b.failureCode}`) ? t(`commerce.broadcasts.failure.${b.failureCode}`) : b.failureNote}
              </Text>
            ) : null}
            {on && (b.status === 'DRAFT' || b.status === 'SCHEDULED') ? (
              <ActionRow>
                {b.status === 'DRAFT' ? (
                  <PillButton c={c} icon="send" label={t('commerce.broadcasts.sendNow')} onPress={() => askSend(b)} disabled={send.isPending || left === 0} testID={`broadcast-send-${b.id}`} />
                ) : null}
                <PillButton c={c} tone="outline" icon="pencil-outline" label={t('commerce.broadcasts.edit')}
                  onPress={() => router.push(`/commerce/broadcasts/compose?id=${b.id}` as Href)} />
                {/* >>> GAP-C-SHOP */}
                {b.status === 'SCHEDULED' ? (
                  <PillButton c={c} tone="outline" icon="calendar-remove-outline" label={t('commerce.broadcasts.unschedule')}
                    onPress={() => askUnschedule(b)} disabled={unschedule.isPending} testID={`broadcast-unschedule-${b.id}`} />
                ) : null}
                {/* <<< GAP-C-SHOP */}
                <PillButton c={c} tone="danger" label={t('commerce.broadcasts.cancel')} onPress={() => askCancel(b)} testID={`broadcast-cancel-${b.id}`} />
              </ActionRow>
            ) : null}
          </Card>
          </Rise>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
