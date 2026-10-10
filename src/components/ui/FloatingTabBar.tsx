import React from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import type { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { palette } from '../../constants/colors';
import { radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale } from '../../theme/motion';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Height of the bar itself (template: 66). */
export const TAB_BAR_HEIGHT = 66;

/**
 * DS v1 floating tab bar (ShopHome template): a white glass pill floating
 * above the bottom inset; the active tab is a solid green pill with its icon
 * and label, the others are 46 px round icon buttons. The billing tab rests on
 * a soft-green circle, like the template's "New bill" button.
 *
 * It is a drop-in `tabBar` for expo-router's `<Tabs>`: it renders exactly the
 * routes the navigator holds, so `Tabs.Protected` still decides which tabs
 * exist, and it emits the same `tabPress` / `tabLongPress` events as the
 * default bar. Badges come from each screen's `tabBarBadge` option.
 *
 * Layout: the bar is a normal block under the screens (not an overlay), on the
 * page-ground colour, so no screen's last row can hide behind it.
 */
export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { t } = useTranslation();
  const { ds, shadow, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const blur = Platform.OS === 'ios' || Platform.OS === 'web';

  return (
    <View style={[styles.host, { backgroundColor: ds.ground, paddingBottom: Math.max(insets.bottom, 8) + 10 }]}>
      <View style={[styles.bar, shadow('tabBar')]} accessibilityRole="tablist">
        <View style={[StyleSheet.absoluteFill, styles.clip, { borderColor: ds.glassBorder }]} pointerEvents="none">
          {blur ? <BlurView intensity={30} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? ds.glass : 'rgba(255,255,255,0.95)' }]} />
        </View>

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const badge = options.tabBarBadge;
          const hasBadge = badge !== undefined && badge !== null && badge !== '';
          const a11y = hasBadge ? t('kit.tabWithCount', { label, badge: String(badge) }) : label;
          const accent = route.name === 'billing' && !focused;
          const iconColor = focused ? ds.onPrimary : accent ? ds.primary : ds.iconMuted;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

          const icon = options.tabBarIcon?.({ focused, color: iconColor, size: focused ? 19 : 22 });

          return (
            <PressableScale
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={a11y}
              testID={`tab-${route.name}`}
              style={[
                focused ? styles.active : styles.idle,
                focused ? { backgroundColor: ds.primaryFill } : accent ? { backgroundColor: ds.primarySoft } : null,
              ]}
            >
              {focused ? (
                <>
                  {narrow ? null : icon}
                  <Text style={[styles.activeText, { color: ds.onPrimary }]} numberOfLines={2}>
                    {label}
                  </Text>
                </>
              ) : (
                icon
              )}
              {hasBadge ? (
                <View style={[styles.badge, { borderColor: isDark ? ds.surface : '#FFFFFF' }]} pointerEvents="none">
                  <Text style={styles.badgeText}>{String(badge)}</Text>
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { paddingHorizontal: 18, paddingTop: 8 },
  bar: {
    minHeight: TAB_BAR_HEIGHT,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  clip: { borderRadius: radius.pill, overflow: 'hidden', borderWidth: 1 },
  active: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    maxWidth: 190,
  },
  activeText: { fontSize: 13, fontWeight: '600', lineHeight: 16, textAlign: 'center', flexShrink: 1 },
  idle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    backgroundColor: palette.coral[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', lineHeight: 12 },
});
