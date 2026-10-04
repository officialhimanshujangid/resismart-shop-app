import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { WEB_DELETE_ACCOUNT_URL } from '../../../src/constants/app';
import { useAuth } from '../../../src/context/AuthContext';
import { AccountDeletionRequest, Place, PlaceFlat } from '../../../src/api/account.api';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { AppButton } from '../../../src/components/AppButton';
import { AppInput } from '../../../src/components/AppInput';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import {
  useConfirmAccountDeletion, useRequestAccountDeletion, useMyPlaces, useLeavePlace, // M01 audit: + places
} from '../../../src/features/account/hooks';

/**
 * Delete my account — the in-app path Google Play requires, reached from More →
 * Account.
 *
 * Deliberately NOT under `settings/`: that layout gates on `SETTINGS` READ, and
 * this is the PERSON's account, not the business's settings. A member of staff
 * with no settings grant must still be able to leave, so the route sits beside
 * `notifications.tsx`, under the signed-in shell only.
 *
 * Two steps, both the server's (`api/account.api.ts`): send a code, then confirm
 * with it behind a final native Alert. The lists of what goes and what stays are
 * a summary; `WEB_DELETE_ACCOUNT_URL` carries the full wording.
 */

const CODE_LENGTH = 6;
/** Same resend countdown as sign-in (`(auth)/verify-otp.tsx`) — M01 audit: 60, the server's own gap (was 30). */
const RESEND_SECONDS = 60;
/** M01 audit — roles that make a place more than "a flat I live in": a flat can then be left on its own. */
const NON_RESIDENT_ROLES = ['SOCIETY_ADMIN', 'SOCIETY_COMMITTEE', 'SOCIETY_EMPLOYEE'];

/** Catalogue keys, in the order they are shown. */
const DELETED_KEYS = ['login', 'photo', 'details', 'devices', 'workspaces'] as const;
const KEPT_KEYS = ['invoices', 'business'] as const;

