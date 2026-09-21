import React from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { helpApi } from '../../../src/api/help.api';
import { useLanguage } from '../../../src/i18n/useLanguage';
import { ArticleCard } from '../../../src/features/help/ArticleCard';
import { WhatsAppSupport } from '../../../src/features/help/WhatsAppSupport';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';

/**
 * One help topic and all its articles (`GET /help/modules/:module`). An unknown
 * topic is a 404 from the server and shows as the error state with its message.
 */
export default function HelpModuleScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { language } = useLanguage();
  const { module } = useLocalSearchParams<{ module: string }>();
  const key = typeof module === 'string' ? module : '';

  const query = useQuery({
    queryKey: qk.helpModule(key, language),
    queryFn: () => helpApi.module(key, language),
    enabled: Boolean(key),
  });

  if (!key || query.isPending) {
    return <Screen c={c} title={t('help.title')} help={false}><Loading c={c} /></Screen>;
  }
  if (query.isError) {
    return (
      <Screen c={c} title={t('help.title')} help={false}>
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('help.couldNotLoad'))} onRetry={() => void query.refetch()} />
        <WhatsAppSupport c={c} />
      </Screen>
    );
  }

  const { title, summary, articles } = query.data;
  return (
    <Screen c={c} title={title || t('help.title')} help={false}>
      {summary ? <Text style={[styles.summary, { color: c.textSecondary }]}>{summary}</Text> : null}
      {articles.length === 0 ? (
        <EmptyBlock c={c} icon="book-open-page-variant-outline" title={t('help.noArticlesTitle')} body={t('help.noTopicsBody')} />
      ) : (
        articles.map((a, i) => (
          <ArticleCard key={a.id} c={c} article={a} initiallyOpen={i === 0 && articles.length === 1} />
        ))
      )}
      <WhatsAppSupport c={c} topic={title} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { fontSize: 15, lineHeight: 22 },
});
