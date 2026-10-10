import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { WEB_DELETE_ACCOUNT_URL } from '../../../src/constants/app';
import { useAuth } from '../../../src/context/AuthContext';
import { AccountDeletionRequest, Place, PlaceFlat } from '../../../src/api/account.api';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { useIsOnline } from '../../../src/hooks/useIsOnline';
import { Button, Card, SectionTitle, SkeletonList } from '../../../src/components/ui';
import { OtpCells } from '../../../src/components/ui/OtpCells';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { radius, typeScale } from '../../../src/theme/tokens';
import { Rise, useMotionOK } from '../../../src/theme/motion';
import { ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import {
  useConfirmAccountDeletion, useRequestAccountDeletion, useMyPlaces, useLeavePlace, // M01 audit: + places
  useRequestStaffRemoval, // P10S
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
  const { ds, status } = useAppTheme();
  const online = useIsOnline();
  const motionOK = useMotionOK();
  const link = status.brand.fg; // brand green that clears AA as small text
  /** 1R presentation only: bumped when a code is refused so the boxes shake once. */
  const [shakeKey, setShakeKey] = useState(0);
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
  // >>> P10S — staff: the business owner / HR removes the account; "Request removal".
  const removal = useRequestStaffRemoval();
  const employers = places.data?.employers ?? [];
  const removalAsked = places.data?.removalRequestedToday === true;
  const employerNames = employers.map((e) => (e.kind === 'PLATFORM' ? 'ResiSmart' : e.name)).filter(Boolean).join(', ');
  const [removalNote, setRemovalNote] = useState<{ text: string; error: boolean } | null>(null);
  const askRemoval = () => {
    setRemovalNote(null);
    removal.mutate(undefined, {
      onSuccess: (r) => setRemovalNote({ text: r.alreadyRequested ? t('account.delete.removalAlready') : t('account.delete.removalSent'), error: false }),
      onError: (e: unknown) => setRemovalNote({ text: apiErrorMessage(e, t('account.delete.sendFailed')), error: true }),
    });
  };
  // <<< P10S

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
      // P10S — a staff refusal: re-read the places so the employer card shows.
      onError: (e: unknown) => { if (apiErrorCode(e) === 'ACCOUNT_MANAGED_BY_EMPLOYER') void places.refetch(); },
    });
  }, [request, places]);

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
      .catch((e: unknown) => {
        setCodeError(apiErrorMessage(e, t('account.delete.confirmFailed')));
        setShakeKey((k) => k + 1);
      });
  }, [code, confirm, t, i18n, alsoOtherLogins]); // HELP34R: i18n · M01: alsoOtherLogins

  const onDeletePress = () => {
    if (code.length !== CODE_LENGTH) {
      setCodeError(t('account.delete.codeIncomplete'));
      setShakeKey((k) => k + 1);
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
            || apiErrorCode(request.error) === 'ACCOUNT_MANAGED_BY_EMPLOYER' // P10S
            ? t('accountPlaces.blockedTitle')
            : t('account.delete.sendFailedTitle'),
        body: apiErrorMessage(request.error, t('account.delete.sendFailed')),
      }
    : null;

  const busy = request.isPending || confirm.isPending || leave.isPending || removal.isPending;
  const canDelete = code.length === CODE_LENGTH && !busy;

  return (
    <Screen c={c} title={t('account.delete.title')}>
      {/* >>> M01 audit — 1. Your places: leaving ONE is the default choice (web profile parity). */}
      <Rise index={0} style={styles.section}>
        <SectionTitle>{t('accountPlaces.title')}</SectionTitle>
        {places.isPending ? (
          // Skeleton cards; offline keeps the shared "waiting for signal" words.
          online ? <SkeletonList rows={2} /> : <Loading c={c} label={t('accountPlaces.loading')} />
        ) : places.isError ? (
          <ErrorBlock c={c} message={apiErrorMessage(places.error, t('accountPlaces.failed'))} onRetry={() => { void places.refetch(); }} />
        ) : list.length === 0 ? (
          <Text style={[typeScale.detail, { color: ds.muted }]}>{t('accountPlaces.empty')}</Text>
        ) : (
          <>
            <Text style={[typeScale.detail, { color: ds.muted }]}>
              {t('accountPlaces.count', { n: list.length })} {t('accountPlaces.hint')}
            </Text>
            {list.map((place) => (
              <PlaceCard key={`${place.kind}-${place.id}`} place={place} busy={busy} onLeave={askLeave} />
            ))}
          </>
        )}
        {placeNote ? (
          <Animated.View
            key={placeNote.text}
            entering={motionOK ? FadeInDown.duration(280) : undefined}
            style={[styles.alert, { backgroundColor: placeNote.error ? status.danger.bg : status.success.bg }]}
            accessibilityLiveRegion="polite"
          >
            <Text style={[typeScale.row, { color: placeNote.error ? status.danger.fg : status.success.fg }]}>{placeNote.text}</Text>
          </Animated.View>
        ) : null}
      </Rise>

      {/* P10S — staff: managed by the employer; "Request removal" instead of delete. */}
      {employers.length > 0 ? (
        <Rise index={1} style={styles.section}>
          <SectionTitle>{t('accountPlaces.fullTitle')}</SectionTitle>
          <Card padding={18} testID="managed-by-employer">
            <View style={styles.warningHead}>
              <MaterialCommunityIcons name="briefcase-account-outline" size={22} color={status.brand.fg} />
              <Text style={[typeScale.section, styles.flex, { color: ds.ink }]}>{t('account.delete.managedTitle')}</Text>
            </View>
            <Text style={[typeScale.detail, { color: ds.ink }]}>
              {employerNames ? t('account.delete.managedBody', { names: employerNames }) : t('account.delete.managedBodyNoName')}
            </Text>
            <Text style={[typeScale.detail, { color: ds.muted }]}>{t('account.delete.managedAfter')}</Text>
            {removalAsked ? (
              <View style={[styles.alert, { backgroundColor: status.success.bg }]} accessibilityLiveRegion="polite">
                <Text style={[typeScale.row, { color: status.success.fg }]}>{t('account.delete.removalSentToday')}</Text>
              </View>
            ) : (
              <Button
                label={t('account.delete.requestRemoval')}
                icon="send-outline"
                fullWidth
                loading={removal.isPending}
                disabled={busy}
                onPress={askRemoval}
              />
            )}
            {removalNote ? (
              <Text style={[typeScale.detail, { color: removalNote.error ? status.danger.fg : status.success.fg }]} accessibilityLiveRegion="polite">
                {removalNote.text}
              </Text>
            ) : null}
          </Card>
        </Rise>
      ) : null}

      {/* 2. Delete the whole login — secondary, warned, 30 days. */}
      {employers.length === 0 ? (<>
      <Rise index={1} style={styles.section}>
        <SectionTitle>{t('accountPlaces.fullTitle')}</SectionTitle>
        {/* <<< M01 audit */}
        <View style={[styles.warning, { backgroundColor: status.danger.bg }]}>
          <View style={styles.warningHead}>
            <MaterialCommunityIcons name="alert-outline" size={22} color={status.danger.fg} />
            <Text style={[typeScale.section, styles.flex, { color: ds.ink }]}>{t('account.delete.warningTitle')}</Text>
          </View>
          <Text style={[typeScale.detail, { color: ds.ink }]}>{t('account.delete.warningBody')}</Text>
        </View>
      </Rise>

      <Rise index={2} style={styles.section}>
        <SectionTitle>{t('account.delete.deletedSection')}</SectionTitle>
        <Card>
          {DELETED_KEYS.map((key) => (
            <View key={key} style={styles.item}>
              <MaterialCommunityIcons name="close-circle-outline" size={18} color={status.danger.fg} />
              <Text style={[styles.itemText, { color: ds.ink }]}>{t(`account.delete.deleted.${key}`)}</Text>
            </View>
          ))}
        </Card>
      </Rise>

      <Rise index={3} style={styles.section}>
        <SectionTitle>{t('account.delete.keptSection')}</SectionTitle>
        <Card>
          {KEPT_KEYS.map((key) => (
            <View key={key} style={styles.item}>
              <MaterialCommunityIcons name="archive-outline" size={18} color={status.success.fg} />
              <Text style={[styles.itemText, { color: ds.ink }]}>{t(`account.delete.kept.${key}`)}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={openPolicy} accessibilityRole="link" style={styles.link}>
            <MaterialCommunityIcons name="open-in-new" size={16} color={link} />
            <Text style={{ color: link, fontWeight: '600', flexShrink: 1 }}>{t('account.delete.readPolicy')}</Text>
          </TouchableOpacity>
        </Card>
      </Rise>

      {requestError ? (
        // A soft red box: the heading in red (danger fg clears AA on its soft
        // ground), the server's sentence in ink.
        <Animated.View
          entering={motionOK ? FadeInDown.duration(280) : undefined}
          style={[styles.alert, { backgroundColor: status.danger.bg }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[typeScale.row, { color: status.danger.fg }]}>{requestError.title}</Text>
          <Text style={[typeScale.detail, { color: ds.ink }]}>{requestError.body}</Text>
        </Animated.View>
      ) : null}

      {/* M01 audit — the person's other phone/email login, as on the web and the society app. */}
      {otherLogins > 0 ? (
        <TouchableOpacity
          onPress={() => setAlsoOtherLogins((v) => !v)}
          disabled={busy}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: alsoOtherLogins, disabled: busy }}
          style={[styles.check, { backgroundColor: alsoOtherLogins ? status.danger.bg : ds.surface, borderColor: alsoOtherLogins ? status.danger.fg : ds.line }]}
        >
          <MaterialCommunityIcons
            name={alsoOtherLogins ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={alsoOtherLogins ? status.danger.fg : ds.muted}
          />
          <View style={styles.checkText}>
            <Text style={[styles.itemText, { color: ds.ink, fontWeight: '600' }]}>
              {t('accountPlaces.otherLoginsLabel', { n: otherLogins })}
            </Text>
            <Text style={[typeScale.detail, { color: ds.muted }]}>{t('accountPlaces.otherLoginsHint')}</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {!sent ? (
        <Rise index={4} style={styles.section}>
          <Text style={[typeScale.detail, { color: ds.muted }]}>{t('account.delete.sendHint')}</Text>
          <Button
            label={t('account.delete.sendCode')}
            icon="message-lock-outline"
            variant="dangerOutline"
            fullWidth
            loading={request.isPending}
            onPress={sendCode}
          />
        </Rise>
      ) : (
        <Rise index={0}>
          <Card padding={18}>
            <View style={[styles.sentRow, { backgroundColor: status.info.bg }]}>
              <MaterialCommunityIcons name="message-text-lock-outline" size={20} color={status.info.fg} />
              <Text style={[typeScale.detail, styles.flex, { color: ds.ink }]}>{sentLine}</Text>
            </View>
            <Text style={[typeScale.caption, { color: codeError ? status.danger.fg : ds.ink }]}>{t('account.delete.codeLabel')}</Text>
            {/* Six boxes over one real input (same digits-only handler, same
                SMS autofill): a refused or short code shakes the row red. */}
            <OtpCells
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH));
                setCodeError(undefined);
              }}
              length={CODE_LENGTH}
              editable={!confirm.isPending}
              state={codeError ? 'error' : 'idle'}
              shakeKey={shakeKey}
              accessibilityLabel={t('account.delete.codeLabel')}
              inputProps={{ autoComplete: 'sms-otp', textContentType: 'oneTimeCode' }}
            />
            {codeError ? (
              <Text style={[typeScale.caption, { color: status.danger.fg }]} accessibilityLiveRegion="polite">{codeError}</Text>
            ) : null}
            {/* The one red fill in the app, and only while it can actually be pressed. */}
            <Button
              label={t('account.delete.confirmButton')}
              icon="delete-forever-outline"
              variant="danger"
              fullWidth
              loading={confirm.isPending}
              disabled={!canDelete}
              onPress={onDeletePress}
            />
            <TouchableOpacity onPress={sendCode} disabled={cooldown > 0 || busy} style={styles.resend}>
              <Text style={{ color: cooldown > 0 || busy ? c.textDisabled : link, fontWeight: '600' }}>
                {cooldown > 0 ? t('account.delete.resendIn', { seconds: cooldown }) : t('account.delete.resend')}
              </Text>
            </TouchableOpacity>
          </Card>
        </Rise>
      )}
      </>) : null}
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
  const { ds, status, tints } = useAppTheme();
  const tn = tints[place.kind === 'PARTNER' ? 'green' : 'blue'];
  const flatsLeaveAlone = place.flats.length > 1 || place.roles.some((r) => NON_RESIDENT_ROLES.includes(r));
  const soleOwnerFlats = place.flats.filter((f) => f.soleOwner).map((f) => f.label);
  return (
    <Card style={styles.place}>
      <View style={styles.placeHead}>
        <View style={styles.placeIcon}>
          <LinearGradient colors={[tn.from, tn.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.placeIconFill]} />
          <MaterialCommunityIcons name={place.kind === 'PARTNER' ? 'storefront-outline' : 'office-building-outline'} size={20} color={tn.icon} />
        </View>
        <View style={styles.checkText}>
          <Text style={[typeScale.row, { color: ds.ink }]}>{place.name}</Text>
          {!place.thisLogin ? (
            <Text style={[typeScale.detail, { color: ds.muted }]}>{t('accountPlaces.otherLoginBadge')}</Text>
          ) : null}
        </View>
      </View>
      {place.kind === 'PARTNER' ? (
        <Text style={[typeScale.detail, { color: ds.muted }]}>
          {place.managedByEmployer ? t('accountPlaces.staffPlaceNote') : t('accountPlaces.businessNoteShop')}
        </Text>
      ) : (
        <>
          {place.flats.map((f) => (
            <View key={f.flatId} style={styles.flat}>
              <Text style={[styles.itemText, { color: ds.ink }]}>{f.label}</Text>
              {f.hasTenant && f.isOwner ? (
                <Text style={[typeScale.detail, { color: ds.muted }]}>{t('accountPlaces.tenantNote', { flat: f.label })}</Text>
              ) : null}
              {flatsLeaveAlone && !f.soleOwner ? (
                <Button
                  label={t('accountPlaces.leaveFlat', { flat: f.label })}
                  icon="account-minus-outline"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onPress={() => onLeave(place, f)}
                />
              ) : null}
            </View>
          ))}
          {place.leaveBlock === 'ACCOUNT_MANAGED_BY_EMPLOYER' ? (
            <Text style={[typeScale.detail, { color: ds.muted }]}>{t('accountPlaces.staffPlaceNote')}</Text>
          ) : place.leaveBlock === 'LEAVE_SOLE_ADMIN' ? (
            <Text style={[typeScale.detail, { color: status.danger.fg }]}>{t('accountPlaces.soleAdminNote')}</Text>
          ) : place.leaveBlock === 'LEAVE_SOLE_OWNER' ? (
            <Text style={[typeScale.detail, { color: status.danger.fg }]}>{t('accountPlaces.soleOwnerNote', { flats: soleOwnerFlats.join(', ') })}</Text>
          ) : null}
          {place.canLeave ? (
            <Button
              label={t('accountPlaces.leaveSociety')}
              icon="exit-run"
              variant="outline"
              size="sm"
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
  flex: { flex: 1 },
  section: { gap: 10 },
  // >>> M01 audit
  place: { gap: 10 },
  placeHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  placeIconFill: { borderRadius: 14 },
  flat: { gap: 6 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44, padding: 12, borderWidth: 1, borderRadius: radius.row },
  checkText: { flex: 1, gap: 2 },
  // <<< M01 audit
  warning: { borderRadius: radius.card, padding: 16, gap: 8 },
  warningHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4, minHeight: 44 },
  alert: { borderRadius: radius.row, padding: 14, gap: 4 },
  sentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.md, padding: 12 },
  resend: { alignSelf: 'center', paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
});
