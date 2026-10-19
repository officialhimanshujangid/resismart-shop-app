import axios from 'axios';
import { apiClient } from './axios';

/**
 * AI-1 — the shop app's side of `/api/v1/ai` (support chat). Same verbs, codes
 * and rules as the website and the society app; `app` is always `shop`, so the
 * articles sent to the AI are the partner help articles only.
 *
 * The chat history lives only in the screen's memory for this session.
 */

const APP = 'shop';

export type AiStatus = {
  available: boolean;
  reason: string | null;
  features: { supportChat: boolean; askSociety: boolean; billDraft: boolean };
  consent: { given: boolean; version: string };
};
export type AiSource = { ref: string; id: string; module: string; moduleTitle: string; question: string; link: string | null };
export type AiAnswer = { known: boolean; answer: string; lang: 'en' | 'hi'; sources: AiSource[]; related: AiSource[] };
export type AiTurn = { role: 'user' | 'model'; text: string };

export const AI_ERROR_CODES = [
  'AI_NOT_AVAILABLE', 'AI_OFF_FOR_SOCIETY', 'AI_FEATURE_OFF', 'AI_CONTEXT_REQUIRED', 'AI_CONSENT_REQUIRED',
  'AI_CONSENT_INVALID', 'AI_LIMIT_REACHED', 'AI_USER_DAILY_LIMIT', 'AI_BUDGET_REACHED', 'AI_QUESTION_INVALID', 'AI_FAILED',
] as const;
export type AiErrorCode = typeof AI_ERROR_CODES[number];

export const AI_QUESTION_MAX = 500;

export const AI_OFF: AiStatus = {
  available: false, reason: 'AI_NOT_AVAILABLE',
  features: { supportChat: false, askSociety: false, billDraft: false },
  consent: { given: false, version: '' },
};

const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? (v as Record<string, any>) : {});
const body = (r: { data: unknown }) => rec(rec(r.data).data ?? r.data);

const toSources = (v: unknown): AiSource[] => (Array.isArray(v) ? v : []).map((x) => {
  const r = rec(x);
  return {
    ref: String(r.ref ?? ''), id: String(r.id ?? ''), module: String(r.module ?? ''),
    moduleTitle: String(r.moduleTitle ?? ''), question: String(r.question ?? ''),
    link: typeof r.link === 'string' && r.link.startsWith('/') ? r.link : null,
  };
}).filter((s) => s.ref && s.question);

export function toAiStatus(raw: unknown): AiStatus {
  const b = rec(raw);
  const f = rec(b.features);
  const c = rec(b.consent);
  const available = b.available === true;
  return {
    available,
    reason: typeof b.reason === 'string' ? b.reason : null,
    features: { supportChat: available && f.supportChat === true, askSociety: available && f.askSociety === true, billDraft: available && f.billDraft === true },
    consent: { given: c.given === true, version: String(c.version ?? '') },
  };
}

export const aiApi = {
  /** Fails closed: any error = no AI entry point. */
  async status(): Promise<AiStatus> {
    try {
      return toAiStatus(body(await apiClient.get('/ai/status', { params: { app: APP } })));
    } catch {
      return AI_OFF;
    }
  },
  async consent(lang: string): Promise<void> {
    await apiClient.post('/ai/consent', { accept: true, adult: true, app: APP, lang: lang === 'hi' ? 'hi' : 'en' });
  },
  async withdraw(): Promise<void> {
    await apiClient.delete('/ai/consent');
  },
  async ask(question: string, history: AiTurn[], lang: string): Promise<AiAnswer> {
    const b = body(await apiClient.post('/ai/chat', { app: APP, lang: lang === 'hi' ? 'hi' : 'en', question, history: history.slice(-6) }));
    return {
      known: b.known === true,
      answer: String(b.answer ?? ''),
      lang: b.lang === 'hi' ? 'hi' : 'en',
      sources: toSources(b.sources),
      related: toSources(b.related),
    };
  },
};

/** A refusal's code (when we have words for it), the server's sentence, and the articles it sent. */
export function aiRefusal(e: unknown): { code: AiErrorCode | null; message: string; related: AiSource[] } {
  const data = axios.isAxiosError(e) ? rec(e.response?.data) : {};
  const code = typeof data.code === 'string' && (AI_ERROR_CODES as readonly string[]).includes(data.code) ? data.code as AiErrorCode : null;
  return { code, message: typeof data.message === 'string' ? data.message : '', related: toSources(data.related) };
}
