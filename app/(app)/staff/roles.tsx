import React, { useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { Chip, IconButton, Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import {
  rolesApi, PartnerAccessRole, PartnerModuleGrant, PermissionLevel, PartnerRoleCatalogEntry,
} from '../../../src/api/staff.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { Card, EmptyBlock, ErrorBlock, Loading, Row, Screen, SectionLabel } from '../../../src/features/more/ui';

/**
 * WHAT A PERMISSION LEVEL IS CALLED ON SCREEN — a catalogue key per level, not
 * the words. Same split as `DOCUMENT_TYPE_LABEL_KEY` in
 * `features/billing/types.ts`: the KEY is the wire value (`level` on a
 * `PartnerModuleGrant`, and what `can(module, level)` is checked against on both
 * sides), so it never moves; only the label is translated.
 */
const LEVEL_LABEL_KEY: Record<PermissionLevel, string> = {
  NONE: 'staff.roles.levelNONE',
  READ: 'staff.roles.levelREAD',
  FULL: 'staff.roles.levelFULL',
};

/** The empty draft `create` and "editing nothing yet" share, so a fresh role and a cleared form are the same shape. */
function draftFrom(role: PartnerAccessRole | null): { name: string; description: string; grants: Map<string, PermissionLevel> } {
  return {
    name: role?.name ?? '',
    description: role?.description ?? '',
    grants: new Map((role?.permissions ?? []).map((g) => [g.module, g.level])),
  };
}

export default function RolesScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: qk.staffRoles(), queryFn: rolesApi.list });

  // `undefined` = editor closed. `null` = creating a new role. A role = editing that role.
  const [editingRole, setEditingRole] = useState<PartnerAccessRole | null | undefined>(undefined);
  const [draft, setDraft] = useState(draftFrom(null));

  const openEditor = (role: PartnerAccessRole | null) => {
    setEditingRole(role);
    setDraft(draftFrom(role));
  };

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.staffRoles() });

  const createMutation = useMutation({
    mutationFn: () => rolesApi.create({
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      permissions: [...draft.grants.entries()]
        .filter(([, level]) => level !== 'NONE')
        .map(([module, level]) => ({ module, level } as PartnerModuleGrant)),
    }),
    onSuccess: () => { invalidate(); setEditingRole(undefined); },
    onError: (err) => Alert.alert(t('staff.roles.createFailed'), apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () => rolesApi.update(editingRole!._id, {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      permissions: [...draft.grants.entries()].map(([module, level]) => ({ module, level } as PartnerModuleGrant)),
    }),
    onSuccess: () => { invalidate(); setEditingRole(undefined); },
    onError: (err) => Alert.alert(t('staff.roles.saveFailed'), apiErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => rolesApi.remove(id),
    onSuccess: () => { invalidate(); setEditingRole(undefined); },
    onError: (err) => Alert.alert(t('staff.roles.deleteFailed'), apiErrorMessage(err)),
  });

  const confirmDelete = (role: PartnerAccessRole) => {
    Alert.alert(t('staff.roles.deleteTitle'), t('staff.roles.deleteBody', { name: role.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeMutation.mutate(role._id) },
    ]);
  };

  const cycleLevel = (entry: PartnerRoleCatalogEntry) => {
    const current = draft.grants.get(entry.key) ?? 'NONE';
    const idx = entry.levels.indexOf(current);
    const next = entry.levels[(idx + 1) % entry.levels.length];
    const grants = new Map(draft.grants);
    grants.set(entry.key, next);
    setDraft({ ...draft, grants });
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  if (query.isPending) return <Screen c={c} title={t('staff.roles.title')}><Loading c={c} /></Screen>;
  if (query.isError || !query.data) {
    return (
      <Screen c={c} title={t('staff.roles.title')}>
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('staff.roles.loadFailed'))} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  const { roles, catalog } = query.data;

  if (editingRole !== undefined) {
    const isSystem = editingRole?.isSystem === true;
    return (
      <Screen
        c={c}
        title={editingRole ? t('staff.roles.editTitle', { name: editingRole.name }) : t('staff.roles.newTitle')}
        back={false}
        right={<IconButton icon="close" size={22} onPress={() => setEditingRole(undefined)} />}
      >
        <AppInput label={t('staff.roles.roleName')} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} disabled={isSystem} />
        <AppInput label={t('staff.roles.description')} value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} disabled={isSystem} multiline />

        {isSystem && (
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>
            {t('staff.roles.seededNote')}
          </Text>
        )}

        <SectionLabel c={c}>{t('staff.roles.grantsSection')}</SectionLabel>
        <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
          {catalog.map((entry, i) => {
            const level = draft.grants.get(entry.key) ?? 'NONE';
            return (
              <View key={entry.key}>
                <Row
                  c={c}
                  /* `entry.label` and `entry.description` come from the SERVER's
                     permission catalogue (`GET /partners/me/roles`) and arrive in
                     English — the same trade `UsageMeter.tsx` documents for
                     `capacity.noun`. They follow when the backend catalogue does. */
                  title={entry.label}
                  subtitle={entry.description}
                  onPress={() => cycleLevel(entry)}
                  right={
                    <Chip
                      compact
                      style={[styles.levelPill, { backgroundColor: level === 'NONE' ? c.surfaceVariant : palette.brand[50] }]}
                      textStyle={{ fontSize: 11, fontWeight: '600', marginVertical: 0, color: level === 'NONE' ? c.textSecondary : palette.brand[600] }}
                    >
                      {t(LEVEL_LABEL_KEY[level])}
                    </Chip>
                  }
                />
                {i < catalog.length - 1 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
              </View>
            );
          })}
        </Card>
        <Text style={{ color: c.textDisabled, fontSize: 11 }}>{t('staff.roles.cycleHint')}</Text>

        <AppButton label={t(editingRole ? 'staff.roles.saveChanges' : 'staff.roles.createRole')} onPress={() => (editingRole ? updateMutation.mutate() : createMutation.mutate())} loading={saving} disabled={saving || !draft.name.trim()} style={{ marginTop: 8 }} />
        {editingRole && !isSystem && (
          <AppButton label={t('staff.roles.deleteRole')} mode="outlined" onPress={() => confirmDelete(editingRole)} style={{ marginTop: 4 }} labelStyle={{ color: c.error }} />
        )}
      </Screen>
    );
  }

  return (
    <Screen c={c} title={t('staff.roles.title')} subtitle={t('staff.roles.subtitle')} right={<IconButton icon="plus" size={24} onPress={() => openEditor(null)} />}>
      {roles.length === 0 ? (
        <EmptyBlock c={c} icon="shield-account-outline" title={t('staff.roles.emptyTitle')} body={t('staff.roles.emptyBody')} />
      ) : (
        <View style={{ gap: 10 }}>
          {roles.map((role) => (
            <Row
              key={role._id}
              c={c}
              icon="shield-account-outline"
              title={role.name}
              subtitle={
                /* `_one`/`_other`, not an English `-s` on "permission": Hindi
                   cannot pluralise by suffixing, and CLDR puts BOTH 0 and 1 in
                   its `one` category. The two flags are separate keys rather
                   than appended words so the whole phrase can be reordered. */
                t('staff.roles.grantCount', {
                  count: role.permissions.filter((p) => p.level !== 'NONE').length,
                  total: catalog.length,
                })
                + (role.isSystem ? t('staff.roles.seededSuffix') : '')
                + (!role.isActive ? t('staff.roles.inactiveSuffix') : '')
              }
              onPress={() => openEditor(role)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  levelPill: { borderRadius: radii.pill },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
});
