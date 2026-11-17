import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 11-06 deep QA (PAR-032) — the server seeds money heads in English ("Rent",
 * "Cash in shop", …) and leaves translating to clients. Display only: a name is
 * shown in the reader's language while it is still the seeded English one; a
 * name the partner typed or renamed is shown as typed. Same list as the website
 * (frontend/src/lib/partner-money-names.ts).
 */
const SEEDED: Record<string, string> = {
  'Rent': 'money.systemCategory.RENT',
  'Electricity': 'money.systemCategory.ELECTRICITY',
  'Salaries': 'money.systemCategory.SALARIES',
  'Transport': 'money.systemCategory.TRANSPORT',
  'Packaging': 'money.systemCategory.PACKAGING',
  'Repairs': 'money.systemCategory.REPAIRS',
  'Telephone/Internet': 'money.systemCategory.TELEPHONE_INTERNET',
  'Miscellaneous': 'money.systemCategory.MISCELLANEOUS',
  'Cash in shop': 'money.defaultAccount.CASH_IN_SHOP',
  'Bank account': 'money.defaultAccount.BANK_ACCOUNT',
};

export const seededMoneyKey = (name?: string | null): string | null =>
  (name ? SEEDED[name.trim()] ?? null : null);

export function useMoneyName() {
  const { t } = useTranslation();
  return useCallback((name?: string | null): string => {
    const key = seededMoneyKey(name);
    return key ? t(key, { defaultValue: name ?? '' }) : (name ?? '');
  }, [t]);
}
