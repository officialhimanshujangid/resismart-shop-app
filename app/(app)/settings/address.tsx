import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { parseCoords, pointFromLocation } from '../../../src/lib/geo';
import { apiErrorMessage } from '../../../src/api/axios';
import { usePartnerEntitlements } from '../../../src/hooks';
import { partnerApi } from '../../../src/api/partner.api';
import { AppInput } from '../../../src/components/AppInput';
import { Button, useToast } from '../../../src/components/ui'; // M19: kit button (haptic) + success toast
import { MapPicker } from '../../../src/components/MapPicker';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { alertApiError } from '../../../src/features/owners/alertApiError';

/**
 * Where residents find you — and the map pin had no editor anywhere in this app.
 *
 * `expo-location` and every coordinate in the codebase lived in exactly one
 * file, `(auth)/register.tsx`, and the signup wizard refuses an ACTIVE partner
 * (`EDITABLE_ONBOARDING_STATUSES` is DRAFT/PENDING/REJECTED). So a business
 * whose pin was never captured — a phone that would not fix indoors, a denied
 * location permission, an owner-console row that never ran the wizard — was
 * invisible to every resident at every distance, was TOLD so by the visibility
 * banner, and had nothing to tap. This is the screen that banner points at.
 *
 * ── This is NOT Settings → Business details ───────────────────────────────
 *
 * That screen writes `PartnerBusinessSettings`, a different document: the
 * invoicing identity, whose City / State / Pincode are the registered address
 * printed on a bill. These write the `Partner` document, which is what discovery
 * and the onboarding checklist read. The two look nearly identical on screen and
 * are not the same fields, so each one says which is which and links to the
 * other — filling in the wrong one, getting a success toast and watching the
 * checklist not move is a trap worth a sentence on both screens.
 *
 * `PUT /partners/me/partner` is the endpoint that stays open after a partner
 * goes live (`updateMe`); it needs SETTINGS at FULL, which is why the Save
 * button is the only thing gated — a viewer can read the pin, they just cannot
 * move it.
 */
