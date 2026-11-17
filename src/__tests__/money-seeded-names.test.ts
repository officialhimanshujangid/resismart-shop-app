/**
 * 11-06 deep QA (PAR-032) — seeded money names ("Rent", "Cash in shop") show in
 * the reader's language; a name the partner typed or renamed never changes.
 */
import { seededMoneyKey } from '../features/money/names';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const get = (o: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o);

describe('seeded money names', () => {
  it.each(['Rent', 'Electricity', 'Telephone/Internet', 'Miscellaneous', 'Cash in shop', 'Bank account'])(
    '%s has a Hindi and English label', (name) => {
      const key = seededMoneyKey(name);
      expect(key).toBeTruthy();
      expect(typeof get(hi, key!)).toBe('string');
      expect(typeof get(en, key!)).toBe('string');
      expect(get(hi, key!)).not.toBe(name);
    });

  it('leaves names the partner typed alone', () => {
    expect(seededMoneyKey('Shop rent')).toBeNull();
    expect(seededMoneyKey('Petty cash')).toBeNull();
    expect(seededMoneyKey('')).toBeNull();
    expect(seededMoneyKey(undefined)).toBeNull();
  });
});
