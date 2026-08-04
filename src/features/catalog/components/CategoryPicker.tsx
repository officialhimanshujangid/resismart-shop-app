import React, { useState } from 'react';
import { View, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { Text, Portal, Dialog, TextInput, Button } from 'react-native-paper';

import { ProductCategory } from '../types';
import { useCreateCategory } from '../hooks';
import { themeColors, radii } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';

interface CategoryPickerProps {
  categories: ProductCategory[];
  value: string | undefined;
  onChange: (categoryId: string | undefined) => void;
  canManage: boolean;
}

/**
 * A chip row for the product form's category field, with an inline "+ New"
 * that creates a category without leaving the form — full folder management
 * (rename, hide, reorder) is out of this build's scope; see the report.
 */
export function CategoryPicker({ categories, value, onChange, canManage }: CategoryPickerProps) {
  const c = themeColors(useColorScheme() === 'dark');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createCategory = useCreateCategory();

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
            <Text style={{ color: c.primary, fontSize: 12.5, fontWeight: '700' }}>+ New</Text>
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
      <Text style={{ color: active ? '#fff' : c.textSecondary, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  newChip: { backgroundColor: 'transparent', borderStyle: 'dashed' },
});
