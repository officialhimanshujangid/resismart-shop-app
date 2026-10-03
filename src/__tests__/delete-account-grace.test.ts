/**
 * >>> HELP34R — the business app's delete-account copy matches the server's
 * 30-day grace (backend `account-grace.service` GRACE_DAYS = 30): nothing says
 * the deletion is immediate or cannot be undone.
 */
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const KEYS = ['warningBody', 'finalBody', 'doneBody'] as const;

describe('delete account: 30-day grace wording', () => {
  it('English', () => {
    const d = (en as any).account.delete;
    for (const k of KEYS) {
      expect(d[k]).toMatch(/30 days/);
      expect(d[k]).not.toMatch(/cannot be undone|permanently/i);
    }
    expect(d.warningTitle).not.toMatch(/permanently/i);
    expect(d.finalConfirm).toBe('Delete in 30 days');
    expect(d.doneOn).toContain('{{date}}');
    expect((hi as any).account.delete.doneOn).toContain('{{date}}');
  });

  it('Hindi', () => {
    const d = (hi as any).account.delete;
    for (const k of KEYS) {
      expect(d[k]).toMatch(/30 दिन/);
      expect(d[k]).not.toMatch(/वापस नहीं किया जा सकता|हमेशा के लिए/);
    }
    expect(d.finalConfirm).toBe('30 दिन में डिलीट करें');
  });
});
