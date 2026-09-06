import React, { useState } from 'react';
import { Alert, View, StyleSheet, Pressable, ScrollView, useColorScheme } from 'react-native';
import { Text, Portal, Dialog, TextInput, Button, IconButton } from 'react-native-paper';

import { ProductCategory } from '../types';
import { useCreateCategory, useHideCategory, useUpdateCategory } from '../hooks';
import { themeColors, radii } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';

interface CategoryPickerProps {
  categories: ProductCategory[];
  value: string | undefined;
  onChange: (categoryId: string | undefined) => void;
  canManage: boolean;
}

/**
 * The product form's category field: a chip row, an inline "+ New", and a
 * "Manage" sheet.
 *
 * The Manage half is new. This component used to say in its own header that
 * "full folder management (rename, hide, reorder) is out of this build's
 * scope", and the consequence was that a typo'd aisle name was PERMANENT: the
 * only category endpoints being called were list and create, so "Diary" sat
 * above the milk forever and the only workaround was a second category with the
 * right spelling beside it. `PUT` and `DELETE /partners/me/product-categories/:id`
 * both existed the whole time.
 *
 * ── What is and is not offered ────────────────────────────────────────────
 *
 *   RENAME   yes. One field, and the only failure worth naming is the collated
 *            unique index (a rename to "dairy" collides with "Dairy"); the
 *            server's own 409 sentence says that, so it is shown verbatim.
 *   HIDE     yes, and it is SOFT server-side — products in a hidden category
 *            stay on sale, and the server's message says how many there are.
 *   RESTORE  yes, the same `PUT` with `isActive: true`. This is what stops hide
 *            being a one-way door, and it is why the sheet lists hidden
 *            categories rather than filtering them out: `listCategories` returns
 *            them (sorted active-first) and only the CHIP ROW filters.
 *   REORDER  no. `sortOrder` is on the API here and is not wired to a control —
 *            drag-to-reorder inside a modal on a form is a bigger job than the
 *            rest of this put together, and a category list nobody can rename is
 *            a worse problem than one in the wrong order. See the report.
 */
