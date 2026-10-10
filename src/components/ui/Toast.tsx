import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { motion, radius } from '../../theme/tokens';
import { useAppTheme } from '../../theme/useAppTheme';
import { easeOut, useMotionOK } from '../../theme/motion';

export type ToastTone = 'success' | 'info' | 'warn' | 'danger';

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** ms; default 3.2 s. */
  duration?: number;
}

interface ToastApi {
  show: (t: ToastInput) => void;
  hide: () => void;
}

const NOOP: ToastApi = { show: () => undefined, hide: () => undefined };
const ToastContext = createContext<ToastApi>(NOOP);

/** `useToast().show({ message, tone })`. Outside the provider it is a no-op. */
export const useToast = () => useContext(ToastContext);

const ICONS: Record<ToastTone, string> = {
  success: 'check-circle',
  info: 'information',
  warn: 'alert',
  danger: 'alert-circle',
};

/**
 * App-wide toast (DS v1 §4). One at a time, top of the screen under the safe
 * area (clear of the floating tab bar and any bottom action bar), slides in,
 * auto-hides, tappable to close. Announced to screen readers.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((input: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...input, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), input.duration ?? motion.toast.visibleMs);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onClose={hide} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onClose }: { toast: ToastInput; onClose: () => void }) {
  const { t } = useTranslation();
  const { status, ds, shadow } = useAppTheme();
  const insets = useSafeAreaInsets();
  const ok = useMotionOK();
  const p = useSharedValue(ok ? 0 : 1);
  const tone = toast.tone ?? 'info';
  const pair = status[tone === 'warn' ? 'warn' : tone];

  useEffect(() => {
    if (ok) p.value = withTiming(1, { duration: motion.toast.duration, easing: easeOut });
  }, [ok, p]);

  const enter = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * -24 }] }));

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 10 }]}>
      <Animated.View style={[styles.toast, { backgroundColor: ds.surface, borderColor: pair.bg }, shadow('glass'), enter]}>
        <View style={[styles.icon, { backgroundColor: pair.bg }]}>
          <MaterialCommunityIcons name={ICONS[tone] as never} size={18} color={pair.fg} />
        </View>
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.text, { color: ds.ink }]}>
          {toast.message}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('kit.dismiss')}
          hitSlop={8}
          style={styles.close}
        >
          <MaterialCommunityIcons name="close" size={18} color={ds.faint} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000, elevation: 1000 },
  toast: {
    width: '100%',
    maxWidth: 480,
    minHeight: 52,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 8,
  },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
