import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';

/**
 * `/partners/me/money` (CONTRACT-partner-P1 §8, module INVOICING): cash & bank
 * accounts, expenses, transfers, the cash / bank book, the day summary and the
 * day close. Money in integer paise; a "day" is IST `YYYY-MM-DD`.
 */
export const EXPENSE_MODES = ['CASH', 'UPI', 'CARD', 'BANK'] as const;
export type ExpenseMode = typeof EXPENSE_MODES[number];

export interface MoneyAccount {
  _id: string;
  kind: 'CASH' | 'BANK';
  name: string;
  isDefault: boolean;
  isActive: boolean;
  openingBalancePaise: number;
  openingDate?: string;
  bankLast4?: string;
  upiId?: string;
  balancePaise: number;
}

export interface ExpenseCategory {
  _id: string;
  name: string;
  systemKey?: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface Expense {
  _id: string;
  number: string;
  expenseDate: string;
  categoryId: string;
  categoryName: string;
  description: string;
  amountPaise: number;
  gstPaise?: number;
  taxablePaise?: number;
  supplierGstin?: string;
  itcEligible: boolean;
  partyId?: string;
  accountId: string;
  mode: ExpenseMode;
  reference?: string;
  attachmentUrls: string[];
  status: 'RECORDED' | 'CANCELLED';
  cancelReason?: string;
}

export interface CreateExpenseBody {
  expenseDate: string;
  categoryId: string;
  description: string;
  amountPaise: number;
  gstPaise?: number;
  supplierGstin?: string;
  itcEligible?: boolean;
  accountId?: string;
  mode: ExpenseMode;
  reference?: string;
  attachmentUrls?: string[];
}

export interface MoneyTransfer {
  _id: string;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amountPaise: number;
  note?: string;
  status: 'RECORDED' | 'CANCELLED';
}

export type CashBookKind = 'PAYMENT_IN' | 'PAYMENT_OUT' | 'EXPENSE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'DAY_CLOSE';

export interface CashBookRow {
  at: string;
  kind: CashBookKind;
  ref?: string;
  partyName?: string;
  inPaise: number;
  outPaise: number;
  balancePaise: number;
}

export interface CashBook {
  account: MoneyAccount;
  openingPaise: number;
  rows: CashBookRow[];
  closingPaise: number;
}

export interface DaySummary {
  date: string;
  sales: { printAs?: string; type?: string; count: number; taxablePaise: number; taxPaise: number; grandPaise: number }[];
  returns?: unknown;
  creditSalesPaise: number;
  collections: { mode: string; amountPaise: number }[];
  paymentsOutPaise: number;
  expenses: { categoryName: string; amountPaise: number }[];
  purchasesPaise: number;
  cash: { openingPaise: number; inPaise: number; outPaise: number; expensesPaise: number; transfersPaise: number; expectedPaise: number };
  topItems: { itemName: string; qty: number; valuePaise: number }[];
  closed?: { id: string; countedCashPaise: number; variancePaise: number; closedByName?: string };
}

export interface DayClose {
  _id: string;
  day: string;
  accountId: string;
  openingCashPaise: number;
  expectedCashPaise: number;
  countedCashPaise: number;
  variancePaise: number;
  note?: string;
  reopenedAt?: string;
}

/**
 * P&L (§8 `pnl`, design P1.11). The server's JSON is read defensively: every
 * figure is optional here, and the screen draws only what arrived.
 */
export interface PnlReport {
  period?: { from: string; to: string };
  revenuePaise?: number;
  cogsPaise?: number;
  grossProfitPaise?: number;
  stockAdjustments?: { reasonCode?: string; label?: string; valuePaise: number }[];
  stockLossesPaise?: number;
  expenses?: { categoryName: string; amountPaise: number }[];
  expensesPaise?: number;
  netProfitPaise?: number;
  uncostedItems?: { itemName: string }[];
  notes?: string[];
}

export interface PageOf<T> { data: T[]; page: number; limit: number; total: number }

export const moneyApi = {
  accounts: () => apiClient.get<ApiEnvelope<MoneyAccount[]>>('/partners/me/money/accounts').then((r) => unwrap(r.data)),
  createAccount: (body: { kind: 'CASH' | 'BANK'; name: string; openingBalancePaise?: number; isDefault?: boolean; bankLast4?: string; upiId?: string }) =>
    apiClient.post<ApiEnvelope<MoneyAccount>>('/partners/me/money/accounts', body).then((r) => unwrap(r.data)),
  updateAccount: (id: string, body: { name?: string; isDefault?: true; isActive?: boolean }) =>
    apiClient.put<ApiEnvelope<MoneyAccount>>(`/partners/me/money/accounts/${id}`, body).then((r) => unwrap(r.data)),

  categories: () => apiClient.get<ApiEnvelope<ExpenseCategory[]>>('/partners/me/money/expense-categories').then((r) => unwrap(r.data)),
  createCategory: (name: string) =>
    apiClient.post<ApiEnvelope<ExpenseCategory>>('/partners/me/money/expense-categories', { name }).then((r) => unwrap(r.data)),

  expenses: (query: { from?: string; to?: string; categoryId?: string; status?: 'RECORDED' | 'CANCELLED' | 'ALL'; page?: number; limit?: number }) =>
    apiClient
      .get<PageOf<Expense> & { totals: { amountPaise: number; gstPaise: number } }>('/partners/me/money/expenses', { params: query })
      .then((r) => r.data),
  /** Idempotent (`partner.expense.create`). */
  createExpense: (body: CreateExpenseBody, idempotencyKey: string) =>
    apiClient.post<ApiEnvelope<Expense>>('/partners/me/money/expenses', body, withIdempotency(idempotencyKey)).then((r) => unwrap(r.data)),
  cancelExpense: (id: string, reason: string) =>
    apiClient.post<ApiEnvelope<Expense>>(`/partners/me/money/expenses/${id}/cancel`, { reason }).then((r) => unwrap(r.data)),

  transfers: (query: { page?: number; limit?: number } = {}) =>
    apiClient.get<PageOf<MoneyTransfer>>('/partners/me/money/transfers', { params: query }).then((r) => r.data),
  createTransfer: (body: { date: string; fromAccountId: string; toAccountId: string; amountPaise: number; note?: string }) =>
    apiClient.post<ApiEnvelope<MoneyTransfer>>('/partners/me/money/transfers', body).then((r) => unwrap(r.data)),
  cancelTransfer: (id: string, reason: string) =>
    apiClient.post<ApiEnvelope<MoneyTransfer>>(`/partners/me/money/transfers/${id}/cancel`, { reason }).then((r) => unwrap(r.data)),

  cashBook: (query: { accountId?: string; from?: string; to?: string; page?: number; limit?: number }) =>
    apiClient.get<ApiEnvelope<CashBook> & { page: number; limit: number; total: number }>('/partners/me/money/cash-book', { params: query })
      .then((r) => ({ ...unwrap(r.data), page: r.data.page, limit: r.data.limit, total: r.data.total })),

  daySummary: (query: { date?: string; accountId?: string }) =>
    apiClient.get<ApiEnvelope<DaySummary>>('/partners/me/money/day-summary', { params: query }).then((r) => unwrap(r.data)),
  closeDay: (body: { date: string; accountId?: string; countedCashPaise: number; note?: string }) =>
    apiClient.post<ApiEnvelope<DayClose>>('/partners/me/money/day-close', body).then((r) => unwrap(r.data)),
  reopenDay: (id: string, reason: string) =>
    apiClient.post<ApiEnvelope<DayClose>>(`/partners/me/money/day-close/${id}/reopen`, { reason }).then((r) => unwrap(r.data)),

  pnl: (query: { from: string; to: string }) =>
    apiClient.get<ApiEnvelope<PnlReport>>('/partners/me/reports/pnl', { params: query }).then((r) => unwrap(r.data)),
};
