import React, { useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import {
  rolesApi, PartnerAccessRole, PartnerModuleGrant, PermissionLevel, PartnerRoleCatalogEntry,
} from '../../../src/api/staff.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { AppInput } from '../../../src/components/AppInput';
import { AppButton } from '../../../src/components/AppButton';
import { Card, EmptyBlock, ErrorBlock, Loading, Row, Screen, SectionLabel } from '../../../src/features/more/ui';

const LEVEL_LABEL: Record<PermissionLevel, string> = { NONE: 'None', READ: 'View', FULL: 'Manage' };

/** The empty draft `create` and "editing nothing yet" share, so a fresh role and a cleared form are the same shape. */
function draftFrom(role: PartnerAccessRole | null): { name: string; description: string; grants: Map<string, PermissionLevel> } {
  return {
    name: role?.name ?? '',
    description: role?.description ?? '',
    grants: new Map((role?.permissions ?? []).map((g) => [g.module, g.level])),
  };
}

export default function RolesScreen() {
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
    onError: (err) => Alert.alert('Could not create that role', apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () => rolesApi.update(editingRole!._id, {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      permissions: [...draft.grants.entries()].map(([module, level]) => ({ module, level } as PartnerModuleGrant)),
    }),
    onSuccess: () => { invalidate(); setEditingRole(undefined); },
    onError: (err) => Alert.alert('Could not save that role', apiErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => rolesApi.remove(id),
    onSuccess: () => { invalidate(); setEditingRole(undefined); },
    onError: (err) => Alert.alert('Could not delete that role', apiErrorMessage(err)),
  });

  const confirmDelete = (role: PartnerAccessRole) => {
    Alert.alert('Delete this role?', `Anybody holding "${role.name}" will lose the access it grants.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeMutation.mutate(role._id) },
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

  if (query.isPending) return <Screen c={c} title="Roles"><Loading c={c} /></Screen>;
  if (query.isError || !query.data) {
    return <Screen c={c} title="Roles"><ErrorBlock c={c} message={apiErrorMessage(query.error, 'Could not load roles.')} onRetry={() => query.refetch()} /></Screen>;
  }

  const { roles, catalog } = query.data;

  if (editingRole !== undefined) {
    const isSystem = editingRole?.isSystem === true;
    return (
      <Screen c={c} title={editingRole ? `Edit ${editingRole.name}` : 'New role'} back={false} right={<IconButton icon="close" size={22} onPress={() => setEditingRole(undefined)} />}>
        <AppInput label="Role name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} disabled={isSystem} />
        <AppInput label="Description (optional)" value={draft.description} onChangeText={(v) => setDraft({ ...draft, description: v })} disabled={isSystem} multiline />

        {isSystem && (
          <Text style={{ color: c.textSecondary, fontSize: 12 }}>
            This is a seeded role and cannot be renamed or deleted, but its permissions can still be changed.
          </Text>
        )}

        <SectionLabel c={c}>What this role may touch</SectionLabel>
        <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
          {catalog.map((entry, i) => {
            const level = draft.grants.get(entry.key) ?? 'NONE';
            return (
              <View key={entry.key}>
                <Row
                  c={c}
                  title={entry.label}
                  subtitle={entry.description}
                  onPress={() => cycleLevel(entry)}
                  right={
                    <View style={[styles.levelPill, { backgroundColor: level === 'NONE' ? c.surfaceVariant : palette.brand[50] }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: level === 'NONE' ? c.textSecondary : palette.brand[600] }}>
                        {LEVEL_LABEL[level]}
                      </Text>
                    </View>
                  }
                />
                {i < catalog.length - 1 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
              </View>
            );
          })}
        </Card>
        <Text style={{ color: c.textDisabled, fontSize: 11 }}>Tap a row to cycle through what it may grant.</Text>

        <AppButton label={editingRole ? 'Save changes' : 'Create role'} onPress={() => (editingRole ? updateMutation.mutate() : createMutation.mutate())} loading={saving} disabled={saving || !draft.name.trim()} style={{ marginTop: 8 }} />
        {editingRole && !isSystem && (
          <AppButton label="Delete role" mode="outlined" onPress={() => confirmDelete(editingRole)} style={{ marginTop: 4 }} labelStyle={{ color: c.error }} />
        )}
      </Screen>
    );
  }

  return (
    <Screen c={c} title="Roles" subtitle="Gate 3 — what a role may see and change" right={<IconButton icon="plus" size={24} onPress={() => openEditor(null)} />}>
      {roles.length === 0 ? (
        <EmptyBlock c={c} icon="shield-account-outline" title="No roles yet" body="Create one to start handing out access." />
      ) : (
        <View style={{ gap: 10 }}>
          {roles.map((role) => (
            <Row
              key={role._id}
              c={c}
              icon="shield-account-outline"
              title={role.name}
              subtitle={`${role.permissions.filter((p) => p.level !== 'NONE').length} of ${catalog.length} permissions${role.isSystem ? ' · Seeded' : ''}${!role.isActive ? ' · Inactive' : ''}`}
              onPress={() => openEditor(role)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  levelPill: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
});
