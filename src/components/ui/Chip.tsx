import React from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MIN_TOUCH, radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';

/**
 * A filter / choice chip (ShopBilling template): 40 high with a 44 hit area,
 * white at rest, dark ink when selected (`selectedStyle="soft"` gives the DS
 * primary-soft look instead). `leading` takes a small round art badge.
 * The label wraps rather than clipping.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  leading,
  selectedStyle = 'ink',
  testID,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  leading?: React.ReactNode;
  selectedStyle?: 'ink' | 'soft';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds, isDark, status } = useAppTheme();
  const bg = selected ? (selectedStyle === 'ink' ? ds.inkButton : ds.primarySoft) : ds.surface;
  const fg = selected
    ? selectedStyle === 'ink'
      ? ds.onInkButton
      : isDark ? status.brand.fg : ds.primaryDeep
    : ds.ink;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={(MIN_TOUCH - 40) / 2}
      testID={testID}
      style={[
        styles.chip,
        { backgroundColor: bg, borderColor: selected ? 'transparent' : ds.line },
        leading ? styles.withLeading : null,
        style,
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      {icon ? <MaterialCommunityIcons name={icon as never} size={16} color={fg} /> : null}
      <Text style={[styles.label, { color: fg, fontWeight: selected ? '700' : '600' }]}>{label}</Text>
    </PressableScale>
  );
}

/** A horizontally scrolling chip strip that bleeds to the screen edge. */
export function ChipStrip({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.strip, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  withLeading: { paddingLeft: 7, paddingRight: 14 },
  leading: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, lineHeight: 17 },
  strip: { flexDirection: 'row', gap: 8, paddingRight: 18 },
});
