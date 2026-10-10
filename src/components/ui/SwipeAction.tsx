import React, { useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { MIN_TOUCH, radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { PressableScale, thresholdHaptic, useMotionOK } from '../../theme/motion';

/**
 * UX-P kit — a list row that swipes left to show its actions (ShopOrders
 * "Accept →"). Built on gesture-handler's Reanimated swipeable, so the drag,
 * the spring back and the action reveal all run on the UI thread.
 *
 *  - Every action is ALSO a real button once revealed (and the row's own tap
 *    still opens its detail), so nobody has to discover the gesture.
 *  - The actions come from the caller — this piece never decides what a row
 *    may do (orders pass `allowedVerbs`, nothing re-derived).
 *  - A light tick fires when the drag crosses the "open" point; reduce-motion
 *    keeps the gesture (it is input, not decoration) but drops the scale-in
 *    of the action buttons.
 *  - Labels wrap to two lines (Hindi); each action is ≥ 44 high and ≥ 84 wide.
 */
export interface SwipeActionItem {
  key: string;
  label: string;
  icon?: string;
  tone?: 'primary' | 'danger' | 'neutral';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

const ACTION_W = 88;

export function SwipeAction({
  actions,
  children,
  enabled = true,
  style,
  testID,
}: {
  actions: SwipeActionItem[];
  children: React.ReactNode;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const on = enabled && actions.length > 0;

  const renderRight = (progress: SharedValue<number>, _translation: SharedValue<number>) => (
    <ActionsPanel
      progress={progress}
      actions={actions}
      onRun={(a) => {
        ref.current?.close();
        a.onPress();
      }}
    />
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={on}
      friction={1.6}
      rightThreshold={ACTION_W * 0.6}
      overshootRight={false}
      renderRightActions={on ? renderRight : undefined}
      containerStyle={style}
      testID={testID}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function ActionsPanel({
  progress,
  actions,
  onRun,
}: {
  progress: SharedValue<number>;
  actions: SwipeActionItem[];
  onRun: (a: SwipeActionItem) => void;
}) {
  // One tick when the row passes its open point (both directions feel it).
  useAnimatedReaction(
    () => progress.value >= 1,
    (open, was) => {
      if (was !== null && open !== was && open) runOnJS(thresholdHaptic)();
    },
  );
  return (
    <View style={[styles.panel, { width: ACTION_W * actions.length + 8 * actions.length }]}>
      {actions.map((a, i) => (
        <ActionButton key={a.key} action={a} index={i} count={actions.length} progress={progress} onRun={onRun} />
      ))}
    </View>
  );
}

function ActionButton({
  action, index, count, progress, onRun,
}: {
  action: SwipeActionItem;
  index: number;
  count: number;
  progress: SharedValue<number>;
  onRun: (a: SwipeActionItem) => void;
}) {
  const { ds, c } = useAppTheme();
  const ok = useMotionOK();
  const fill = action.tone === 'danger' ? c.error : action.tone === 'neutral' ? ds.inkButton : ds.primaryFill;
  const ink = action.tone === 'neutral' ? ds.onInkButton : action.tone === 'danger' ? c.textInverse : ds.onPrimary;
  // The nearest button arrives last: each one slides in from the row edge.
  const reveal = useAnimatedStyle(() => {
    if (!ok) return { opacity: 1 };
    const p = Math.min(1, Math.max(0, progress.value));
    const local = interpolate(p, [index / (count + 1), 1], [0, 1], 'clamp');
    return { opacity: 0.4 + 0.6 * local, transform: [{ scale: 0.85 + 0.15 * local }] };
  });
  return (
    <Animated.View style={[styles.slot, reveal]}>
      <PressableScale
        haptic
        disabled={action.disabled}
        onPress={() => onRun(action)}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityState={{ disabled: !!action.disabled }}
        testID={action.testID}
        style={[styles.btn, { backgroundColor: fill, opacity: action.disabled ? 0.55 : 1 }]}
      >
        {action.icon ? <MaterialCommunityIcons name={action.icon as never} size={20} color={ink} /> : null}
        <Text style={[styles.label, { color: ink }]} numberOfLines={2}>{action.label}</Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-end', paddingLeft: 8 },
  slot: { width: ACTION_W, marginRight: 8, justifyContent: 'center' },
  btn: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  label: { fontSize: 12, fontWeight: '700', lineHeight: 15, textAlign: 'center' },
});
