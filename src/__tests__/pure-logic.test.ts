/**
 * The pure helpers behind the completion-code panel, the boost GST lines, the
 * Staff/Roles screens and the bill-line stepper.
 */
import { afterRefusal, isCodeRefusal, isLocked, type CodePanelState } from '../lib/completionCode';
import { boostTaxLines, type BoostTax } from '../lib/boostTax';
import { grantableLevels, isOwnStaffRow, roleWithinReach, type Level } from '../lib/staffAccess';
import { canStepDown, stepQty } from '../lib/qtyStep';

// ─────────────────────────────────────────────────────── completionCode
describe('completionCode', () => {
  const S: CodePanelState = { attemptsLeft: 5, resendsLeft: 2, canResend: true };

  it('recognises only the code refusals', () => {
    for (const c of ['BOOKING_CODE_WRONG', 'BOOKING_CODE_LOCKED', 'BOOKING_CODE_NOT_SENT', 'BOOKING_CODE_RESEND_LIMIT', 'BOOKING_CODE_RESEND_NOT_NEEDED']) {
      expect(isCodeRefusal(c)).toBe(true);
    }
    expect(isCodeRefusal('BOOKING_NOT_FOUND')).toBe(false);
    expect(isCodeRefusal(undefined)).toBe(false);
  });

  it('WRONG takes the server\'s attemptsLeft (sent as a string)', () => {
    expect(afterRefusal(S, 'BOOKING_CODE_WRONG', { attemptsLeft: '3' })).toEqual({ ...S, attemptsLeft: 3 });
    expect(afterRefusal(S, 'BOOKING_CODE_WRONG', { attemptsLeft: 0 })).toEqual({ ...S, attemptsLeft: 0 });
  });

  it('WRONG with a missing or junk count keeps the state', () => {
    expect(afterRefusal(S, 'BOOKING_CODE_WRONG', undefined)).toBe(S);
    expect(afterRefusal(S, 'BOOKING_CODE_WRONG', { attemptsLeft: 'x' })).toBe(S);
    expect(afterRefusal(S, 'BOOKING_CODE_WRONG', { attemptsLeft: -1 })).toBe(S);
  });

  it('LOCKED zeroes the tries; RESEND_LIMIT closes the resend door', () => {
    expect(afterRefusal(S, 'BOOKING_CODE_LOCKED', { attemptsLeft: '0' })).toEqual({ ...S, attemptsLeft: 0 });
    expect(afterRefusal(S, 'BOOKING_CODE_RESEND_LIMIT', undefined)).toEqual({ ...S, resendsLeft: 0, canResend: false });
  });

  it('other codes and an unknown previous state pass through', () => {
    expect(afterRefusal(S, 'BOOKING_CODE_NOT_SENT', undefined)).toBe(S);
    expect(afterRefusal(undefined, 'BOOKING_CODE_LOCKED', undefined)).toBeUndefined();
  });

  it('isLocked only at zero tries', () => {
    expect(isLocked(undefined)).toBe(false);
    expect(isLocked(S)).toBe(false);
    expect(isLocked({ ...S, attemptsLeft: 0 })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────── boostTax
describe('boostTaxLines', () => {
  const money = (p: number) => `₹${(p / 100).toFixed(2)}`;
  const base: BoostTax = {
    gstApplicable: true, interState: false, sac: '998365', ratePercent: 18,
    taxablePaise: 8475, cgstPaise: 763, sgstPaise: 762, igstPaise: 0, taxPaise: 1525, grandPaise: 10000, note: '',
  };

  it('no tax recorded → nothing said', () => {
    expect(boostTaxLines(null, money)).toEqual([]);
    expect(boostTaxLines(undefined, money)).toEqual([]);
  });

  it('GST not applicable → one "No GST charged" line', () => {
    expect(boostTaxLines({ ...base, gstApplicable: false }, money)).toEqual([{ key: 'promotion.tax.noGst', values: {} }]);
  });

  it('same state → taxable, CGST + SGST at half the rate each, total', () => {
    expect(boostTaxLines(base, money)).toEqual([
      { key: 'promotion.tax.taxable', values: { amount: '₹84.75' } },
      { key: 'promotion.tax.cgst', values: { rate: 9, amount: '₹7.63' } },
      { key: 'promotion.tax.sgst', values: { rate: 9, amount: '₹7.62' } },
      { key: 'promotion.tax.total', values: { amount: '₹100.00' } },
    ]);
  });

  it('another state → taxable, IGST at the full rate, total', () => {
    const lines = boostTaxLines({ ...base, interState: true, cgstPaise: 0, sgstPaise: 0, igstPaise: 1525 }, money);
    expect(lines.map((l) => l.key)).toEqual(['promotion.tax.taxable', 'promotion.tax.igst', 'promotion.tax.total']);
    expect(lines[1].values).toEqual({ rate: 18, amount: '₹15.25' });
  });
});

// ────────────────────────────────────────────────────────── staffAccess
describe('staffAccess', () => {
  const ALL: Level[] = ['NONE', 'READ', 'FULL'];

  it('the proprietor may grant every level; others up to their own', () => {
    expect(grantableLevels(ALL, true, 'NONE')).toEqual(ALL);
    expect(grantableLevels(ALL, false, 'READ')).toEqual(['NONE', 'READ']);
    expect(grantableLevels(ALL, false, 'FULL')).toEqual(ALL);
    expect(grantableLevels(ALL, false, 'NONE')).toEqual(['NONE']);
  });

  it('a role is within reach only if every grant is at or below what I hold', () => {
    const own = (m: string): Level => (m === 'BILLING' ? 'FULL' : 'READ');
    expect(roleWithinReach([{ module: 'BILLING', level: 'FULL' }, { module: 'ORDERS', level: 'READ' }], false, own)).toBe(true);
    expect(roleWithinReach([{ module: 'ORDERS', level: 'FULL' }], false, own)).toBe(false);
    expect(roleWithinReach([{ module: 'ORDERS', level: 'FULL' }], true, own)).toBe(true);
    expect(roleWithinReach([], false, own)).toBe(true);
  });

  it('own row matched on the last 10 phone digits, or on email (case-insensitive)', () => {
    expect(isOwnStaffRow({ userId: { phone: '+91 98765 43210' } }, { phone: '9876543210' })).toBe(true);
    expect(isOwnStaffRow({ userId: { phone: '9876543211' } }, { phone: '9876543210' })).toBe(false);
    expect(isOwnStaffRow({ userId: { email: ' Asha@Shop.in ' } }, { email: 'asha@shop.in' })).toBe(true);
    expect(isOwnStaffRow({ userId: { phone: '12345' } }, { phone: '12345' })).toBe(false); // too short to trust
  });

  it('not own: no session, an unpopulated userId, or no identifiers', () => {
    expect(isOwnStaffRow({ userId: { phone: '9876543210' } }, null)).toBe(false);
    expect(isOwnStaffRow({ userId: 'u-1' }, { phone: '9876543210' })).toBe(false);
    expect(isOwnStaffRow({ userId: {} }, {})).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────── qtyStep
describe('qtyStep', () => {
  it('steps up and down by the delta', () => {
    expect(stepQty(1, 1)).toBe(2);
    expect(stepQty(3, -1)).toBe(2);
  });

  it('minus never takes a line below 1', () => {
    expect(stepQty(1, -1)).toBe(1);
    expect(stepQty(1.5, -1)).toBe(1.5);
    expect(stepQty(0.5, -1)).toBe(0.5); // a typed 0.5 kg is left alone, not jumped to 1
  });

  it('two decimals, no float drift', () => {
    expect(stepQty(1.25, 1)).toBe(2.25);
    expect(stepQty(0.1, 0.2)).toBe(0.3);
    expect(stepQty(2.35, -1)).toBe(1.35);
  });

  it('canStepDown only when minus would land at 1 or more', () => {
    expect(canStepDown(2)).toBe(true);
    expect(canStepDown(1)).toBe(false);
    expect(canStepDown(1.99)).toBe(false);
  });
});
