import React, { useEffect, useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { usePartnerEntitlements } from '../../../src/hooks';
import { partnerApi } from '../../../src/api/partner.api';
import { PartnerServiceMode } from '../../../src/types/api-contract.generated';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { Card, ChipRow, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';

/**
 * Where the business works — and it had no control anywhere in this app.
 *
 * The signup wizard asks at step 4 and then closes: `saveOnboardingStep` refuses
 * once the partner is ACTIVE, which is correct (the wizard registers a business,
 * it does not run one) but left a live partner unable to change the answer. And
 * the answer is not cosmetic: `IN_RANGE_EXPR` tests `serviceModes`, and a
 * partner with none contributes -1 on both branches — invisible to every
 * resident at every distance, not merely hard to find. A business added from the
 * owner console, or one whose wizard was abandoned before step 4, sat in exactly
 * that state with nothing on any screen saying so.
 *
 * ONE choice, not two checkboxes, and the same three the wizard offers: "neither
 * ticked" and "both ticked" are meaningfully different answers, and a pair of
 * checkboxes lets somebody submit the first by accident.
 */

type ModeChoice = 'AT_PARTNER' | 'AT_CUSTOMER' | 'BOTH';

const CHOICES: { key: ModeChoice; label: string }[] = [
  { key: 'AT_PARTNER', label: 'Customers come to you' },
  { key: 'AT_CUSTOMER', label: 'You travel to them' },
  { key: 'BOTH', label: 'Both' },
];

const modesOf = (choice: ModeChoice): PartnerServiceMode[] =>
  choice === 'BOTH' ? ['AT_PARTNER', 'AT_CUSTOMER'] : [choice];

const choiceOf = (modes?: PartnerServiceMode[]): ModeChoice | '' => {
  const set = new Set(modes ?? []);
  if (set.has('AT_PARTNER') && set.has('AT_CUSTOMER')) return 'BOTH';
  if (set.has('AT_CUSTOMER')) return 'AT_CUSTOMER';
  if (set.has('AT_PARTNER')) return 'AT_PARTNER';
  // `''` for a business nobody has ever asked — the chips then show nothing
  // chosen rather than silently claiming one.
  return '';
};

const travels = (choice: ModeChoice | '') => choice === 'AT_CUSTOMER' || choice === 'BOTH';

export default function WhereYouWorkScreen() {
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can, refresh } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');

  const query = useQuery({ queryKey: qk.partner.me(), queryFn: partnerApi.me });

  const [choice, setChoice] = useState<ModeChoice | ''>('');
  const [radius, setRadius] = useState('');

  useEffect(() => {
    const p = query.data?.partner;
    if (!p) return;
    setChoice(choiceOf(p.serviceModes));
    setRadius(p.serviceRadiusKm ? String(p.serviceRadiusKm) : '');
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => partnerApi.updateMe({
      serviceModes: choice ? modesOf(choice) : undefined,
      // Only when it applies. The server refuses a radius on a partner who does
      // not travel, and an empty string would fail its `z.coerce.number()`.
      serviceRadiusKm: travels(choice) && radius ? Number(radius) : undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.partner.me() });
      // The visibility report is computed from these fields, so the banner on
      // Today has to be re-asked or it keeps saying they are invisible.
      refresh();
      Alert.alert('Saved', 'Residents will be matched to you on this from now on.');
    },
    onError: (e) => Alert.alert('Could not save', apiErrorMessage(e)),
  });

  const onSave = () => {
    if (!choice) {
      Alert.alert('Pick one', 'Say whether customers come to you, you go to them, or both.');
      return;
    }
    // The same rule `serviceRadiusRule` runs on the server, caught here so the
    // answer names the box on screen rather than arriving as a validation path.
    if (travels(choice) && !radius.trim()) {
      Alert.alert('How far do you travel?', 'Set a distance in km so residents outside it are not offered you.');
      return;
    }
    save.mutate();
  };

  if (query.isLoading) return <Screen c={c} title="Where you work"><Loading c={c} /></Screen>;
  if (query.isError) {
    return (
      <Screen c={c} title="Where you work">
        <ErrorBlock c={c} message="We could not load your business just now." onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen c={c} title="Where you work" subtitle={canEdit ? undefined : 'View only'}>
      <Card c={c}>
        <SectionLabel c={c}>How you serve customers</SectionLabel>
        <Text style={{ color: c.textSecondary, marginBottom: 12 }}>
          Residents can only be matched to a business that has said this. It also decides which services you
          can offer — a job cannot happen somewhere you do not work.
        </Text>
        <ChipRow<ModeChoice>
          c={c}
          options={CHOICES}
          value={(choice || 'AT_PARTNER') as ModeChoice}
          onChange={(k) => canEdit && setChoice(k)}
        />
        {!choice && (
          <Text style={{ color: c.error, marginTop: 10 }}>
            Nothing chosen yet — which is why residents cannot find you.
          </Text>
        )}
      </Card>

      {travels(choice) && (
        <Card c={c}>
          <SectionLabel c={c}>How far you travel</SectionLabel>
          {/* `AppInput` has no `editable` prop, and rather than widen a shared
              component for one screen the read-only case is handled where it
              already is: a viewer has no Save button, so nothing they type can
              leave the device. */}
          <AppInput
            label="Distance in km"
            value={radius}
            onChangeText={setRadius}
            keyboardType="numeric"
          />
          <Text style={{ color: c.textSecondary, marginTop: 8 }}>
            Residents beyond this are not offered your services. 1–100 km.
          </Text>
        </Card>
      )}

      {canEdit && (
        <View style={{ marginTop: 4 }}>
          <AppButton label="Save" onPress={onSave} loading={save.isPending} disabled={save.isPending} />
        </View>
      )}
    </Screen>
  );
}
