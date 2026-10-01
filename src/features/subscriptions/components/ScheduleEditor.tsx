import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { ChoiceChips } from '../../p2/ui';
import type { ScheduleDraft } from '../logic';
import { SCHEDULE_PATTERNS, SchedulePattern } from '../types';

/** Daily / Alternate days / Chosen weekdays (then the days, Sunday first). */
export function ScheduleEditor({ c, value, onChange }: { c: ColorScheme; value: ScheduleDraft; onChange: (v: ScheduleDraft) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 8 }}>
      <ChoiceChips<SchedulePattern>
        c={c}
        testID="schedule-pattern"
        options={SCHEDULE_PATTERNS.map((p) => ({ key: p, label: t(`p2.subscriptions.schedule.${p}`) }))}
        value={[value.pattern]}
        onChange={(v) => onChange({ ...value, pattern: v[0] ?? 'DAILY' })}
      />
      {value.pattern === 'WEEKDAYS' ? (
        <>
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.schedule.pickDays')}</Text>
          <ChoiceChips<number>
            c={c}
            multi
            testID="schedule-weekdays"
            options={[0, 1, 2, 3, 4, 5, 6].map((d) => ({ key: d, label: t(`common.days.${d}`) }))}
            value={value.weekdays}
            onChange={(w) => onChange({ ...value, weekdays: w })}
          />
        </>
      ) : null}
    </View>
  );
}