export function CategoryPicker({ categories, value, onChange, canManage }: CategoryPickerProps) {
  const c = themeColors(useColorScheme() === 'dark');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The category being renamed, and the text so far. `null` when nothing is. */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const hideCategory = useHideCategory();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    createCategory.mutate(trimmed, {
      onSuccess: (row) => {
        onChange(row._id);
        setDialogOpen(false);
        setName('');
      },
      onError: (e: unknown) => setError(apiErrorMessage(e)),
    });
  };

  const saveRename = () => {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) return;
    setError(null);
    updateCategory.mutate(
      { id: editing.id, name: trimmed },
      {
        onSuccess: () => setEditing(null),
        // Shown in the sheet rather than as an Alert: the partner is looking at
        // the list of names, which is the context the 409 ("You already have a
        // category with that name") is about.
        onError: (e: unknown) => setError(apiErrorMessage(e)),
      },
    );
  };

  const confirmHide = (cat: ProductCategory) => {
    Alert.alert(
      `Hide "${cat.name}"?`,
      'It stops appearing as a choice. Products already in it stay on sale, and you can show it again from this same list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide it',
          style: 'destructive',
          onPress: () =>
            hideCategory.mutate(cat._id, {
              onSuccess: (res) => {
                // The server counts the products in it and says so. That number
                // is the thing the partner is about to wonder, so its own
                // sentence is shown rather than a generic one of ours.
                if (res.message) Alert.alert('Category hidden', res.message);
                // A hidden category must not stay selected on the form behind
                // this sheet — it would be saved onto the product.
                if (value === cat._id) onChange(undefined);
              },
              onError: (e: unknown) => Alert.alert('Could not hide that', apiErrorMessage(e)),
            }),
        },
      ],
    );
  };

  const restore = (cat: ProductCategory) => {
    updateCategory.mutate(
      { id: cat._id, isActive: true },
      { onError: (e: unknown) => Alert.alert('Could not restore that', apiErrorMessage(e)) },
    );
  };

  const busy = updateCategory.isPending || hideCategory.isPending;

  return (
    <View>
      <View style={styles.row}>
        <Chip label="None" active={!value} onPress={() => onChange(undefined)} c={c} />
        {categories.filter((cat) => cat.isActive).map((cat) => (
          <Chip key={cat._id} label={cat.name} active={value === cat._id} onPress={() => onChange(cat._id)} c={c} />
        ))}
        {canManage && (
          <Pressable
            onPress={() => setDialogOpen(true)}
            style={[styles.chip, styles.newChip, { borderColor: c.primary }]}
          >
            <Text style={{ color: c.primary, fontSize: 12.5, fontWeight: '600' }}>+ New</Text>
          </Pressable>
        )}
        {canManage && categories.length > 0 && (
          <Pressable
            onPress={() => { setError(null); setEditing(null); setManageOpen(true); }}
            style={[styles.chip, styles.newChip, { borderColor: c.divider }]}
          >
            <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>Manage</Text>
          </Pressable>
        )}
      </View>

      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)} style={{ backgroundColor: c.surface }}>
          <Dialog.Title>New category</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Name"
              value={name}
              onChangeText={setName}
              autoFocus
              outlineStyle={{ borderRadius: radii.field }}
            />
            {error && <Text style={{ color: c.error, fontSize: 12, marginTop: 6 }}>{error}</Text>}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogOpen(false)} disabled={createCategory.isPending}>Cancel</Button>
            <Button onPress={submit} disabled={!name.trim() || createCategory.isPending} loading={createCategory.isPending}>
              Add
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={manageOpen}
          onDismiss={() => { if (!busy) { setManageOpen(false); setEditing(null); } }}
          style={{ backgroundColor: c.surface }}
        >
          <Dialog.Title>Categories</Dialog.Title>
          <Dialog.Content>
            {error && <Text style={{ color: c.error, fontSize: 12, marginBottom: 8 }}>{error}</Text>}
            <ScrollView style={styles.manageList}>
              {categories.map((cat) => {
                const isEditing = editing?.id === cat._id;
                return (
                  <View key={cat._id} style={[styles.manageRow, { borderBottomColor: c.divider }]}>
                    {isEditing ? (
                      <>
                        <TextInput
                          mode="outlined"
                          dense
                          value={editing.name}
                          onChangeText={(t) => setEditing({ id: cat._id, name: t })}
                          autoFocus
                          style={{ flex: 1 }}
                          outlineStyle={{ borderRadius: radii.field }}
                        />
                        <IconButton
                          icon="check"
                          size={20}
                          disabled={!editing.name.trim() || busy}
                          onPress={saveRename}
                          accessibilityLabel="Save this name"
                        />
                        <IconButton icon="close" size={20} onPress={() => { setEditing(null); setError(null); }} accessibilityLabel="Cancel" />
                      </>
                    ) : (
                      <>
                        <Text
                          style={{ flex: 1, color: cat.isActive ? c.textPrimary : c.textDisabled, fontSize: 14 }}
                          numberOfLines={1}
                        >
                          {cat.name}
                          {!cat.isActive ? '  · hidden' : ''}
                        </Text>
                        {cat.isActive ? (
                          <>
                            <IconButton
                              icon="pencil-outline"
                              size={18}
                              disabled={busy}
                              onPress={() => { setError(null); setEditing({ id: cat._id, name: cat.name }); }}
                              accessibilityLabel={`Rename ${cat.name}`}
                            />
                            <IconButton
                              icon="eye-off-outline"
                              size={18}
                              disabled={busy}
                              onPress={() => confirmHide(cat)}
                              accessibilityLabel={`Hide ${cat.name}`}
                            />
                          </>
                        ) : (
                          <Button compact disabled={busy} onPress={() => restore(cat)}>Show</Button>
                        )}
                      </>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => { setManageOpen(false); setEditing(null); }} disabled={busy}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function Chip({ label, active, onPress, c }: { label: string; active: boolean; onPress: () => void; c: ReturnType<typeof themeColors> }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? c.primary : c.surfaceVariant, borderColor: active ? c.primary : c.divider },
      ]}
    >
      <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  newChip: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  manageList: { maxHeight: 300 },
  manageRow: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2,
  },
});
