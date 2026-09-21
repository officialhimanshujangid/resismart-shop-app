import { apiClient, ApiEnvelope, unwrap } from './axios';

/**
 * `/help/*` — the in-app Help & FAQ content (PLAN-02 §2), served by the backend
 * so the words can change without a store release. Every call names `app=shop`:
 * the server filters articles by app AND by the caller's active role, so what
 * comes back is already only what this person may read.
 *
 * Articles arrive LOCALISED — `lang` picks the language server-side (English
 * fallback) — so nothing here chooses between an `en` and a `hi` field.
 *
 * `unwrap` because the help controller answers with the bare object while most
 * partner controllers use the `{ data }` envelope; it accepts both.
 */

const APP = 'shop';

export interface HelpArticle {
  id: string;
  module: string;
  question: string;
  answer: string;
  /** Optional in the content; may arrive empty or absent. */
  steps?: string[];
  /** An expo-router path in THIS app, when the article has one. */
  link?: string | null;
}

export interface HelpModuleSummary {
  module: string;
  title: string;
  summary: string;
  articleCount: number;
}

export interface HelpModuleDetail {
  module: string;
  title: string;
  summary: string;
  articles: HelpArticle[];
}

export interface HelpRouteResult {
  module: string | null;
  title: string | null;
  articles: HelpArticle[];
}

export interface HelpSearchHit {
  module: string;
  moduleTitle: string;
  article: HelpArticle;
}

export const helpApi = {
  modules: (lang: string) =>
    apiClient
      .get<ApiEnvelope<{ modules: HelpModuleSummary[] }>>('/help/modules', { params: { app: APP, lang } })
      .then((r) => unwrap(r.data).modules ?? []),

  module: (module: string, lang: string) =>
    apiClient
      .get<ApiEnvelope<HelpModuleDetail>>(`/help/modules/${encodeURIComponent(module)}`, { params: { app: APP, lang } })
      .then((r) => unwrap(r.data)),

  forRoute: (path: string, lang: string) =>
    apiClient
      .get<ApiEnvelope<HelpRouteResult>>('/help/route', { params: { app: APP, path, lang } })
      .then((r) => unwrap(r.data)),

  search: (q: string, lang: string) =>
    apiClient
      .get<ApiEnvelope<{ results: HelpSearchHit[] }>>('/help/search', { params: { app: APP, q, lang } })
      .then((r) => unwrap(r.data).results ?? []),
};
