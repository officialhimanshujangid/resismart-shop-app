import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { parseCoords, pointFromLocation } from '../../../src/lib/geo';
import { apiErrorMessage } from '../../../src/api/axios';
import { usePartnerEntitlements } from '../../../src/hooks';
import { partnerApi } from '../../../src/api/partner.api';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { MapPicker } from '../../../src/components/MapPicker';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';

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
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
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
      Alert.alert('Saved', 'Residents will be matched to you from this address and pin.');
    },
    onError: (e) => Alert.alert('Could not save', apiErrorMessage(e)),
  });

  const onSave = () => {
    // The same rules `updatePartnerSchema` and `onboardingGaps` apply, caught
    // here so the answer names the box on screen rather than arriving as a
    // validation path.
    if (name.trim().length < 2) {
      Alert.alert('Business name', 'Residents see this name, so it needs at least two characters.');
      return;
    }
    if (address.trim().length < 5) {
      Alert.alert('Address', 'Add the full address residents will see — at least five characters.');
      return;
    }
    if (!city.trim() || !state.trim()) {
      Alert.alert('City and state', 'Both are on the checklist ResiSmart reviews, so neither can be left empty.');
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      Alert.alert('Pincode', 'Enter a 6-digit pincode.');
      return;
    }
    if (!coords) {
      Alert.alert(
        'The map pin is not set',
        'Residents find businesses by distance, so without it you are in nobody’s area. Tap your shop on the map, or type a latitude between -90 and 90 and a longitude between -180 and 180.',
      );
      return;
    }
    save.mutate();
  };

  if (query.isPending) return <Screen c={c} title="Address & map pin"><Loading c={c} /></Screen>;
  if (query.isError) {
    return (
      <Screen c={c} title="Address & map pin">
        <ErrorBlock
          c={c}
          message={apiErrorMessage(query.error, 'We could not load your business just now.')}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen c={c} title="Address & map pin" subtitle={canEdit ? undefined : 'View only'}>
      <Card c={c}>
        <SectionLabel c={c}>What residents see</SectionLabel>
        <Text style={{ color: c.textSecondary, marginBottom: 4 }}>
          This is the name and address on your listing, and the pin residents are measured against. It is a
          different record from Settings → Business details, which is the address printed on your bills.
        </Text>
        <AppInput label="Business name" value={name} onChangeText={setName} disabled={!canEdit} />
        <AppInput label="Full address" value={address} onChangeText={setAddress} multiline disabled={!canEdit} />
        <View style={styles.row}>
          <AppInput label="City" value={city} onChangeText={setCity} style={styles.half} disabled={!canEdit} />
          <AppInput label="State" value={state} onChangeText={setState} style={styles.half} disabled={!canEdit} />
        </View>
        <AppInput
          label="Pincode"
          value={pincode}
          onChangeText={setPincode}
          keyboardType="numeric"
          disabled={!canEdit}
        />
      </Card>

      <Card c={c}>
        <SectionLabel c={c}>The map pin</SectionLabel>
        <Text style={{ color: c.textSecondary }}>
          Resident search is a distance query, so this is the field that decides whether you appear at all —
          not the address above it.
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
            label="Latitude"
            value={latText}
            onChangeText={setLatText}
            keyboardType="numeric"
            style={styles.half}
            disabled={!canEdit}
          />
          <AppInput
            label="Longitude"
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
              ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} — a valid point on the map.`
              : 'Latitude is between -90 and 90, longitude between -180 and 180 — and (0, 0) is in the sea.'
            : 'No pin set yet. Place it on the map above, or copy the two numbers out of a maps app.'}
        </Text>
      </Card>

      {canEdit && (
        <View style={{ marginTop: 4 }}>
          <AppButton label="Save" onPress={onSave} loading={save.isPending} disabled={save.isPending} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
