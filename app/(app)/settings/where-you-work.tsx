import React, { useEffect, useMemo, useState } from 'react';
import { Alert, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { usePartnerEntitlements } from '../../../src/hooks';
import { partnerApi } from '../../../src/api/partner.api';
import { PartnerServiceMode } from '../../../src/types/api-contract.generated';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { Card, ChipRow, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { alertApiError } from '../../../src/features/owners/alertApiError';

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
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const queryClient = useQueryClient();
  const { can, refresh } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');

  const query = useQuery({ queryKey: qk.partner.me(), queryFn: partnerApi.me });

  /**
   * Labels only. `modesOf` turns the chosen KEY into the `PartnerServiceMode`
   * enum the server stores and `IN_RANGE_EXPR` tests; the key never changes.
   */
  const choices = useMemo(
    () => ([
      { key: 'AT_PARTNER' as const, label: t('settings.whereYouWork.choiceAtPartner') },
      { key: 'AT_CUSTOMER' as const, label: t('settings.whereYouWork.choiceAtCustomer') },
      { key: 'BOTH' as const, label: t('settings.whereYouWork.choiceBoth') },
    ]),
    [t],
  );

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
      Alert.alert(t('settings.whereYouWork.savedTitle'), t('settings.whereYouWork.savedBody'));
    },
    // Same route as the address screen — see `alertApiError`.
    onError: (e) => alertApiError(t('settings.whereYouWork.couldNotSave'), e),
  });

  const onSave = () => {
    if (!choice) {
      Alert.alert(t('settings.whereYouWork.pickOneTitle'), t('settings.whereYouWork.pickOneBody'));
      return;
    }
    // The same rule `serviceRadiusRule` runs on the server, caught here so the
    // answer names the box on screen rather than arriving as a validation path.
    if (travels(choice) && !radius.trim()) {
      Alert.alert(t('settings.whereYouWork.howFarTitle'), t('settings.whereYouWork.howFarBody'));
      return;
    }
    save.mutate();
  };

  if (query.isLoading) return <Screen c={c} title={t('settings.whereYouWork.title')}><Loading c={c} /></Screen>;
  if (query.isError) {
    return (
      <Screen c={c} title={t('settings.whereYouWork.title')}>
        <ErrorBlock c={c} message={t('settings.whereYouWork.couldNotLoad')} onRetry={() => void query.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen c={c} title={t('settings.whereYouWork.title')} subtitle={canEdit ? undefined : t('settings.whereYouWork.viewOnly')}>
      <Card c={c}>
        <SectionLabel c={c}>{t('settings.whereYouWork.howYouServe')}</SectionLabel>
        <Text style={{ color: c.textSecondary, marginBottom: 12 }}>
          {t('settings.whereYouWork.howYouServeNote')}
        </Text>
        {/* `choice` straight through, `''` included — see `choiceOf` above and
            `ChipRow`'s own header. This used to fall back to `'AT_PARTNER'`,
            which lit the first chip for a business that had never been asked
            and so contradicted the "Nothing chosen yet" line directly beneath
            it. The strip now shows nothing chosen, which is the truth. */}
        <ChipRow<ModeChoice>
          c={c}
          options={choices}
          value={choice}
          onChange={(k) => canEdit && setChoice(k)}
        />
        {!choice && (
          <Text style={{ color: c.error, marginTop: 10 }}>
            {t('settings.whereYouWork.nothingChosen')}
          </Text>
        )}
      </Card>

      {travels(choice) && (
        <Card c={c}>
          <SectionLabel c={c}>{t('settings.whereYouWork.howFarSection')}</SectionLabel>
          {/* `AppInput` has no `editable` prop, and rather than widen a shared
              component for one screen the read-only case is handled where it
              already is: a viewer has no Save button, so nothing they type can
              leave the device. */}
          <AppInput
            label={t('settings.whereYouWork.distanceLabel')}
            value={radius}
            onChangeText={setRadius}
            keyboardType="numeric"
          />
          <Text style={{ color: c.textSecondary, marginTop: 8 }}>
            {t('settings.whereYouWork.distanceNote')}
          </Text>
        </Card>
      )}

      {canEdit && (
        <View style={{ marginTop: 4 }}>
          <AppButton label={t('settings.whereYouWork.save')} onPress={onSave} loading={save.isPending} disabled={save.isPending} />
        </View>
      )}
    </Screen>
  );
}
