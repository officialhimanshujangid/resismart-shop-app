import React, { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { Banner, PillButton } from '../../p1/ui';
import { Sheet } from '../../p2/ui';
import type { DeliveryRoute, RouteKind } from '../types';

/** Add or change a delivery route (kind ROUTE) or a tuition class (kind BATCH): name, time, in use. */
export function RouteSheet({
  visible, kind, route, onDismiss, submitting, error, onSubmit,
}: {
  visible: boolean; kind: RouteKind; route: DeliveryRoute | null; onDismiss: () => void; submitting: boolean; error?: string | null;
  onSubmit: (v: { name: string; timeText?: string; isActive: boolean }) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [name, setName] = useState('');
  const [time, setTime] = useState('');
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!visible) return;
    setName(route?.name ?? ''); setTime(route?.timeText ?? ''); setActive(route?.isActive ?? true);
  }, [visible, route]);
  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t(`p2.subscriptions.routes.sheet.${route ? 'edit' : 'add'}.${kind}`)}
      testID="route-sheet"
      footer={(
        <PillButton c={c} icon="content-save" label={submitting ? t('common.saving') : t('common.save')}
          disabled={submitting || !name.trim()}
          onPress={() => onSubmit({ name: name.trim(), ...(time.trim() || route?.timeText ? { timeText: time.trim() } : {}), isActive: active })}
          testID="route-save" />
      )}
    >
      <AppInput label={t('p2.subscriptions.routes.name')} value={name} onChangeText={(v) => setName(v.slice(0, 60))} />
      <AppInput label={t('p2.subscriptions.routes.time')} value={time} onChangeText={(v) => setTime(v.slice(0, 40))}
        placeholder={t('p2.subscriptions.routes.timePlaceholder')} />
      <View style={styles.switchRow}>
        <Text style={{ flex: 1, minWidth: 0, color: c.textPrimary }}>{t('p2.subscriptions.routes.active')}</Text>
        <Switch value={active} onValueChange={setActive} accessibilityLabel={t('p2.subscriptions.routes.active')} />
      </View>
      {error ? <Banner c={c} tone="error" body={error} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
});
