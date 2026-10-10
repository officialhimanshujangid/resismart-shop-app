import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ColorScheme } from '../../constants/colors';
import { Segmented } from '../../components/ui';
import { useMotionOK } from '../../theme/motion';
import { Card } from '../more/ui';

/**
 * P9A (Owner 2026-10-10, Phase 9 Q6) — which bookings and jobs a role sees:
 * "All jobs" (the default, today's behaviour) or "Only their assigned jobs"
 * (a technician sees just the visits given to them). The server enforces it on
 * lists, detail and every action; this card only sets it. Owner only — the
 * server answers 403 PARTNER_ROLE_JOB_SCOPE_OWNER_ONLY to anyone else.
 * Twin of the web role editor's "Which jobs this role sees" box.
 */
export type RoleJobScope = 'ALL' | 'ASSIGNED';

export function RoleJobScopeCard({
  c, value, onChange,
}: { c: ColorScheme; value: RoleJobScope; onChange: (v: RoleJobScope) => void }) {
  const { t } = useTranslation();
  const ok = useMotionOK();
  return (
    <Card c={c}>
      <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{t('staff.jobScope.title')}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('staff.jobScope.hint')}</Text>
      <View style={styles.gap}>
        <Segmented<RoleJobScope>
          testID="role-job-scope"
          value={value}
          onChange={onChange}
          options={[
            { key: 'ALL', label: t('staff.jobScope.all') },
            { key: 'ASSIGNED', label: t('staff.jobScope.assigned') },
          ]}
        />
      </View>
      {/* Keyed on the choice so the sentence fades in afresh when it changes. */}
      <Animated.View key={value} entering={ok ? FadeIn.duration(180) : undefined}>
        <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
          {t(value === 'ASSIGNED' ? 'staff.jobScope.assignedHint' : 'staff.jobScope.allHint')}
        </Text>
      </Animated.View>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginVertical: 8 },
});
