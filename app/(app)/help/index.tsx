import React, { useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { helpApi } from '../../../src/api/help.api';
import { useLanguage } from '../../../src/i18n/useLanguage';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { ArticleCard } from '../../../src/features/help/ArticleCard';
import { WhatsAppSupport } from '../../../src/features/help/WhatsAppSupport';
import { Card, EmptyBlock, ErrorBlock, Loading, Row, Screen, SectionLabel } from '../../../src/features/more/ui';

/** Below this the server has nothing useful to rank, and an empty `q` is a 400. */
const MIN_QUERY = 2;

/**
 * Help — PLAN-02 §4, shop app.
 *
 * Opened two ways:
 *   - the "?" in the shared screen header, which passes `from` = the pathname
 *     it was tapped on, so "Help for this screen" leads;
 *   - the Help row on More, with no `from` — there is no "this screen" to
 *     explain, so that section is not drawn.
 *
 * While the partner is typing, search results replace everything else; clearing
 * the box brings the screen back. Every list has its own loading, empty and
 * error state, and the whole screen must read well with NO content at all —
 * the shop app has none yet.
 */
export default function HelpScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { language } = useLanguage();
  const params = useLocalSearchParams<{ from?: string }>();
  const from = typeof params.from === 'string' && params.from.startsWith('/') && !params.from.startsWith('/help')
    ? params.from
    : null;

  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 350);
  const searching = q.length >= MIN_QUERY;

  const search = useQuery({
    queryKey: qk.helpSearch(q, language),
    queryFn: () => helpApi.search(q, language),
    enabled: searching,
  });

  const route = useQuery({
    queryKey: qk.helpRoute(from ?? '', language),
    queryFn: () => helpApi.forRoute(from as string, language),
    enabled: Boolean(from) && !searching,
  });

  const modules = useQuery({
    queryKey: qk.helpModules(language),
    queryFn: () => helpApi.modules(language),
    enabled: !searching,
  });

  return (
    <Screen c={c} title={t('help.title')} help={false}>
      <Searchbar
        placeholder={t('help.searchPlaceholder')}
        value={text}
        onChangeText={setText}
        style={[styles.search, { backgroundColor: c.surface }]}
        inputStyle={styles.searchInput}
        autoCorrect={false}
      />

      {searching ? (
        <>
          <SectionLabel c={c}>{t('help.resultsSection')}</SectionLabel>
          {search.isPending ? (
            <Loading c={c} label={t('help.searching')} />
          ) : search.isError ? (
            <ErrorBlock c={c} message={apiErrorMessage(search.error, t('help.couldNotLoad'))} onRetry={() => void search.refetch()} />
          ) : search.data.length === 0 ? (
            <EmptyBlock c={c} icon="magnify-close" title={t('help.noResultsTitle', { q })} body={t('help.noResultsBody')} />
          ) : (
            search.data.map((hit) => (
              <ArticleCard key={hit.article.id} c={c} article={hit.article} moduleTitle={hit.moduleTitle} />
            ))
          )}
        </>
      ) : (
        <>
          {from ? (
            <>
              <SectionLabel c={c}>{t('help.thisScreenSection')}</SectionLabel>
              {route.isPending ? (
                <Loading c={c} />
              ) : route.isError ? (
                <ErrorBlock c={c} message={apiErrorMessage(route.error, t('help.couldNotLoad'))} onRetry={() => void route.refetch()} />
              ) : route.data.articles.length === 0 ? (
                <Card c={c}>
                  <EmptyBlock c={c} icon="lightbulb-question-outline" title={t('help.noScreenHelpTitle')} body={t('help.noScreenHelpBody')} />
                </Card>
              ) : (
                route.data.articles.map((a, i) => (
                  <ArticleCard key={a.id} c={c} article={a} initiallyOpen={i === 0 && route.data.articles.length === 1} />
                ))
              )}
            </>
          ) : null}

          <SectionLabel c={c}>{t('help.topicsSection')}</SectionLabel>
          {modules.isPending ? (
            <Loading c={c} />
          ) : modules.isError ? (
            <ErrorBlock c={c} message={apiErrorMessage(modules.error, t('help.couldNotLoad'))} onRetry={() => void modules.refetch()} />
          ) : modules.data.length === 0 ? (
            <Card c={c}>
              <EmptyBlock c={c} icon="book-open-page-variant-outline" title={t('help.noTopicsTitle')} body={t('help.noTopicsBody')} />
            </Card>
          ) : (
            <Card c={c} style={styles.listCard}>
              {modules.data.map((m, i) => (
                <View key={m.module}>
                  <Row
                    c={c}
                    icon="book-open-variant"
                    title={m.title}
                    subtitle={m.summary}
                    onPress={() => router.push(`/help/${encodeURIComponent(m.module)}`)}
                  />
                  {i < modules.data.length - 1 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
                </View>
              ))}
            </Card>
          )}

          <Text style={[styles.footnote, { color: c.textSecondary }]}>{t('help.footnote')}</Text>
        </>
      )}

      <WhatsAppSupport c={c} topic={searching ? q : route.data?.title} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: 14 },
  searchInput: { fontSize: 16 },
  listCard: { padding: 0, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  footnote: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
});
