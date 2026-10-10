/**
 * M20 — the catalogue list's DS v1 hero (replaces the legacy hex `Hero`).
 * Renders in light and dark, shows the numbers (reduce-motion is on in tests, so
 * counts are final at once), the "Running low" tile toggles the filter, and the
 * words on the sky meet 4.5:1 in both modes.
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { CatalogueHero } from '../features/catalog/components/CatalogueHero';
import { dsDark, dsLight, heroSky } from '../theme/tokens';
import { renderScreen } from './setup/harness';

const mockScheme = { value: 'light' as 'light' | 'dark' };
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme.value,
}));
afterEach(() => { mockScheme.value = 'light'; });

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const props = (onLowPress = jest.fn()) => ({
  eyebrow: 'Your catalogue', total: 42, totalLabel: 'products', subtitle: 'Everything you sell',
  lowLabel: 'Running low', lowCount: 3, lowActive: false, onLowPress,
  categoriesLabel: 'Categories', categoryCount: 5,
});

describe('CatalogueHero', () => {
  it.each(['light', 'dark'] as const)('renders the numbers in %s and the low tile toggles the filter', async (scheme) => {
    mockScheme.value = scheme;
    const onLowPress = jest.fn();
    await renderScreen(<CatalogueHero {...props(onLowPress)} />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    fireEvent.press(screen.getByTestId('catalog-hero-low'));
    expect(onLowPress).toHaveBeenCalledTimes(1);
  });

  it('text on the sky is ≥ 4.5:1 (light: white on the button fill; dark: near-white on the night sky)', () => {
    expect(ratio(dsLight.onPrimary, dsLight.primaryFill)).toBeGreaterThanOrEqual(4.5);
    for (const stop of heroSky.dark) expect([stop, ratio(dsDark.ink, stop) >= 4.5]).toEqual([stop, true]);
  });
});
