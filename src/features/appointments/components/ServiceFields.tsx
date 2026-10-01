import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { SectionLabel } from '../../more/ui';
import { ChoiceChips } from '../../p2/ui';
import { MODE_LABEL_KEY, PartnerServiceRow, ServiceMode } from '../../services/types';

/**
 * Service chips (active services only) and — only when the service is offered
 * both ways — where it happens. A service offered one way sets the mode itself.
 */
export function ServiceFields({
  c, services, serviceId, mode, onService, onMode,
}: {
  c: ColorScheme;
  services: PartnerServiceRow[];
  serviceId?: string;
  mode?: ServiceMode;
  onService: (s: PartnerServiceRow) => void;
  onMode: (m: ServiceMode) => void;
}) {
  const { t } = useTranslation();
  const picked = services.find((s) => s._id === serviceId);
  return (
    <View style={{ gap: 10 }}>
      <SectionLabel c={c}>{t('p2.appointments.new.service')}</SectionLabel>
      {services.length ? (
        <ChoiceChips
          c={c}
          options={services.map((s) => ({ key: s._id, label: s.name }))}
          value={serviceId ? [serviceId] : []}
          onChange={(v) => { const s = services.find((x) => x._id === v[0]); if (s) onService(s); }}
          testID="appt-services"
        />
      ) : (
        <Text style={{ color: c.warning, fontSize: 13 }}>{t('p2.appointments.new.noServices')}</Text>
      )}
      {picked && (picked.modes || []).length > 1 ? (
        <ChoiceChips
          c={c}
          options={picked.modes.map((m) => ({ key: m, label: t(MODE_LABEL_KEY[m]) }))}
          value={mode ? [mode] : []}
          onChange={(v) => v[0] && onMode(v[0])}
          testID="appt-modes"
        />
      ) : null}
    </View>
  );
}

/** The mode a freshly picked service starts in: its only one, else at the shop. */
export const defaultModeOf = (s: PartnerServiceRow): ServiceMode =>
  (s.modes || []).length === 1 ? s.modes[0] : (s.modes || []).includes('AT_PARTNER') ? 'AT_PARTNER' : (s.modes?.[0] ?? 'AT_PARTNER');