export default function DeleteAccountScreen() {
  const { t, i18n } = useTranslation(); // HELP34R: i18n for the date's language
  const c = themeColors(useColorScheme() === 'dark');
  const { user } = useAuth();
  const request = useRequestAccountDeletion();
  const confirm = useConfirmAccountDeletion();
  // >>> M01 audit — your places first; leaving one is the default choice.
  const places = useMyPlaces();
  const leave = useLeavePlace();
  const list = places.data?.places ?? [];
  const otherLogins = places.data?.otherLogins ?? 0;
  const [alsoOtherLogins, setAlsoOtherLogins] = useState(false);
  const [placeNote, setPlaceNote] = useState<{ text: string; error: boolean } | null>(null);

  const askLeave = (place: Place, flat?: PlaceFlat) => {
    Alert.alert(
      flat ? t('accountPlaces.leaveFlatTitle', { flat: flat.label }) : t('accountPlaces.leaveSocietyTitle', { name: place.name }),
      flat ? t('accountPlaces.leaveFlatBody', { flat: flat.label }) : t('accountPlaces.leaveSocietyBody', { name: place.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('accountPlaces.leaveAction'),
          style: 'destructive',
          onPress: () => {
            setPlaceNote(null);
            // A society is never this app's open session (that is a business),
            // so nothing has to move afterwards — the list simply re-reads.
            leave.mutate(
              { societyId: place.id, ...(flat ? { flatId: flat.flatId } : {}) },
              {
                onSuccess: () => setPlaceNote({
                  text: flat ? t('accountPlaces.leftFlat', { flat: flat.label }) : t('accountPlaces.leftSociety', { name: place.name }),
                  error: false,
                }),
                onError: (e: unknown) => setPlaceNote({ text: apiErrorMessage(e, t('accountPlaces.leaveFailed')), error: true }),
              },
            );
          },
        },
      ],
    );
  };
  // <<< M01 audit

  /** The last successful send, or `null` before the first one. */
  const [sent, setSent] = useState<AccountDeletionRequest | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const handle = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(handle);
  }, [cooldown]);

  /**
   * Send, and resend. A refusal stays on `request.error` and is drawn above the
   * button; a resend that fails leaves the previous `sent` in place, because the
   * code it describes is still the one to type.
   */
  const sendCode = useCallback(() => {
    request.mutate(undefined, {
      onSuccess: (data) => {
        setSent(data);
        setCode('');
        setCodeError(undefined);
        setCooldown(RESEND_SECONDS);
      },
    });
  }, [request]);

  const deleteNow = useCallback(() => {
    confirm
      .mutateAsync({ code, alsoOtherLogins }) // M01 audit: + the other login, when ticked
      .then((res) => {
        // Shown over the login screen: by the time this resolves the hook has
        // already signed out and `(app)` has unmounted — see `useConfirmAccountDeletion`.
        // >>> HELP34R — our own (translated) text with the date, never the server's English sentence.
        const deleteAt = (res as { data?: { deleteAt?: string } } | undefined)?.data?.deleteAt;
        const when = deleteAt && !Number.isNaN(Date.parse(deleteAt))
          ? new Date(deleteAt).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
          : '';
        Alert.alert(t('account.delete.doneTitle'), when ? t('account.delete.doneOn', { date: when }) : t('account.delete.doneBody'));
        // <<< HELP34R
      })
      .catch((e: unknown) => setCodeError(apiErrorMessage(e, t('account.delete.confirmFailed'))));
  }, [code, confirm, t, i18n, alsoOtherLogins]); // HELP34R: i18n · M01: alsoOtherLogins

  const onDeletePress = () => {
    if (code.length !== CODE_LENGTH) {
      setCodeError(t('account.delete.codeIncomplete'));
      return;
    }
    Alert.alert(t('account.delete.finalTitle'), t('account.delete.finalBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.delete.finalConfirm'), style: 'destructive', onPress: deleteNow },
    ]);
  };

  const openPolicy = () => {
    Linking.openURL(WEB_DELETE_ACCOUNT_URL).catch(() =>
      Alert.alert(t('account.delete.browserFailedTitle'), t('account.delete.browserFailedBody', { url: WEB_DELETE_ACCOUNT_URL })),
    );
  };

  /**
   * Where the code went, as one sentence. The address is this device's own copy
   * of the identity (`user.phone` / `user.email`); when it is missing the
   * sentence still names the channel, which is the part that says where to look.
   */
  const sentLine = (() => {
    if (!sent) return null;
    const to = sent.channel === 'EMAIL'
      ? user?.email || t('account.delete.yourEmail')
      : user?.phone || t('account.delete.yourPhone');
    switch (sent.deliveredVia) {
      case 'whatsapp':
        return t('account.delete.sentWhatsapp', { to });
      case 'sms':
        return t('account.delete.sentSms', { to });
      default:
        return t('account.delete.sentEmail', { to });
    }
  })();

  // 409 DELETION_BLOCKED is not a failure to retry but a thing to do first, so
  // it gets its own heading; the server's sentence underneath says what.
  const requestError = request.error
    ? {
        title: apiErrorCode(request.error) === 'DELETION_BLOCKED'
          ? t('account.delete.blockedTitle')
          // M01 audit: the other two 409 blocks are not "could not send".
          : apiErrorCode(request.error) === 'DELETION_SOLE_OWNER' || apiErrorCode(request.error) === 'DELETION_PLATFORM_STAFF'
            ? t('accountPlaces.blockedTitle')
            : t('account.delete.sendFailedTitle'),
        body: apiErrorMessage(request.error, t('account.delete.sendFailed')),
      }
    : null;

  const busy = request.isPending || confirm.isPending || leave.isPending;
  const canDelete = code.length === CODE_LENGTH && !busy;

  return (
    <Screen c={c} title={t('account.delete.title')}>
      {/* >>> M01 audit — 1. Your places: leaving ONE is the default choice (web profile parity). */}
      <SectionLabel c={c}>{t('accountPlaces.title')}</SectionLabel>
      {places.isPending ? (
        <Loading c={c} label={t('accountPlaces.loading')} />
      ) : places.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(places.error, t('accountPlaces.failed'))} onRetry={() => { void places.refetch(); }} />
      ) : list.length === 0 ? (
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('accountPlaces.empty')}</Text>
      ) : (
        <>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {t('accountPlaces.count', { n: list.length })} {t('accountPlaces.hint')}
          </Text>
          {list.map((place) => (
            <PlaceCard key={`${place.kind}-${place.id}`} place={place} busy={busy} onLeave={askLeave} />
          ))}
        </>
      )}
      {placeNote ? (
        <View
          style={[styles.alert, { backgroundColor: c.surface, borderColor: placeNote.error ? c.error : c.primary }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.body, { color: c.textPrimary }]}>{placeNote.text}</Text>
        </View>
      ) : null}

      {/* 2. Delete the whole login — secondary, warned, 30 days. */}
      <SectionLabel c={c}>{t('accountPlaces.fullTitle')}</SectionLabel>
      {/* <<< M01 audit */}
      <Card c={c} style={[styles.warning, { borderColor: c.error }]}>
        <View style={styles.warningHead}>
          <MaterialCommunityIcons name="alert-outline" size={22} color={c.error} />
          <Text style={[styles.warningTitle, { color: c.textPrimary }]}>{t('account.delete.warningTitle')}</Text>
        </View>
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('account.delete.warningBody')}</Text>
      </Card>

      <SectionLabel c={c}>{t('account.delete.deletedSection')}</SectionLabel>
      <Card c={c}>
        {DELETED_KEYS.map((key) => (
          <View key={key} style={styles.item}>
            <MaterialCommunityIcons name="close-circle-outline" size={18} color={c.error} />
            <Text style={[styles.itemText, { color: c.textPrimary }]}>{t(`account.delete.deleted.${key}`)}</Text>
          </View>
        ))}
      </Card>

      <SectionLabel c={c}>{t('account.delete.keptSection')}</SectionLabel>
      <Card c={c}>
        {KEPT_KEYS.map((key) => (
          <View key={key} style={styles.item}>
            <MaterialCommunityIcons name="archive-outline" size={18} color={c.textSecondary} />
            <Text style={[styles.itemText, { color: c.textPrimary }]}>{t(`account.delete.kept.${key}`)}</Text>
          </View>
        ))}
        <TouchableOpacity onPress={openPolicy} accessibilityRole="link" style={styles.link}>
          <MaterialCommunityIcons name="open-in-new" size={16} color={c.primary} />
          <Text style={{ color: c.primary, fontWeight: '600' }}>{t('account.delete.readPolicy')}</Text>
        </TouchableOpacity>
      </Card>

      {requestError ? (
        // Same treatment as `OtpDeliveryNotice`'s failure box: red carries the
        // border, the words stay in `textPrimary` — `danger` is under AA as text.
        <View style={[styles.alert, { backgroundColor: c.surface, borderColor: c.error }]}>
          <Text style={[styles.alertTitle, { color: c.textPrimary }]}>{requestError.title}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{requestError.body}</Text>
        </View>
      ) : null}

      {/* M01 audit — the person's other phone/email login, as on the web and the society app. */}
      {otherLogins > 0 ? (
        <TouchableOpacity
          onPress={() => setAlsoOtherLogins((v) => !v)}
          disabled={busy}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: alsoOtherLogins, disabled: busy }}
          style={styles.check}
        >
          <MaterialCommunityIcons
            name={alsoOtherLogins ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={alsoOtherLogins ? c.error : c.textSecondary}
          />
          <View style={styles.checkText}>
            <Text style={[styles.itemText, { color: c.textPrimary, fontWeight: '600' }]}>
              {t('accountPlaces.otherLoginsLabel', { n: otherLogins })}
            </Text>
            <Text style={[styles.body, { color: c.textSecondary }]}>{t('accountPlaces.otherLoginsHint')}</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {!sent ? (
        <>
          <Text style={[styles.body, { color: c.textSecondary }]}>{t('account.delete.sendHint')}</Text>
          <AppButton
            label={t('account.delete.sendCode')}
            icon="message-lock-outline"
            loading={request.isPending}
            onPress={sendCode}
          />
        </>
      ) : (
        <>
          <Text style={[styles.body, { color: c.textSecondary }]}>{sentLine}</Text>
          <AppInput
            label={t('account.delete.codeLabel')}
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH));
              setCodeError(undefined);
            }}
            keyboardType="numeric"
            autoComplete="sms-otp"
            leftIcon="lock-outline"
            disabled={confirm.isPending}
            error={codeError}
          />
          <AppButton
            label={t('account.delete.confirmButton')}
            icon="delete-forever-outline"
            loading={confirm.isPending}
            disabled={!canDelete}
            onPress={onDeletePress}
            // The one red fill in the app, and only while it can actually be
            // pressed — disabled keeps Paper's own greyed look.
            style={canDelete ? { backgroundColor: c.error } : undefined}
          />
          <TouchableOpacity onPress={sendCode} disabled={cooldown > 0 || busy} style={styles.resend}>
            <Text style={{ color: cooldown > 0 || busy ? c.textDisabled : c.primary, fontWeight: '600' }}>
              {cooldown > 0 ? t('account.delete.resendIn', { seconds: cooldown }) : t('account.delete.resend')}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </Screen>
  );
}

