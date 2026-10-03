/**
 * Every react-query key in the app, in one place.
 *
 * Keys are written as functions returning `as const` arrays so a mutation can
 * invalidate a whole branch (`qk.bookings.all`) without knowing how the leaves
 * are shaped. Screens must NOT type their own array literals inline: two files
 * that spell the same key slightly differently are two caches, and the symptom
 * is a list that does not update after the mutation that changed it — a bug that
 * looks like a backend problem and is not.
 *
 * The cache is cleared on every sign-in and context switch (`resetQueryCache`),
 * so keys deliberately do NOT carry a partner id. Adding one would suggest two
 * partners' data may coexist in the cache, which is exactly what must not happen.
 */
export const qk = {
  /** The gate the whole app hangs off. */
  entitlements: () => ['entitlements'] as const,
  usage: () => ['usage'] as const,

  onboarding: {
    status: () => ['onboarding', 'status'] as const,
    categories: () => ['onboarding', 'categories'] as const,
  },

  partner: {
    me: () => ['partner', 'me'] as const,
    modules: () => ['partner', 'modules'] as const,
    /** `GET /partners/me/reach` (CONTRACT-partner-P3 §7.3) — Today banner, More row, reach screen. */
    reach: () => ['partner', 'reach'] as const,
  },

  /** The operator's society invitation link (P3 §7.2), by token, no sign-in. */
  societyInvite: (token: string) => ['societyInvite', token] as const,

  today: () => ['today'] as const,

  /**
   * "My shop rent" (CONTRACT-partner-P4 §10.8). `list('OPEN')` is ONE cache
   * entry read by Today (the dues card), More (the row that exists only with a
   * lease) and the rent screen.
   */
  rent: {
    all: () => ['rent'] as const,
    list: (status: string) => ['rent', 'list', status] as const,
    detail: (id: string) => ['rent', 'detail', id] as const,
  },

  bookings: {
    all: () => ['bookings'] as const,
    list: (filters?: Record<string, string | number | undefined>) =>
      ['bookings', 'list', filters ?? {}] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
    /**
     * The clock on one job — `GET /:id/overrun`.
     *
     * A child of `bookings` on purpose: every verb already invalidates
     * `qk.bookings.all()`, and react-query matches by PREFIX, so completing or
     * extending a job refreshes its overrun picture without a second
     * invalidation nobody would remember to add.
     */
    overrun: (id: string) => ['bookings', 'overrun', id] as const,
  },

  orders: {
    all: () => ['orders'] as const,
    list: (filters?: Record<string, string | number | undefined>) =>
      ['orders', 'list', filters ?? {}] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
  },

  catalog: {
    all: () => ['catalog'] as const,
    services: (filters?: Record<string, string | number | undefined>) =>
      ['catalog', 'services', filters ?? {}] as const,
    products: (filters?: Record<string, string | number | undefined>) =>
      ['catalog', 'products', filters ?? {}] as const,
    product: (id: string) => ['catalog', 'products', 'detail', id] as const,
    categories: () => ['catalog', 'categories'] as const,
    byBarcode: (code: string) => ['catalog', 'barcode', code] as const,
    /**
     * The stock ledger (CONTRACT-partner-P0 §5). Under `catalog` on purpose:
     * every stock change already invalidates `qk.catalog.all()`, and the prefix
     * match refreshes the history without a second invalidation.
     */
    stockMovements: (filters?: Record<string, string | undefined>) =>
      ['catalog', 'stockMovements', filters ?? {}] as const,
  },

  /** Team → Owners (CONTRACT-partner-P0 §2). */
  owners: {
    all: () => ['owners'] as const,
    team: () => ['owners', 'team'] as const,
    /** Invitations addressed to ME — any signed-in session. */
    mine: () => ['owners', 'mine'] as const,
    preview: (key: string) => ['owners', 'preview', key] as const,
  },

  billing: {
    all: () => ['billing'] as const,
    documents: (filters?: Record<string, string | number | undefined>) =>
      ['billing', 'documents', filters ?? {}] as const,
    document: (id: string) => ['billing', 'document', id] as const,
    settings: () => ['billing', 'settings'] as const,
  },

  /**
   * The subscription the PARTNER pays ResiSmart for — `/billing/my-subscription`
   * and `/billing/invoices`.
   *
   * Deliberately NOT under `qk.billing` above. That branch is the partner's own
   * invoicing vertical, and `useLiveEvents.keysForKind` invalidates the whole of
   * it on any `BILL…`/`PAYMENT…` frame — which are notifications about the
   * partner's customers paying the partner. Folding the plan in there would
   * refetch the plan screen every time a customer settled a bill, and (worse)
   * would make an unrelated cache eviction look like a billing bug. `PARTNER_PLAN_EXPIRY`
   * is the frame that genuinely moves these, and it invalidates `entitlements()`.
   */
  plan: {
    all: () => ['plan'] as const,
    subscription: () => ['plan', 'subscription'] as const,
    invoices: () => ['plan', 'invoices'] as const,
  },

  parties: {
    all: () => ['parties'] as const,
    list: (search?: string) => ['parties', 'list', search ?? ''] as const,
    detail: (id: string) => ['parties', 'detail', id] as const,
  },

  /** P1 purchases (CONTRACT-partner-P1 §4.3). Under `billing` so every document change refreshes them. */
  purchases: {
    all: () => ['billing', 'purchases'] as const,
    receipts: (poId: string) => ['billing', 'purchases', 'receipts', poId] as const,
    unbilled: (partyId?: string) => ['billing', 'purchases', 'unbilled', partyId ?? ''] as const,
    supplier: (partyId: string) => ['billing', 'purchases', 'supplier', partyId] as const,
  },

  /** P1 stock (§5, §6). Under `catalog` so a stock change refreshes them too. */
  stock: {
    all: () => ['catalog', 'stock'] as const,
    adjustments: (filters?: Record<string, string | undefined>) => ['catalog', 'stock', 'adjustments', filters ?? {}] as const,
    counts: (status?: string) => ['catalog', 'stock', 'counts', status ?? ''] as const,
    count: (id: string) => ['catalog', 'stock', 'count', id] as const,
    countLines: (id: string, filter: string, q: string) => ['catalog', 'stock', 'count', id, 'lines', filter, q] as const,
    reorder: (filters?: Record<string, string | undefined>) => ['catalog', 'stock', 'reorder', filters ?? {}] as const,
  },

  /** P1 khata (§7.2). Under `parties`, which every party/payment change already invalidates. */
  khata: {
    list: (filter: string, q: string) => ['parties', 'khata', filter, q] as const,
  },

  /** P1 money (§8). */
  money: {
    all: () => ['money'] as const,
    accounts: () => ['money', 'accounts'] as const,
    categories: () => ['money', 'categories'] as const,
    expenses: (filters?: Record<string, string | undefined>) => ['money', 'expenses', filters ?? {}] as const,
    transfers: () => ['money', 'transfers'] as const,
    cashBook: (filters?: Record<string, string | undefined>) => ['money', 'cashBook', filters ?? {}] as const,
    daySummary: (date: string, accountId?: string) => ['money', 'day', date, accountId ?? ''] as const,
    pnl: (from: string, to: string) => ['money', 'pnl', from, to] as const,
  },

  payments: {
    all: () => ['payments'] as const,
    list: (filters?: Record<string, string | number | undefined>) =>
      ['payments', 'list', filters ?? {}] as const,
  },

  services: {
    all: () => ['services'] as const,
    list: (filters?: Record<string, string | undefined>) => ['services', 'list', filters ?? {}] as const,
    detail: (id: string) => ['services', 'detail', id] as const,
  },

  availability: {
    /** The business's own default schedule (`staffId: null`) — this app does not build staff overrides. */
    business: () => ['availability', 'business'] as const,
  },

  reports: (range: string) => ['reports', range] as const,
  analytics: {
    /**
     * Nested UNDER `qk.today()` — deliberately, unlike every other leaf below
     * `today()` is written as its own top-level key. `useLiveEvents.ts`'s
     * `keysForKind` invalidates the bare `qk.today()` on EVERY notification
     * frame, and the Today screen's own pull-to-refresh does the same
     * (`onRefresh` in `(tabs)/index.tsx`); prefix-matching that invalidation is
     * exactly how this board picks up a new order/booking without a bespoke
     * SSE key of its own. The board also carries a server-side 60s cache, so a
     * burst of frames costs cheap re-checks, not re-aggregation.
     */
    today: () => [...qk.today(), 'analytics'] as const,
    /** The Reports → Insights tab's board — a different screen, no SSE tie-in. */
    overview: (query?: Record<string, string | undefined>) => ['analytics', 'overview', query ?? {}] as const,
  },
  staff: () => ['staff'] as const,
  promotion: () => ['promotion'] as const,
  notifications: () => ['notifications'] as const,
  reviews: (page?: number) => ['reviews', page ?? 1] as const,

  // Added by the More-tab agent (parties/staff/reports/promotion/settings).
  // Kept as new siblings rather than folding into `staff()`/`promotion()`
  // above: those two keys are already read by `src/features/bookings/hooks.ts`
  // and `useLiveEvents.ts` and must keep meaning exactly what they mean today.
  // React Query's default invalidation is a PREFIX match, so invalidating
  // `staff()` (`['staff']`) or `promotion()` (`['promotion']`) still catches
  // `staffRoles()`/`promotionBoosts()` below without either file changing.
  // NOT `staff()` itself — that key already belongs to
  // `features/bookings/hooks.ts`'s `useAssignableStaff` (a differently-shaped,
  // booking-specific projection). This is a sibling so a mutation here can
  // still invalidate both with one `invalidateQueries({ queryKey: qk.staff() })`
  // call, via the same prefix-match rule noted above.
  staffList: () => ['staff', 'list'] as const,
  /** `GET /partners/me/staff/assignable` — the booking job picker. */
  staffAssignable: () => ['staff', 'assignable'] as const,
  staffRoles: () => ['staff', 'roles'] as const,
  promotionBoosts: () => ['promotion', 'boosts'] as const,
  /**
   * Keyed by RADIUS, not by package: two packages that sell the same radius
   * must show the same number, and fetching it once per card is how they would
   * eventually disagree. Also a prefix-match child of `promotion()`, so the
   * screen's own refresh still catches it.
   */
  promotionReach: (radiusKm: number) => ['promotion', 'reach', radiusKm] as const,
  businessSettings: () => ['settings', 'business'] as const,
  whatsappSettings: () => ['settings', 'whatsapp'] as const,

  // In-app Help (PLAN-02). Keyed by language as well: the server answers in
  // one language, so a switch to Hindi must be a different cache entry.
  helpModules: (lang: string) => ['help', 'modules', lang] as const,
  helpModule: (module: string, lang: string) => ['help', 'module', module, lang] as const,
  helpRoute: (path: string, lang: string) => ['help', 'route', path, lang] as const,
  helpSearch: (q: string, lang: string) => ['help', 'search', q, lang] as const,

  /**
   * Commerce C3–C6 (CONTRACT-commerce §8–§11). One `commerce` root so a settings
   * save (which can switch a feature on or off) refreshes every commerce screen
   * with one prefix invalidation. Counter holds sit under `billing` as well as
   * here: a resumed hold becomes a bill.
   */
  commerce: {
    all: () => ['commerce'] as const,
    settings: () => ['commerce', 'settings'] as const,
    offers: (filters?: Record<string, string | number | undefined>) => ['commerce', 'offers', filters ?? {}] as const,
    offer: (id: string) => ['commerce', 'offer', id] as const,
    redemptions: (id: string, page: number) => ['commerce', 'offer', id, 'redemptions', page] as const,
    wallets: (filters?: Record<string, string | number | undefined>) => ['commerce', 'wallets', filters ?? {}] as const,
    wallet: (partyId: string) => ['commerce', 'wallet', partyId] as const,
    statement: (partyId: string, bucket: string, page: number) => ['commerce', 'wallet', partyId, 'statement', bucket, page] as const,
    broadcasts: (status?: string) => ['commerce', 'broadcasts', status ?? ''] as const,
    audience: (segment: string) => ['commerce', 'audience', segment] as const,
    insights: (part: string, query?: Record<string, string | number | undefined>) => ['commerce', 'insights', part, query ?? {}] as const,
    holds: () => ['commerce', 'holds'] as const,
    quickKeys: () => ['commerce', 'quickKeys'] as const,
    variants: (productId: string) => ['catalog', 'variants', productId] as const,
  },
} as const;
