import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { apiErrorCode, apiErrorMessage, apiErrorParams } from '../../../api/axios';
import { Card } from '../../more/ui';
import { useArchiveBusiness } from '../hooks';
import { ARCHIVE_REASON_MAX, ARCHIVE_REASON_MIN, archiveNameMatches } from '../logic';

/**
 * Settings → danger zone → Archive business (CONTRACT-partner-P0 §3 / §6.3).
 *
 * Reason (kept on record) + the business name typed to confirm. A business with
 * open bookings or orders is refused with PARTNER_ARCHIVE_OPEN_WORK, and the
 * counts are shown in their own box so the owner knows what to finish first.
 */
export function ArchiveBusinessForm({
  c, businessName, onArchived,
}: {
  c: ColorScheme;
  businessName: string;
  onArchived: () => void;
}) {
  const { t } = useTranslation();
  const archive = useArchiveBusiness();
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openWork, setOpenWork] = useState<{ bookings: number; orders: number } | null>(null);

  const reasonOk = reason.trim().length >= ARCHIVE_REASON_MIN && reason.trim().length <= ARCHIVE_REASON_MAX;
  const nameOk = archiveNameMatches(businessName, confirm);

  const submit = () => {
    setError(null);
    setOpenWork(null);
    archive.mutate(
      { reason, confirmName: confirm },
      {
        onSuccess: onArchived,
        onError: (e) => {
          if (apiErrorCode(e) === 'PARTNER_ARCHIVE_OPEN_WORK') {
            const p = apiErrorParams(e) ?? {};
            setOpenWork({ bookings: Number(p.bookings ?? 0), orders: Number(p.orders ?? 0) });
          }
          setError(apiErrorMessage(e, t('archive.failed')));
        },
      },
    );
  };

  return (
    <View style={styles.column}>
      <Card c={c}>
        <View style={styles.head}>
          <MaterialCommunityIcons name="archive-alert-outline" size={22} color={c.error} />
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('archive.title', { business: businessName })}</Text>
        </View>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('archive.effects')}</Text>
        <Text style={[styles.bullet, { color: c.textPrimary }]}>• {t('archive.effectHidden')}</Text>
        <Text style={[styles.bullet, { color: c.textPrimary }]}>• {t('archive.effectNoWork')}</Text>
        <Text style={[styles.bullet, { color: c.textPrimary }]}>• {t('archive.effectKept')}</Text>
        <Text style={[styles.bullet, { color: c.textPrimary }]}>• {t('archive.effectRestore')}</Text>
        <Text style={[styles.bullet, { color: c.textPrimary }]}>• {t('archive.effectSignOut')}</Text>
      </Card>

      {openWork ? (
        <View
          style={[styles.openWork, { borderColor: c.warning, backgroundColor: c.warning + '1A' }]}
          accessibilityLiveRegion="polite"
          testID="archive-open-work"
        >
          <Text style={[styles.openWorkTitle, { color: c.textPrimary }]}>{t('archive.openWorkTitle')}</Text>
          <View style={styles.counts}>
            <Text style={[styles.count, { color: c.textPrimary }]}>{t('archive.openBookings', { count: openWork.bookings })}</Text>
            <Text style={[styles.count, { color: c.textPrimary }]}>{t('archive.openOrders', { count: openWork.orders })}</Text>
          </View>
        </View>
      ) : null}

      <Card c={c}>
        <AppInput
          label={t('archive.reason')}
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={3}
          error={reason.length > 0 && !reasonOk ? t('errors.PARTNER_ARCHIVE_REASON_REQUIRED') : undefined}
        />
        <Text style={[styles.body, { color: c.textSecondary }]}>
          {t('archive.typeName')} <Text style={{ fontWeight: '700', color: c.textPrimary }}>{businessName}</Text>
        </Text>
        <AppInput
          label={t('archive.confirmLabel')}
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="none"
          error={confirm.length > 0 && !nameOk ? t('errors.PARTNER_ARCHIVE_CONFIRM_NAME') : undefined}
        />
        {error && !openWork ? (
          <Text style={[styles.error, { color: c.error }]} accessibilityLiveRegion="polite">{error}</Text>
        ) : null}
        {error && openWork ? (
          <Text style={[styles.error, { color: c.textSecondary }]}>{error}</Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            mode="contained"
            icon="archive-outline"
            buttonColor={c.error}
            textColor={c.textInverse}
            disabled={!reasonOk || !nameOk || archive.isPending}
            loading={archive.isPending}
            onPress={submit}
            style={styles.btn}
          >
            {t('archive.submit')}
          </Button>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  body: { fontSize: 13, lineHeight: 19 },
  bullet: { fontSize: 13, lineHeight: 19 },
  openWork: { borderWidth: 1, borderRadius: radii.md, padding: 12, gap: 6 },
  openWorkTitle: { fontSize: 14, fontWeight: '700' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  count: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 12.5, lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
  btn: { borderRadius: 12 },
});
