import React from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { aiApi } from '../../api/ai.api';
import { useAuth } from '../../context/AuthContext';
import { IconButton as KitIconButton } from '../../components/ui';

/**
 * N14 — "Ask AI" on the Today hero, beside (before) the Help "?". The same
 * glass kit IconButton (44 dp, press scale) as `HelpButton variant="glass"`.
 *
 * Drawn ONLY when the server says THIS business's support chat is on
 * (`/ai/status` fails closed = no button). Keyed by the open business, so a
 * switch never shows another business's answer. Opens the same chat as
 * Help › Ask AI (`/help/ask`), where consent + 18+ are asked.
 */
export function AskAiHeaderButton() {
  const { t } = useTranslation();
  const { isAuthenticated, profile } = useAuth();
  const scope = profile ? `${profile.tenantId}|${profile.role}` : 'none';
  const ai = useQuery({
    queryKey: ['ai', 'status', 'header', scope],
    queryFn: aiApi.status,
    staleTime: 60_000,
    enabled: isAuthenticated,
  });
  if (!isAuthenticated || !ai.data?.features.supportChat) return null;
  return (
    <KitIconButton
      icon="creation"
      variant="glass"
      accessibilityLabel={t('ai.askAi')}
      onPress={() => router.push('/help/ask')}
      testID="today-ask-ai"
    />
  );
}