/**
 * >>> M01 audit — one place: its flats, why it cannot be left yet (if so), and
 * the leave buttons (same rules as the web profile page and the society app).
 * A business is left from Owners (hand-over) in this app, so it only says so.
 */
function PlaceCard({ place, busy, onLeave }: {
  place: Place; busy: boolean; onLeave: (place: Place, flat?: PlaceFlat) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const flatsLeaveAlone = place.flats.length > 1 || place.roles.some((r) => NON_RESIDENT_ROLES.includes(r));
  const soleOwnerFlats = place.flats.filter((f) => f.soleOwner).map((f) => f.label);
  return (
    <Card c={c} style={styles.place}>
      <View style={styles.item}>
        <MaterialCommunityIcons name={place.kind === 'PARTNER' ? 'storefront-outline' : 'office-building-outline'} size={20} color={c.primary} />
        <View style={styles.checkText}>
          <Text style={[styles.itemText, { color: c.textPrimary, fontWeight: '600' }]}>{place.name}</Text>
          {!place.thisLogin ? (
            <Text style={[styles.body, { color: c.textSecondary }]}>{t('accountPlaces.otherLoginBadge')}</Text>
          ) : null}
        </View>
      </View>
      {place.kind === 'PARTNER' ? (
        <Text style={[styles.body, { color: c.textSecondary }]}>{t('accountPlaces.businessNoteShop')}</Text>
      ) : (
        <>
          {place.flats.map((f) => (
            <View key={f.flatId} style={styles.flat}>
              <Text style={[styles.itemText, { color: c.textPrimary }]}>{f.label}</Text>
              {f.hasTenant && f.isOwner ? (
                <Text style={[styles.body, { color: c.textSecondary }]}>{t('accountPlaces.tenantNote', { flat: f.label })}</Text>
              ) : null}
              {flatsLeaveAlone && !f.soleOwner ? (
                <AppButton
                  label={t('accountPlaces.leaveFlat', { flat: f.label })}
                  icon="account-minus-outline"
                  mode="outlined"
                  fullWidth={false}
                  style={styles.inlineButton}
                  disabled={busy}
                  onPress={() => onLeave(place, f)}
                />
              ) : null}
            </View>
          ))}
          {place.leaveBlock === 'LEAVE_SOLE_ADMIN' ? (
            <Text style={[styles.body, { color: c.error }]}>{t('accountPlaces.soleAdminNote')}</Text>
          ) : place.leaveBlock === 'LEAVE_SOLE_OWNER' ? (
            <Text style={[styles.body, { color: c.error }]}>{t('accountPlaces.soleOwnerNote', { flats: soleOwnerFlats.join(', ') })}</Text>
          ) : null}
          {place.canLeave ? (
            <AppButton
              label={t('accountPlaces.leaveSociety')}
              icon="exit-run"
              mode="outlined"
              fullWidth={false}
              style={styles.inlineButton}
              disabled={busy}
              onPress={() => onLeave(place)}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
// <<< M01 audit

const styles = StyleSheet.create({
  // >>> M01 audit
  place: { gap: 8 },
  flat: { gap: 4 },
  inlineButton: { alignSelf: 'flex-start', maxWidth: '100%' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44, paddingVertical: 4 },
  checkText: { flex: 1, gap: 2 },
  // <<< M01 audit
  warning: { borderWidth: 1 },
  warningHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 19 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  alert: { borderWidth: 1, borderRadius: radii.sm, padding: 12, gap: 4 },
  alertTitle: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  resend: { alignSelf: 'center', paddingVertical: 10 },
});
