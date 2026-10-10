import React from 'react';
import { StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MIN_TOUCH, radius, tileDepth, typeScale, type TintName } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';
import { useHindiTitleFace } from '../../theme/hindiFace';

/**
 * Grouped list (DS v1 §4 ListRow, settings shape): an optional section title
 * above ONE card that holds several rows split by hairlines — the iOS
 * settings look. The card has a hairline `line` edge in both modes (the light
 * page is pure white, Owner 2026-10-06) plus the soft shadow.
 *
 *   <ListGroup title="Business">
 *     <GroupRow icon="office-building-outline" title="…" detail="…" onPress={…} />
 *     <ToggleRow title="…" value={on} onValueChange={…} />
 *   </ListGroup>
 */
export function ListGroup({
  title,
  footer,
  children,
  testID,
  style,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { ds, shadow } = useAppTheme();
  const hi = useHindiTitleFace(typeScale.section.fontSize);
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]} testID={testID}>
      {title ? (
        <Text accessibilityRole="header" style={[typeScale.section, hi, styles.title, { color: ds.ink }]}>
          {title}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: ds.surface, borderColor: ds.line }, shadow('card')]}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={[styles.sep, { backgroundColor: ds.line }]} /> : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text style={[typeScale.detail, styles.footer, { color: ds.muted }]}>{footer}</Text> : null}
    </View>
  );
}

function IconTile({ icon, tint, danger }: { icon: string; tint: TintName; danger?: boolean }) {
  const { tints, isDark } = useAppTheme();
  const tn = tints[danger ? 'sos' : tint];
  return (
    <View style={[styles.iconTile, tileDepth(tn, isDark, 'soft')]}>
      <LinearGradient colors={[tn.from, tn.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.iconFill]} />
      <MaterialCommunityIcons name={icon as never} size={20} color={tn.icon} />
    </View>
  );
}

/**
 * One row of a `ListGroup`: tinted icon tile, title + detail (both wrap — Hindi
 * is never clipped), and on the right a value, any `trailing` node, or a
 * chevron when the row opens something. Pressable rows scale (0.97).
 */
export function GroupRow({
  title,
  detail,
  icon,
  tint = 'green',
  value,
  trailing,
  onPress,
  danger = false,
  chevron,
  accessibilityLabel,
  accessibilityHint,
  testID,
  disabled,
}: {
  title: string;
  detail?: string;
  icon?: string;
  tint?: TintName;
  value?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  chevron?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  disabled?: boolean;
}) {
  const { ds, status } = useAppTheme();
  const showChevron = chevron ?? (!!onPress && !trailing && !value);
  const body = (
    <>
      {icon ? <IconTile icon={icon} tint={tint} danger={danger} /> : null}
      <View style={styles.text}>
        <Text style={[typeScale.row, { color: danger ? status.danger.fg : ds.ink }]}>{title}</Text>
        {detail ? <Text style={[typeScale.detail, { color: ds.muted }]}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[typeScale.detail, styles.value, { color: ds.muted }]}>{value}</Text> : null}
      {trailing}
      {showChevron ? (
        <MaterialCommunityIcons name="chevron-right" size={22} color={danger ? status.danger.fg : ds.iconMuted} />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} testID={testID} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, detail].filter(Boolean).join('. ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={[styles.row, disabled ? styles.off : null]}
    >
      {body}
    </PressableScale>
  );
}

/**
 * A row whose right side is a switch (permissions, notification settings).
 * Brand-green track when on; the label stays the accessible name.
 */
export function ToggleRow({
  title,
  detail,
  icon,
  tint = 'green',
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  testID,
}: {
  title: string;
  detail?: string;
  icon?: string;
  tint?: TintName;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { ds } = useAppTheme();
  return (
    <View style={[styles.row, disabled ? styles.offSoft : null]}>
      {icon ? <IconTile icon={icon} tint={tint} /> : null}
      <View style={styles.text}>
        <Text style={[typeScale.row, { color: ds.ink }]}>{title}</Text>
        {detail ? <Text style={[typeScale.detail, { color: ds.muted }]}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? title}
        testID={testID}
        trackColor={{ false: ds.track, true: ds.primary }}
        thumbColor={ds.surface}
        ios_backgroundColor={ds.track}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  title: { paddingHorizontal: 4 },
  card: { borderRadius: radius.card, borderWidth: 1 },
  sep: { height: StyleSheet.hairlineWidth * 2, marginLeft: 68 },
  row: {
    minHeight: MIN_TOUCH + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconTile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconFill: { borderRadius: 14 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  value: { flexShrink: 0, maxWidth: '40%', textAlign: 'right' },
  footer: { paddingHorizontal: 4 },
  off: { opacity: 0.5 },
  offSoft: { opacity: 0.75 },
});
