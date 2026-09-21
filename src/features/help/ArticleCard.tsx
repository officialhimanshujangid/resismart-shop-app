import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Href, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../constants/colors';
import { HelpArticle } from '../../api/help.api';

/**
 * One help article: the question as a big tappable row, opening in place to
 * the answer, the numbered steps and "Take me there".
 *
 * In place rather than a separate screen because the API has no "one article"
 * endpoint — every list already carries the full article — and because a
 * partner who opens the wrong question can close it without losing their place
 * in the list.
 */
export function ArticleCard({
  c,
  article,
  moduleTitle,
  initiallyOpen = false,
}: {
  c: ColorScheme;
  article: HelpArticle;
  /** Shown above the question in search results, where articles from many modules mix. */
  moduleTitle?: string;
  initiallyOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);
  const steps = Array.isArray(article.steps) ? article.steps.filter((s) => typeof s === 'string' && s.trim()) : [];
  // The link is server content, not a literal this file can check against the
  // generated route union — so it is only offered when it at least looks like
  // an in-app path, and asserted to `Href` at the one place it is used.
  const link = typeof article.link === 'string' && article.link.startsWith('/') ? article.link : null;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: open ? c.primary : c.divider }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.head}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          {moduleTitle ? (
            <Text style={[styles.module, { color: c.primary }]} numberOfLines={1}>{moduleTitle}</Text>
          ) : null}
          <Text style={[styles.question, { color: c.textPrimary }]}>{article.question}</Text>
        </View>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={26} color={c.textSecondary} />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {article.answer ? (
            <Text style={[styles.answer, { color: c.textPrimary }]}>{article.answer}</Text>
          ) : null}

          {steps.length > 0 ? (
            <View style={styles.steps}>
              <Text style={[styles.stepsLabel, { color: c.textSecondary }]}>{t('help.stepsLabel')}</Text>
              {steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepNum, { backgroundColor: c.primary }]}>
                    <Text style={[styles.stepNumText, { color: c.textInverse }]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: c.textPrimary }]}>{step}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {link ? (
            <Button
              mode="contained"
              icon="arrow-right"
              contentStyle={styles.goContent}
              labelStyle={styles.goLabel}
              onPress={() => router.push(link as Href)}
            >
              {t('help.takeMeThere')}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 16, paddingVertical: 14 },
  module: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  question: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  answer: { fontSize: 15, lineHeight: 22 },
  steps: { gap: 10 },
  stepsLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22, paddingTop: 3 },
  goContent: { height: 52 },
  goLabel: { fontSize: 16 },
});
