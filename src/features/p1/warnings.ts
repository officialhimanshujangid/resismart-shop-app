import type { TFunction } from 'i18next';

import i18n from '../../i18n';
import { codedText } from '../../lib/apiErrorText';
import type { IssueWarning } from '../billing/types';

/**
 * The sentence for an issue WARNING (§4.4: `warnings:[{code, params}]` — the
 * bill was issued). Same catalogue as refusals (`errors.<CODE>`), and the same
 * rule: a code whose params did not all arrive is not shown with braces in it —
 * it falls back to a plain "issued, but check this customer's credit" line.
 */
export function warningText(w: IssueWarning, t: TFunction): string {
  const text = codedText(w.code, w.params, {
    t: (k, o) => String(t(k, o)),
    exists: (k) => i18n.exists(k),
  });
  return text ?? t('billing.new.issuedWithWarningGeneric');
}
