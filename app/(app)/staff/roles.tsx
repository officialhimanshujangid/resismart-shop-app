import React, { useState } from 'react';
import { Alert, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import {
  rolesApi, PartnerAccessRole, PartnerModuleGrant, PermissionLevel, PartnerRoleCatalogEntry,
} from '../../../src/api/staff.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { usePartnerEntitlements } from '../../../src/hooks';
import { useIsOnline } from '../../../src/hooks/useIsOnline';
import { grantableLevels, Level } from '../../../src/lib/staffAccess';
import { AppInput } from '../../../src/components/AppInput';
import { Button, EmptyState, SkeletonList } from '../../../src/components/ui';
import { GroupRow, ListGroup } from '../../../src/components/ui/ListGroup';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { radius, typeScale, type StatusTone } from '../../../src/theme/tokens';
import { Rise, useMotionOK } from '../../../src/theme/motion';
import { ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { limitsFormFrom, limitsFromForm, RoleLimitsCard, RoleLimitsForm } from '../../../src/features/p1/RoleLimitsCard';
import { RoleJobScopeCard, type RoleJobScope } from '../../../src/features/p1/RoleJobScopeCard'; // P9A Q6
import { HelpButton } from '../../../src/features/help/HelpButton'; // M02 audit

/**
 * WHAT A PERMISSION LEVEL IS CALLED ON SCREEN — a catalogue key per level, not
 * the words. The KEY is the wire value (`level` on a `PartnerModuleGrant`, and
 * what `can(module, level)` is checked against on both sides), so it never
 * moves; only the label is translated.
 */
const LEVEL_LABEL_KEY: Record<PermissionLevel, string> = {
  NONE: 'staff.roles.levelNONE',
  READ: 'staff.roles.levelREAD',
  FULL: 'staff.roles.levelFULL',
};

/** 1R: each level's look on its toggle pill — off (grey), view (blue), manage (green). */
const LEVEL_LOOK: Record<PermissionLevel, { tone: StatusTone; icon: string }> = {
  NONE: { tone: 'neutral', icon: 'minus-circle-outline' },
  READ: { tone: 'info', icon: 'eye-outline' },
  FULL: { tone: 'brand', icon: 'pencil-outline' },
};

/** The empty draft `create` and "editing nothing yet" share, so a fresh role and a cleared form are the same shape. */
function draftFrom(role: PartnerAccessRole | null): { name: string; description: string; grants: Map<string, PermissionLevel> } {
  return {
    name: role?.name ?? '',
    description: role?.description ?? '',
    grants: new Map((role?.permissions ?? []).map((g) => [g.module, g.level])),
  };
}

/**
 * The level on a permission row, drawn as a toggle pill: icon + word on the
 * level's soft colour. It pops when the level changes (tap the row to cycle,
 * as before). Decorative inside the row — the row's label carries the level.
 */
function LevelPill({ level, label }: { level: PermissionLevel; label: string }) {
  const { status, ds } = useAppTheme();
  const ok = useMotionOK();
  const look = LEVEL_LOOK[level];
  const tonePair = status[look.tone];
  // "None" in ink: the neutral grey is under 4.5:1 as 12 px text on its ground.
  const pair = level === 'NONE' ? { fg: ds.ink, bg: tonePair.bg } : tonePair;
  return (
    <Animated.View
      entering={ok ? ZoomIn.duration(160) : undefined}
      style={[styles.levelPill, { backgroundColor: pair.bg, borderColor: tonePair.fg }]}
    >
      <MaterialCommunityIcons name={look.icon as never} size={15} color={pair.fg} />
      <Text style={[typeScale.caption, { color: pair.fg }, { flexShrink: 1 }]}>{label}</Text>
    </Animated.View>
  );
}

export default function RolesScreen() {
  const { t, i18n } = useTranslation();
  // M02 audit: each catalogue row's Hindi from the server, English as the fallback.
  const isHi = i18n.language === 'hi';
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { ds, status } = useAppTheme();
  const online = useIsOnline();
  const queryClient = useQueryClient();
  const { can, entitlements } = usePartnerEntitlements();
  /** What THIS person holds for a module — the ceiling for any role they write. */
  const ownLevel = (module: PartnerRoleCatalogEntry['key']): Level =>
    (can(module, 'FULL') ? 'FULL' : can(module, 'READ') ? 'READ' : 'NONE');

  const query = useQuery({ queryKey: qk.staffRoles(), queryFn: rolesApi.list });
  /** P9A Q6: the "which jobs" choice only matters to a business that takes bookings. */
  const offersJobScope = (query.data?.catalog ?? []).some((e) => e.key === 'BOOKINGS_VIEW');

  // `undefined` = editor closed. `null` = creating a new role. A role = editing that role.
  const [editingRole, setEditingRole] = useState<PartnerAccessRole | null | undefined>(undefined);
  const [draft, setDraft] = useState(draftFrom(null));
  // P1 (screen S24): the role's limits — the OWNER alone may set or clear them.
  const [limits, setLimits] = useState<RoleLimitsForm>(limitsFormFrom());
  const [limitsError, setLimitsError] = useState<keyof RoleLimitsForm | undefined>(undefined);
  /** P9A Q6: "All jobs" (default) / "Only their assigned jobs" — the owner alone sets it. */
  const [jobScope, setJobScope] = useState<RoleJobScope>('ALL');
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
    setJobScope(role?.jobScope === 'ASSIGNED' ? 'ASSIGNED' : 'ALL');
  };

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.staffRoles() });

  const createMutation = useMutation({
    mutationFn: (lim: ReturnType<typeof limitsFromForm>['limits'] | undefined) => rolesApi.create({
      ...(lim ? { limits: lim } : {}),
      ...(isOwner && offersJobScope ? { jobScope } : {}), // P9A Q6
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
      ...(isOwner && offersJobScope ? { jobScope } : {}), // P9A Q6
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

  if (query.isPending) {
    return (
      <Screen c={c} title={t('staff.roles.title')}>
        {/* Skeleton rows while it loads; offline keeps the shared "waiting for signal" words. */}
        {online ? <SkeletonList rows={4} /> : <Loading c={c} />}
      </Screen>
    );
  }
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
        <Rise index={0} style={styles.block}>
          <AppInput label={t('staff.roles.roleName')} value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} disabled={isSystem} />
          <AppInput label={t('staff.roles.description')} value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} disabled={isSystem} multiline />

          {isSystem ? (
            <Text style={[typeScale.detail, { color: ds.muted }]}>{t('staff.roles.seededNote')}</Text>
          ) : null}
          {beyondMe ? (
            <View style={[styles.notice, { backgroundColor: status.danger.bg }]}>
              <MaterialCommunityIcons name="lock-outline" size={18} color={status.danger.fg} />
              <Text style={[typeScale.detail, styles.flex, { color: status.danger.fg }]}>{t('staff.roles.beyondYou')}</Text>
            </View>
          ) : null}
        </Rise>

        {/* The permissions, one card, one row per module with its level pill.
            Tap a row to cycle through the levels this person may grant. */}
        <Rise index={1}>
          <ListGroup title={t('staff.roles.grantsSection')} footer={t('staff.roles.cycleHint')}>
            {catalog.map((entry) => {
              const level = draft.grants.get(entry.key) ?? 'NONE';
              const levelLabel = t(LEVEL_LABEL_KEY[level]);
              /* `entry.label` and `entry.description` come from the SERVER's
                 permission catalogue (`GET /partners/me/roles`), which sends
                 `labelHi` / `descriptionHi` beside them (M02 audit). */
              const title = (isHi && entry.labelHi) || entry.label;
              return (
                <GroupRow
                  key={entry.key}
                  title={title}
                  detail={(isHi && entry.descriptionHi) || entry.description}
                  onPress={beyondMe ? undefined : () => cycleLevel(entry)}
                  accessibilityLabel={`${title}, ${levelLabel}`}
                  trailing={<LevelPill key={level} level={level} label={levelLabel} />}
                />
              );
            })}
          </ListGroup>
        </Rise>

        {isOwner ? (
          <Rise index={2}>
            <RoleLimitsCard c={c} value={limits} onChange={setLimits} error={limitsError} disabled={beyondMe} />
          </Rise>
        ) : null}

        {isOwner && offersJobScope ? (
          <Rise index={3}>
            <RoleJobScopeCard c={c} value={jobScope} onChange={setJobScope} />
          </Rise>
        ) : null}

        <Rise index={3} style={styles.actions}>
          {!beyondMe ? (
            <Button
              label={t(editingRole ? 'staff.roles.saveChanges' : 'staff.roles.createRole')}
              icon="content-save-outline"
              fullWidth
              onPress={() => {
                const l = limitsToSend();
                if (!l.ok) return;
                if (editingRole) updateMutation.mutate(l.value);
                else createMutation.mutate(l.value);
              }}
              loading={saving}
              disabled={saving || !draft.name.trim()}
            />
          ) : null}
          {editingRole && !isSystem && !beyondMe ? (
            <Button
              label={t('staff.roles.deleteRole')}
              icon="delete-outline"
              variant="dangerOutline"
              fullWidth
              onPress={() => confirmDelete(editingRole)}
            />
          ) : null}
        </Rise>
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
        <Rise index={0}>
          <EmptyState icon="shield-account-outline" title={t('staff.roles.emptyTitle')} body={t('staff.roles.emptyBody')} />
        </Rise>
      ) : (
        <Rise index={0}>
          <ListGroup>
            {roles.map((role) => (
              <GroupRow
                key={role._id}
                icon="shield-account-outline"
                tint={role.assignable === false ? 'amber' : 'green'}
                title={role.name}
                detail={
                  /* `_one`/`_other`, not an English `-s` on "permission": Hindi
                     cannot pluralise by suffixing, and CLDR puts BOTH 0 and 1 in
                     its `one` category. The flags are separate keys so the whole
                     phrase can be reordered. */
                  t('staff.roles.grantCount', {
                    count: role.permissions.filter((p) => p.level !== 'NONE').length,
                    total: catalog.length,
                  })
                  + (role.isSystem ? t('staff.roles.seededSuffix') : '')
                  + (!role.isActive ? t('staff.roles.inactiveSuffix') : '')
                  + (role.assignable === false ? t('staff.roles.beyondYouSuffix') : '')
                  + (role.jobScope === 'ASSIGNED' ? t('staff.jobScope.suffix') : '') // P9A Q6
                }
                onPress={() => openEditor(role)}
              />
            ))}
          </ListGroup>
        </Rise>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: 8 },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    minHeight: 30,
    flexShrink: 0,
  },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: radius.md, padding: 12 },
  actions: { gap: 10, marginTop: 4 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' }, // M02 audit
});
