/**
 * Render a shop screen the way the app does, minus the network: a fresh
 * QueryClient per render (retries off, so an error shows at once), and the
 * language set before the first paint. Copied from mobile-guard's harness.
 */
import React from 'react';
import { render, type RenderResult } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';

const clients: QueryClient[] = [];
afterEach(() => { while (clients.length) clients.pop()!.clear(); });

export async function renderScreen(
  ui: React.ReactElement,
  opts: { lang?: 'en' | 'hi' } = {},
): Promise<RenderResult & { client: QueryClient }> {
  await i18n.changeLanguage(opts.lang ?? 'en');
  const client = new QueryClient({
    // `gcTime: 0` on mutations or jest waits five minutes for a finished one.
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const utils = await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return Object.assign(utils, { client });
}
