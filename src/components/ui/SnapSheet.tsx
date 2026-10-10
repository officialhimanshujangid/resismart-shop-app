import React from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MIN_TOUCH, radius, typeScale } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { useMotionOK } from '../../theme/motion';

/**
 * UX-P kit — a bottom sheet with snap points (the counter's cart, quick forms).
 *
 *  - Opens with a spring from the bottom; the scrim fades in behind it.
 *  - Drag the handle / header: it settles on the nearest snap point
 *    (`snapPoints`, fractions of the window height, smallest first), and a
 *    drag well below the lowest one closes it. The content scrolls normally —
 *    only the handle area drags, so a list inside never fights the gesture.
 *  - Tap the scrim, the close button or the back button to close.
 *  - Keyboard-safe (KeyboardAvoidingView), bottom safe-area padded.
 *  - Reduce-motion: a short fade/slide with no bounce.
 *
 * Its own GestureHandlerRootView, because a native Modal is a separate root on
 * Android and gestures inside it are otherwise dead.
 */
export function SnapSheet({
  visible,
  onDismiss,
  title,
  subtitle,
  snapPoints = [0.55, 0.9],
  children,
  footer,
  testID,
  contentStyle,
}: {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  subtitle?: string;
  /** Fractions of the window height, ascending. Opens on the first. */
  snapPoints?: number[];
  children: React.ReactNode;
  /** Pinned under the content (e.g. the sheet's one primary action). */
  footer?: React.ReactNode;
  testID?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { ds, shadow } = useAppTheme();
  const ok = useMotionOK();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const points = React.useMemo(
    () => (snapPoints.length ? snapPoints : [0.55]).map((p) => Math.round(winH * Math.min(0.95, Math.max(0.2, p)))),
    [snapPoints, winH],
  );
  const maxH = points[points.length - 1];
  // translateY measured from the fully-open (largest) position: 0 = top snap.
  const offsetOf = (h: number) => maxH - h;
  const closedY = maxH + 40;

  const y = useSharedValue(closedY);
  const scrim = useSharedValue(0);
  const start = useSharedValue(0);
  const [mounted, setMounted] = React.useState(visible);
  /**
   * Which snap the sheet rests on. The sheet is always `maxH` tall (only its
   * transform moves while dragging); once it settles, the body is padded by
   * the part that sits below the screen edge, so a list inside scrolls to its
   * last row and the footer stays on screen at every snap point.
   */
  const [snapIdx, setSnapIdx] = React.useState(0);

  const settle = React.useCallback((to: number) => {
    'worklet';
    y.value = ok ? withSpring(to, { damping: 22, stiffness: 240, mass: 0.9 }) : withTiming(to, { duration: 160 });
  }, [ok, y]);

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      setSnapIdx(0);
      y.value = closedY;
      settle(offsetOf(points[0]));
      scrim.value = withTiming(1, { duration: ok ? 220 : 120 });
    } else if (mounted) {
      scrim.value = withTiming(0, { duration: ok ? 180 : 100 });
      y.value = withTiming(closedY, { duration: ok ? 200 : 100 }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const offsets = points.map(offsetOf);
  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = y.value;
    })
    .onUpdate((e) => {
      // Rubber band above the top snap.
      const next = start.value + e.translationY;
      y.value = next < 0 ? next * 0.25 : next;
    })
    .onEnd((e) => {
      const lowest = offsets[0];
      const projected = y.value + e.velocityY * 0.12;
      if (projected > lowest + 90) {
        runOnJS(onDismiss)();
        return;
      }
      let best = 0;
      for (let i = 1; i < offsets.length; i += 1) {
        if (Math.abs(offsets[i] - projected) < Math.abs(offsets[best] - projected)) best = i;
      }
      settle(offsets[best]);
      runOnJS(setSnapIdx)(best);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  if (!mounted && !visible) return null;

  return (
    <Modal visible={mounted || visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: ds.scrim }, scrimStyle]}>
          <Pressable style={styles.flex} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t('kit.dismiss')} />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.anchor}
          pointerEvents="box-none"
        >
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { height: maxH + Math.max(insets.bottom, 12), backgroundColor: ds.surface, paddingBottom: Math.max(insets.bottom, 12) },
              shadow('cart'),
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.head}>
                <View style={[styles.handle, { backgroundColor: ds.line }]} />
                {title ? (
                  <View style={styles.titleRow}>
                    <View style={styles.titleText}>
                      <Text style={[typeScale.section, { color: ds.ink }]} accessibilityRole="header">{title}</Text>
                      {subtitle ? <Text style={[typeScale.detail, { color: ds.muted }]}>{subtitle}</Text> : null}
                    </View>
                    <Pressable
                      onPress={onDismiss}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('kit.dismiss')}
                      style={[styles.close, { backgroundColor: ds.surfaceAlt }]}
                    >
                      <MaterialCommunityIcons name="close" size={20} color={ds.ink} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </GestureDetector>
            <View style={[styles.flex, { paddingBottom: maxH - points[Math.min(snapIdx, points.length - 1)] }]}>
              <View style={[styles.body, contentStyle]}>{children}</View>
              {footer ? <View style={[styles.footer, { borderTopColor: ds.line }]}>{footer}</View> : null}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.cardLg, borderTopRightRadius: radius.cardLg, overflow: 'hidden' },
  head: { paddingTop: 8, paddingHorizontal: 18, paddingBottom: 6, gap: 8 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleText: { flex: 1, minWidth: 0, gap: 2 },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 18 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 12 },
});
