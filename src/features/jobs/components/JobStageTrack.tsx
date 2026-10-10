import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '../../../theme/useAppTheme';
import { useDrawProgress } from '../../../theme/motion';
import type { JobStage } from '../types';

const STEPS: readonly JobStage[] = ['QUOTED', 'APPROVED', 'IN_WORK', 'COMPLETED', 'INVOICED'];

/** 1-based current step; 6 = every step done (closed after the bill). */
export function jobStep(stage: JobStage): number {
  switch (stage) {
    case 'APPROVED': return 2;
    case 'IN_WORK': return 3;
    case 'COMPLETED': return 4;
    case 'INVOICED': return 5;
    case 'CLOSED': return 6;
    default: return 1; // QUOTE_PENDING, QUOTED, DECLINED — the quote step
  }
}

function Line({ on, delay }: { on: boolean; delay: number }) {
  const { ds } = useAppTheme();
  const p = useDrawProgress({ delay, key: on });
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: on ? p.value : 0 }] }));
  return (
    <View style={[styles.line, { backgroundColor: ds.line }]}>
      <Animated.View style={[styles.lineFill, { backgroundColor: ds.primary }, fill]} />
    </View>
  );
}

/**
 * M22 — where a job is on its way (quote → approved → work → done → billed),
 * the same five steps as the website's job page. The joining lines draw in
 * (scaleX on the UI thread) when the job moves on; reduce-motion shows them
 * at once. A job closed without a bill was called off, so no track is drawn.
 */
export function JobStageTrack({ stage, billed }: { stage: JobStage; billed: boolean }) {
  const { t } = useTranslation();
  const { ds } = useAppTheme();
  if (stage === 'CLOSED' && !billed) return null;
  const current = jobStep(stage);
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={t(`p2.jobs.stage.${stage}`)}
      accessibilityValue={{ min: 1, max: STEPS.length, now: Math.min(current, STEPS.length) }}
      testID="job-stage-track"
    >
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const on = n === current;
        return (
          <React.Fragment key={s}>
            {i > 0 ? <Line on={n <= current} delay={i * 120} /> : null}
            <View style={styles.step}>
              <View
                style={[
                  styles.dot,
                  on && { backgroundColor: ds.primaryFill, borderColor: ds.primaryFill },
                  done && { backgroundColor: ds.primarySoft, borderColor: ds.primary },
                  !on && !done && { backgroundColor: ds.surface, borderColor: ds.line },
                ]}
              >
                {done
                  ? <MaterialCommunityIcons name="check" size={14} color={ds.primary} />
                  : <Text style={{ fontSize: 11, fontWeight: '700', color: on ? ds.onPrimary : ds.muted }}>{n}</Text>}
              </View>
              <Text style={[styles.label, { color: on ? ds.ink : ds.muted }]} numberOfLines={2}>{t(`p2.jobs.stage.${s}`)}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
  step: { alignItems: 'center', width: 56, gap: 4 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10.5, fontWeight: '600', textAlign: 'center' },
  line: { flex: 1, height: 3, borderRadius: 2, marginTop: 11.5, overflow: 'hidden', minWidth: 6 },
  lineFill: { ...StyleSheet.absoluteFillObject, transformOrigin: 'left' },
});
