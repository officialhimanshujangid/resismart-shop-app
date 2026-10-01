import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../constants/colors';
import { AppInput } from '../../../components/AppInput';
import { Banner, PillButton } from '../../p1/ui';
import { ChoiceChips, Sheet } from '../../p2/ui';
import { AutoIssueChoice, EditDraft, buildEditBody, editDraftOf } from '../logic';
import type { DeliveryRoute, EditBody, Subscription } from '../types';

/**
 * "Edit": name, route (or class) and place in the walking order, bill day
 * (blank = the shop's setting), auto-issue (the shop's setting / yes / no) and
 * notes. Only what changed is sent.
 */
export function EditSheet({
  visible, sub, routes, onDismiss, submitting, error, onSubmit,
}: {
  visible: boolean; sub: Subscription; routes: readonly DeliveryRoute[]; onDismiss: () => void; submitting: boolean;
  error?: string | null; onSubmit: (body: EditBody) => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const [d, setD] = useState<EditDraft>(() => editDraftOf(sub));
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => { if (visible) { setD(editDraftOf(sub)); setProblem(null); } }, [visible, sub]);
  const set = (p: Partial<EditDraft>) => setD((x) => ({ ...x, ...p }));
  const kind = sub.kind === 'TUITION' ? 'BATCH' : 'ROUTE';
  const options = routes.filter((r) => r.kind === kind && (r.isActive || r._id === d.routeId));

  const save = () => {
    const r = buildEditBody(sub, d);
    if (r.problem === 'NOTHING') { onDismiss(); return; }
    if (r.problem !== null) { setProblem(t(`p2.subscriptions.edit.problem.${r.problem}`)); return; }
    setProblem(null);
    onSubmit(r.body);
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title={t('p2.subscriptions.edit.title')}
      testID="edit-sheet"
      footer={<PillButton c={c} icon="content-save" label={submitting ? t('common.saving') : t('common.save')} onPress={save} disabled={submitting} testID="edit-save" />}
    >
      <AppInput label={t('p2.subscriptions.new.titleLabel')} value={d.title} onChangeText={(v) => set({ title: v.slice(0, 80) })} />
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>
        {t(kind === 'BATCH' ? 'p2.subscriptions.new.class' : 'p2.subscriptions.new.route')}
      </Text>
      <ChoiceChips
        c={c}
        testID="edit-route"
        options={[{ key: '', label: t('p2.subscriptions.new.noRoute') }, ...options.map((r) => ({ key: r._id, label: r.name }))]}
        value={[d.routeId ?? '']}
        onChange={(v) => set({ routeId: v[0] || null })}
      />
      {d.routeId && kind === 'ROUTE' ? (
        <AppInput label={t('p2.subscriptions.new.routeSeq')} value={d.routeSeq} keyboardType="numeric"
          onChangeText={(v) => set({ routeSeq: v.replace(/[^0-9]/g, '') })} />
      ) : null}
      <AppInput label={t('p2.subscriptions.edit.billDay')} value={d.billDay} keyboardType="numeric"
        onChangeText={(v) => set({ billDay: v.replace(/[^0-9]/g, '').slice(0, 2) })} />
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('p2.subscriptions.edit.billDayHelp')}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('p2.subscriptions.edit.autoIssue')}</Text>
      <ChoiceChips<AutoIssueChoice>
        c={c}
        testID="edit-autoissue"
        options={(['DEFAULT', 'YES', 'NO'] as AutoIssueChoice[]).map((k) => ({ key: k, label: t(`p2.subscriptions.edit.auto.${k}`) }))}
        value={[d.autoIssue]}
        onChange={(v) => set({ autoIssue: v[0] ?? 'DEFAULT' })}
      />
      <AppInput label={t('p2.common.notes')} value={d.notes} onChangeText={(v) => set({ notes: v.slice(0, 300) })} multiline />
      {problem ? <Banner c={c} tone="error" body={problem} /> : null}
      {error ? <Banner c={c} tone="error" body={error} testID="edit-error" /> : null}
    </Sheet>
  );
}
