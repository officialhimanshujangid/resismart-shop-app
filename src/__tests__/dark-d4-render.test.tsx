/**
 * DARK-D4 (2026-11-14) — shop pieces render dark when the phone is dark.
 *
 *  - The root navigator now gets a dark react-navigation theme (Expo Router's
 *    DefaultTheme painted #F2F2F2 behind cards without their own ground and in
 *    every fade); light stays DefaultTheme.
 *  - Kit Card (surface + warm) and IconButton with a badge: no white boxes.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { DefaultTheme } from '@react-navigation/native';

const mockScheme = { value: 'dark' as 'light' | 'dark' };
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme.value,
}));

import { Card } from '../components/ui/Card';
import { IconButton } from '../components/ui/IconButton';
import { navThemeFor } from '../theme/navTheme';

const LIGHT_GROUNDS = ['#FFFFFF', '#FFF', 'WHITE', '#F2F2F2', '#FFF4EF', '#F8FAFC'];

type J = { props?: Record<string, unknown>; children?: (J | string)[] | null } | null;
function backgrounds(node: J | J[] | string, out: string[] = []): string[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) { node.forEach((n) => backgrounds(n, out)); return out; }
  const bg = (StyleSheet.flatten(node.props?.style as never) as { backgroundColor?: string } | undefined)?.backgroundColor;
  if (typeof bg === 'string') out.push(bg.toUpperCase());
  (node.children ?? []).forEach((c) => backgrounds(c as J, out));
  return out;
}

afterEach(() => { mockScheme.value = 'dark'; });

describe('DARK-D4 shop — dark scheme', () => {
  it('nav theme is dark in dark and DefaultTheme in light', () => {
    const dark = navThemeFor(true);
    expect(dark.dark).toBe(true);
    expect(LIGHT_GROUNDS).not.toContain(dark.colors.background.toUpperCase());
    expect(LIGHT_GROUNDS).not.toContain(dark.colors.card.toUpperCase());
    expect(navThemeFor(false)).toBe(DefaultTheme);
  });

  it('Card (surface, warm) and IconButton with a badge have no white background', async () => {
    await render(
      <>
        <Card><Text>a</Text></Card>
        <Card tone="warm"><Text>b</Text></Card>
        <IconButton icon="bell-outline" accessibilityLabel="Alerts" badge={3} onPress={() => {}} />
      </>,
    );
    const bgs = backgrounds(screen.toJSON() as J);
    expect(bgs.length).toBeGreaterThan(0);
    expect(bgs.filter((b) => LIGHT_GROUNDS.includes(b))).toEqual([]);
  });
});
