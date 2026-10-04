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
import { usePartnerEntitlements } from '../../../src/hooks';
import { grantableLevels, Level } from '../../../src/lib/staffAccess';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { Card, EmptyBlock, ErrorBlock, Loading, Row, Screen, SectionLabel } from '../../../src/features/more/ui';
import { limitsFormFrom, limitsFromForm, RoleLimitsCard, RoleLimitsForm } from '../../../src/features/p1/RoleLimitsCard';
import { HelpButton } from '../../../src/features/help/HelpButton'; // M02 audit

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
  const { t, i18n } = useTranslation();
  // M02 audit: each catalogue row's Hindi from the server, English as the fallback.
  const isHi = i18n.language === 'hi';
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();
  const { can, entitlements } = usePartnerEntitlements();
  /** What THIS person holds for a module — the ceiling for any role they write. */
  const ownLevel = (module: PartnerRoleCatalogEntry['key']): Level =>
    (can(module, 'FULL') ? 'FULL' : can(module, 'READ') ? 'READ' : 'NONE');

  const query = useQuery({ queryKey: qk.staffRoles(), queryFn: rolesApi.list });

  // `undefined` = editor closed. `null` = creating a new role. A role = editing that role.
  const [editingRole, setEditingRole] = useState<PartnerAccessRole | null | undefined>(undefined);
  const [draft, setDraft] = useState(draftFrom(null));
  // P1 (screen S24): the role's limits — the OWNER alone may set or clear them.
  const [limits, setLimits] = useState<RoleLimitsForm>(limitsFormFrom());
  const [limitsError, setLimitsError] = useState<keyof RoleLimitsForm | undefined>(undefined);
  const isOwner = entitlements.isAdmin;
  /** `undefined` = leave limits alone (not the owner, or unchanged); else the value to send. */
  const limitsToSend = (): { ok: boolean; value?: ReturnType<typeof limitsFromForm>['limits'] } => {
    if (!isOwner) return { ok: true };
    const res = limitsFromForm(limits);
    if (res.error) { setLimitsError(res.error); return { ok: false }; }
    setLimitsError(undefined);
    return { ok: true, value: res.limits };
  };

  const openEditor = (role: PartnerAccessRole | null) => {
    setEditingRole(role);
    setDraft(draftFrom(role));
    setLimits(limitsFormFrom(role?.limits));
    setLimitsError(undefined);
  };

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.staffRoles() });

  const createMutation = useMutation({
    mutationFn: (lim: ReturnType<typeof limitsFromForm>['limits'] | undefined) => rolesApi.create({
      ...(lim ? { limits: lim } : {}),
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
    mutationFn: (lim: ReturnType<typeof limitsFromForm>['limits'] | undefined) => rolesApi.update(editingRole!._id, {
      ...(lim !== undefined ? { limits: lim } : {}),
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

  /**
   * Cycles only through levels this person holds themselves — the server
   * refuses a role above its writer's access (`PARTNER_ROLE_BEYOND_YOUR_ACCESS`).
   */
  const cycleLevel = (entry: PartnerRoleCatalogEntry) => {
    const levels = grantableLevels(entry.levels, entitlements.isAdmin, ownLevel(entry.key));
    if (levels.length < 2) return;
    const current = draft.grants.get(entry.key) ?? 'NONE';
    const idx = levels.indexOf(current);
    const next = levels[(idx + 1) % levels.length];
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
    /** A role above this person's own access: shown, never changed, from here. */
    const beyondMe = editingRole?.assignable === false;
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
        {beyondMe && (
          <Text style={{ color: c.error, fontSize: 13 }}>
            {t('staff.roles.beyondYou')}
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
                     permission catalogue (`GET /partners/me/roles`), which now
                     sends `labelHi` / `descriptionHi` beside them (M02 audit). */
                  title={(isHi && entry.labelHi) || entry.label}
                  subtitle={(isHi && entry.descriptionHi) || entry.description}
                  onPress={beyondMe ? undefined : () => cycleLevel(entry)}
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

        {isOwner && (
          <RoleLimitsCard c={c} value={limits} onChange={setLimits} error={limitsError} disabled={beyondMe} />
        )}

        {!beyondMe && (
          <AppButton label={t(editingRole ? 'staff.roles.saveChanges' : 'staff.roles.createRole')} onPress={() => {
            const l = limitsToSend();
            if (!l.ok) return;
            if (editingRole) updateMutation.mutate(l.value);
            else createMutation.mutate(l.value);
          }} loading={saving} disabled={saving || !draft.name.trim()} style={{ marginTop: 8 }} />
        )}
        {editingRole && !isSystem && !beyondMe && (
          <AppButton label={t('staff.roles.deleteRole')} mode="outlined" onPress={() => confirmDelete(editingRole)} style={{ marginTop: 4 }} labelStyle={{ color: c.error }} />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      c={c}
      title={t('staff.roles.title')}
      subtitle={t('staff.roles.subtitle')}
      // M02 audit: `right` replaces the header's help button, so the roles screen
      // had no way into help — both icons now, help beside "new role".
      right={(
        <View style={styles.headerIcons}>
          <HelpButton c={c} />
          <IconButton icon="plus" size={24} onPress={() => openEditor(null)} accessibilityLabel={t('staff.roles.newTitle')} />
        </View>
      )}
    >
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
                + (role.assignable === false ? t('staff.roles.beyondYouSuffix') : '')
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
  headerIcons: { flexDirection: 'row', alignItems: 'center' }, // M02 audit
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
});