export default function AddressScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can, refresh } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');

  const query = useQuery({ queryKey: qk.partner.me(), queryFn: partnerApi.me });

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');

  const coords = useMemo(() => parseCoords(latText, lngText), [latText, lngText]);

  /**
   * The map's only way to write. It puts the pin into the TEXT boxes rather than
   * into a second piece of state, so there is still exactly one source of truth
   * on this screen and everything downstream — the validity line, the Save
   * guard, the request body — keeps reading it through `parseCoords`.
   */
  const onPickOnMap = useCallback((lat: number, lng: number) => {
    setLatText(String(lat));
    setLngText(String(lng));
  }, []);

  useEffect(() => {
    const p = query.data?.partner;
    if (!p) return;
    setName(p.name);
    // The placeholder `register-public` writes before step 2 has run. Showing it
    // back would invite somebody to save it as their address.
    setAddress(p.address && !p.address.startsWith('To be confirmed') ? p.address : '');
    setCity(p.city ?? '');
    setState(p.state ?? '');
    setPincode(p.pincode ?? '');
    // GeoJSON is [longitude, latitude], and `hasDiscoveryLocation` (shared with
    // the server's copy of the same name) is what decides whether the pair means
    // a pin at all — `[0, 0]` has length 2 and does not.
    const saved = pointFromLocation(p.location);
    setLatText(saved ? String(saved.lat) : '');
    setLngText(saved ? String(saved.lng) : '');
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => partnerApi.updateMe({
      name: name.trim(),
      address: address.trim(),
      // Sent as typed. An empty string would CLEAR these server-side, which is
      // why `onSave` refuses one first — `onboardingGaps` lists all three, so
      // emptying a box here would put a partner back on the checklist.
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      // Both or neither: the controller only writes the point when it has the
      // pair, so sending one of them is sending none.
      latitude: coords?.lat,
      longitude: coords?.lng,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.partner.me() });
      // The visibility report and the onboarding checklist are both computed
      // from these fields, so both have to be re-asked or they keep naming a
      // problem that has just been fixed.
      void queryClient.invalidateQueries({ queryKey: qk.onboarding.status() });
      refresh();
      toast.show({ message: `${t('settings.address.savedTitle')} — ${t('settings.address.savedBody')}`, tone: 'success' });
    },
    // `PUT /partners/me/partner` — the route that refuses an admin-email change
    // with PARTNER_ADMIN_EMAIL_USE_HANDOVER; that one alert offers Team → Owners.
    onError: (e) => alertApiError(t('settings.address.couldNotSave'), e),
  });

  const onSave = () => {
    // The same rules `updatePartnerSchema` and `onboardingGaps` apply, caught
    // here so the answer names the box on screen rather than arriving as a
    // validation path.
    if (name.trim().length < 2) {
      Alert.alert(t('settings.address.nameErrorTitle'), t('settings.address.nameErrorBody'));
      return;
    }
    if (address.trim().length < 5) {
      Alert.alert(t('settings.address.addressErrorTitle'), t('settings.address.addressErrorBody'));
      return;
    }
    if (!city.trim() || !state.trim()) {
      Alert.alert(t('settings.address.cityStateErrorTitle'), t('settings.address.cityStateErrorBody'));
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      Alert.alert(t('settings.address.pincodeErrorTitle'), t('settings.address.pincodeErrorBody'));
      return;
    }
    if (!coords) {
      Alert.alert(t('settings.address.pinErrorTitle'), t('settings.address.pinErrorBody'));
      return;
    }
    save.mutate();
  };

  if (query.isPending) return <Screen c={c} title={t('settings.address.title')}><Loading c={c} skeleton={4} /></Screen>;
  if (query.isError) {
    return (
      <Screen c={c} title={t('settings.address.title')}>
        <ErrorBlock
          c={c}
          message={apiErrorMessage(query.error, t('settings.address.couldNotLoad'))}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen c={c} title={t('settings.address.title')} subtitle={canEdit ? undefined : t('settings.address.viewOnly')} rise>
      <Card c={c}>
        <SectionLabel c={c}>{t('settings.address.listingSection')}</SectionLabel>
        <Text style={{ color: c.textSecondary, marginBottom: 4 }}>
          {t('settings.address.listingNote')}
        </Text>
        <AppInput label={t('settings.address.name')} value={name} onChangeText={setName} disabled={!canEdit} />
        <AppInput label={t('settings.address.fullAddress')} value={address} onChangeText={setAddress} multiline disabled={!canEdit} />
        <View style={styles.row}>
          <AppInput label={t('settings.address.city')} value={city} onChangeText={setCity} style={styles.half} disabled={!canEdit} />
          <AppInput label={t('settings.address.state')} value={state} onChangeText={setState} style={styles.half} disabled={!canEdit} />
        </View>
        <AppInput
          label={t('settings.address.pincode')}
          value={pincode}
          onChangeText={setPincode}
          keyboardType="numeric"
          disabled={!canEdit}
        />
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>{t('settings.address.pinSection')}</SectionLabel>
        <Text style={{ color: c.textSecondary }}>
          {t('settings.address.pinNote')}
        </Text>

        {/* The map writes THROUGH the two boxes below rather than around them —
            see `onPickOnMap`. With no pin it shows no marker at all, so a shop
            that has never been placed cannot look like one that has. */}
        <MapPicker c={c} point={coords} onPick={onPickOnMap} disabled={!canEdit} />

        <View style={styles.row}>
          {/* `numeric`, not `number-pad`: React Native maps it to a keyboard
              carrying the decimal point AND the minus sign on both platforms,
              and a coordinate needs both. */}
          <AppInput
            label={t('settings.address.latitude')}
            value={latText}
            onChangeText={setLatText}
            keyboardType="numeric"
            style={styles.half}
            disabled={!canEdit}
          />
          <AppInput
            label={t('settings.address.longitude')}
            value={lngText}
            onChangeText={setLngText}
            keyboardType="numeric"
            style={styles.half}
            disabled={!canEdit}
          />
        </View>
        <Text style={{ color: coords || !(latText || lngText) ? c.textSecondary : c.error, fontSize: 12.5 }}>
          {latText || lngText
            ? coords
              ? t('settings.address.pinValid', { lat: coords.lat.toFixed(5), lng: coords.lng.toFixed(5) })
              : t('settings.address.pinInvalid')
            : t('settings.address.pinEmpty')}
        </Text>
      </Card>

      {canEdit && (
        <View style={{ marginTop: 4 }}>
          <Button fullWidth label={t('settings.address.save')} onPress={onSave} loading={save.isPending} disabled={save.isPending} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
