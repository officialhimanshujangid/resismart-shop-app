/**
 * AI-1 — "Ask AI" (support chat) in the shop app: consent with the 18+ tick,
 * the chat (app=shop), a source opens its help topic, a refusal in its own words,
 * and no chat when AI is off for the business.
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import i18n from 'i18next';
import { renderScreen } from './setup/harness';
import { setRoutes, callsTo, fail } from './setup/mockApi';
import { router } from './setup/mockRouter';
import { ToastProvider } from '../components/ui';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';
import { AI_ERROR_CODES } from '../api/ai.api';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const HelpAsk = require('../../app/(app)/help/ask').default;

const t = (k: string) => i18n.t(k);
const ON = { available: true, reason: null, features: { supportChat: true, askSociety: false, billDraft: false }, consent: { given: true, version: 'v' } };
const wrap = (data: unknown) => ({ success: true, data });
const show = () => renderScreen(<PaperProvider><ToastProvider><HelpAsk /></ToastProvider></PaperProvider>);

it('every AI code has en + hi words', () => {
  for (const code of AI_ERROR_CODES) {
    expect((en as any).ai.errors[code]).toBeTruthy();
    expect((hi as any).ai.errors[code]).toMatch(/[ऀ-ॿ]/);
  }
});

it('consent needs the 18+ tick, then is sent with app=shop', async () => {
  setRoutes({ 'GET /ai/status': wrap({ ...ON, consent: { given: false, version: 'v' } }), 'POST /ai/consent': wrap({ given: true }) });
  await show();
  await screen.findByText(t('ai.consent.body'));
  await act(async () => { fireEvent.press(screen.getByText(t('ai.consent.accept'))); });
  expect(callsTo('POST', '/ai/consent')).toHaveLength(0);
  await act(async () => { fireEvent.press(screen.getByRole('checkbox')); });
  await act(async () => { fireEvent.press(screen.getByText(t('ai.consent.accept'))); });
  expect(callsTo('POST', '/ai/consent')[0].body).toMatchObject({ accept: true, adult: true, app: 'shop' });
});

it('asks and shows the answer; a source opens its help topic', async () => {
  setRoutes({
    'GET /ai/status': wrap(ON),
    'POST /ai/chat': wrap({ known: true, answer: 'Open Catalogue and press Add.', lang: 'en', sources: [{ ref: 'shop-catalog:add', id: 'add', module: 'shop-catalog', moduleTitle: 'Catalogue', question: 'How do I add a product?', link: null }], related: [] }),
  });
  await show();
  await screen.findByText(t('ai.chat.introTitle'));
  await act(async () => { fireEvent.changeText(screen.getByLabelText(t('ai.chat.placeholder')), 'add product?'); });
  await act(async () => { fireEvent.press(screen.getByLabelText(t('ai.chat.send'))); });
  expect(await screen.findByText('Open Catalogue and press Add.')).toBeTruthy();
  expect(callsTo('POST', '/ai/chat')[0].body).toMatchObject({ app: 'shop', question: 'add product?' });
  await act(async () => { fireEvent.press(screen.getByLabelText('How do I add a product?')); });
  expect(router.push).toHaveBeenCalledWith('/help/shop-catalog');
});

it('a refusal shows its own words', async () => {
  setRoutes({ 'GET /ai/status': wrap(ON), 'POST /ai/chat': fail(503, { code: 'AI_BUDGET_REACHED', message: 'x' }) });
  await show();
  await screen.findByText(t('ai.chat.introTitle'));
  await act(async () => { fireEvent.changeText(screen.getByLabelText(t('ai.chat.placeholder')), 'hello'); });
  await act(async () => { fireEvent.press(screen.getByLabelText(t('ai.chat.send'))); });
  expect(await screen.findByText(t('ai.errors.AI_BUDGET_REACHED'))).toBeTruthy();
});

it('AI off for the business → its sentence, no chat box', async () => {
  setRoutes({ 'GET /ai/status': wrap({ ...ON, available: false, reason: 'AI_OFF_FOR_SOCIETY', features: { supportChat: false } }) });
  await show();
  expect(await screen.findByText(t('ai.errors.AI_OFF_FOR_SOCIETY'))).toBeTruthy();
  expect(screen.queryByLabelText(t('ai.chat.placeholder'))).toBeNull();
});

// AI-R — "Report" under an AI answer (Play AI-content policy).
describe('report an answer', () => {
  const answered = (report: unknown) => setRoutes({
    'GET /ai/status': wrap(ON),
    'POST /ai/chat': wrap({ known: true, answer: 'Open Catalogue and press Add.', lang: 'en', sources: [], related: [] }),
    'POST /ai/report': report,
  });
  const askAndOpen = async () => {
    await show();
    await screen.findByText(t('ai.chat.introTitle'));
    await act(async () => { fireEvent.changeText(screen.getByLabelText(t('ai.chat.placeholder')), 'add product?'); });
    await act(async () => { fireEvent.press(screen.getByLabelText(t('ai.chat.send'))); });
    await screen.findByText('Open Catalogue and press Add.');
    await act(async () => { fireEvent.press(screen.getByText(t('ai.report.button'))); });
    await screen.findByText(t('ai.report.subtitle'));
  };

  it('every reason has en + hi words', () => {
    for (const r of ['WRONG', 'HARMFUL', 'OFFENSIVE', 'OTHER']) {
      expect((en as any).ai.report.reason[r]).toBeTruthy();
      expect((hi as any).ai.report.reason[r]).toMatch(/[ऀ-ॿ]/);
    }
  });

  it('pick a reason, send → the question that produced the answer goes with it; then "Reported"', async () => {
    answered({ success: true });
    await askAndOpen();
    await act(async () => { fireEvent.press(screen.getByLabelText(t('ai.report.reason.HARMFUL'))); });
    await act(async () => { fireEvent.changeText(screen.getByLabelText(t('ai.report.note')), 'unsafe tip'); });
    await act(async () => { fireEvent.press(screen.getByText(t('ai.report.send'))); });
    expect(callsTo('POST', '/ai/report')[0].body).toMatchObject({
      app: 'shop', feature: 'SUPPORT_CHAT', question: 'add product?', answer: 'Open Catalogue and press Add.', reason: 'HARMFUL', note: 'unsafe tip',
    });
    expect(await screen.findByText(t('ai.report.reported'))).toBeTruthy();
    expect(screen.queryByText(t('ai.report.button'))).toBeNull();
  });

  it('a refusal shows the server words; the chat stays usable', async () => {
    answered(fail(429, { code: 'AI_REPORT_LIMIT', message: 'server says no' }));
    await askAndOpen();
    await act(async () => { fireEvent.press(screen.getByLabelText(t('ai.report.reason.WRONG'))); });
    await act(async () => { fireEvent.press(screen.getByText(t('ai.report.send'))); });
    expect(await screen.findByText(t('ai.errors.AI_REPORT_LIMIT'))).toBeTruthy();
    expect(screen.queryByText(t('ai.report.reported'))).toBeNull();
    expect(screen.getByLabelText(t('ai.chat.placeholder'))).toBeTruthy();
  });
});
