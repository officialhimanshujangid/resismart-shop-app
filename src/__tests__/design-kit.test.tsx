/**
 * Phase D0 — the Design System v1 foundation (tokens, kit, floating tab bar,
 * dev gallery). Behaviour only: every piece renders in light AND dark and in
 * Hindi, presses reach their handlers, the tab bar emits the same events as the
 * default bar, and the colour contract that ~180 screens rely on holds.
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Colors, DarkColors } from '../constants/colors';
import { dsLight, heroSky, statusFor } from '../theme/tokens';
import {
  AreaChart,
  BottomCartBar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  FloatingTabBar,
  GlassCard,
  HeroHeader,
  IconButton,
  ListRow,
  ProductCard,
  Ring,
  SearchField,
  Segmented,
  ServiceTile,
  SkeletonList,
  StatusBadge,
  Storefront,
  TextField,
  ToastProvider,
  useToast,
} from '../components/ui';
import { renderScreen } from './setup/harness';

const mockScheme = { value: 'light' as 'light' | 'dark' };
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme.value,
}));

afterEach(() => {
  mockScheme.value = 'light';
});

describe('colour contract', () => {
  it('light and dark maps have the same keys', () => {
    expect(Object.keys(DarkColors).sort()).toEqual(Object.keys(Colors).sort());
  });

  it('every concatenable token is a 6-digit hex (screens build `${c.warning}1A`)', () => {
    for (const map of [Colors, DarkColors]) {
      for (const [k, v] of Object.entries(map)) {
        if (k === 'overlay' || k === 'shadow') continue;
        expect([k, /^#[0-9A-F]{6}$/i.test(v)]).toEqual([k, true]);
      }
    }
  });

  it('uses the approved shop green', () => {
    // COLOUR sweep (2026-10-06, rule 16): the approved accent #2E9C68 lives in
    // the DS tokens (`ds.primary`: rings, charts, icons). The LEGACY `primary`
    // that ~180 screens use as text and under white text moved to the DS
    // shop-deep #237A50 so it clears AA; see colour-contrast.test.ts.
    expect(dsLight.primary).toBe('#2E9C68');
    expect(Colors.primary).toBe(dsLight.primaryDeep);
    expect(DarkColors.primary).toBe('#3FB27B');
    // Owner 2026-10-06: the page ground is white (was #F2F8F4).
    expect(Colors.background).toBe('#FFFFFF');
  });

  // D0 final (Owner 2026-10-06): fills that carry white text, the success
  // green and the dark hero sky must clear WCAG AA (4.5:1).
  const lum = (hex: string) => {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it('primaryFill carries its on-colour at AA in both schemes', () => {
    expect(Colors.primaryFill).toBe('#1F7F55');
    expect(ratio(Colors.textInverse, Colors.primaryFill)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(DarkColors.textInverse, DarkColors.primaryFill)).toBeGreaterThanOrEqual(4.5);
  });

  it('success green passes on white and on its soft ground', () => {
    expect(ratio(Colors.success, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(statusFor(false).success.fg, statusFor(false).success.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark hero sky is a green night, white text readable on every stop', () => {
    expect(heroSky.dark).toEqual(['#04140D', '#0D3A26', '#1B6A45']);
    for (const stop of heroSky.dark) expect(ratio('#FFFFFF', stop)).toBeGreaterThanOrEqual(4.5);
  });
});

function Gallery({ onPress }: { onPress: () => void }) {
  return (
    <>
      <HeroHeader
        title="Good morning"
        eyebrow="Sunday"
        avatarText="SG"
        chips={[{ label: 'Open', live: true }, { label: 'UPI ready' }]}
        right={<IconButton icon="bell-outline" variant="glass" badge={2} accessibilityLabel="Alerts" onPress={onPress} />}
        illustration={({ width, height }) => <Storefront width={width} height={height} signText="SHARMA" />}
      />
      <GlassCard>
        <AreaChart values={[1, 3, 2, 5]} width={300} label="Sales" latestText="₹5" />
      </GlassCard>
      <Button label="Make bill" icon="receipt" onPress={onPress} testID="kit-primary" />
      <Button label="Soft" variant="soft" onPress={onPress} />
      <Button label="Busy" loading onPress={onPress} testID="kit-busy" />
      <Chip label="Dairy" selected onPress={onPress} />
      <StatusBadge label="Paid" tone="success" />
      <StatusBadge label="New" tone="brand" live />
      <Card tone="warm"><Text>warm</Text></Card>
      <ServiceTile label="Low stock" icon="alert" tint="coral" badge={3} onPress={onPress} testID="kit-tile" />
      <ListRow title="Bill #1" detail="UPI" amount="₹341" icon="receipt" onPress={onPress} />
      <Ring progress={0.66} label="Paid" />
      <SearchField value="mi" onChangeText={() => undefined} />
      <TextField label="Name" value="" onChangeText={() => undefined} error="Required" />
      <EmptyState title="Nothing yet" actionLabel="Add" onAction={onPress} />
      <ErrorState message="Server said no" onRetry={onPress} />
      <SkeletonList rows={1} />
    </>
  );
}

describe('kit renders in both schemes', () => {
  it.each(['light', 'dark'] as const)('%s', async (scheme) => {
    mockScheme.value = scheme;
    const onPress = jest.fn();
    await renderScreen(<Gallery onPress={onPress} />);
    expect(screen.getByText('Good morning')).toBeTruthy();
    expect(screen.getByText('Server said no')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('kit-primary'));
    await fireEvent.press(screen.getByTestId('kit-tile'));
    expect(onPress).toHaveBeenCalledTimes(2);
    // A loading button does not fire.
    await fireEvent.press(screen.getByTestId('kit-busy'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('Hindi: kit strings come from the catalogue', async () => {
    await renderScreen(<ErrorState onRetry={() => undefined} />, { lang: 'hi' });
    expect(screen.getByText('कुछ गड़बड़ हो गई')).toBeTruthy();
    expect(screen.getByText('फिर कोशिश करें')).toBeTruthy();
  });
});

describe('ProductCard', () => {
  it('shows + at zero and a stepper once added', async () => {
    const onAdd = jest.fn();
    const onRemove = jest.fn();
    const { rerender } = await renderScreen(
      <ProductCard name="Milk" priceText="₹28" art="milk" qty={0} onAdd={onAdd} onRemove={onRemove} />,
    );
    await fireEvent.press(screen.getByLabelText('Add Milk'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await rerender(<ProductCard name="Milk" priceText="₹28" art="milk" qty={2} onAdd={onAdd} onRemove={onRemove} />);
    await fireEvent.press(screen.getByLabelText('Remove one'));
    await fireEvent.press(screen.getByLabelText('Add one'));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(screen.getByText('2')).toBeTruthy();
  });
});

describe('Segmented + BottomCartBar', () => {
  it('reports the chosen segment and fires the one action', async () => {
    const onChange = jest.fn();
    const onAction = jest.fn();
    await renderScreen(
      <>
        <Segmented
          testID="seg"
          value="due"
          onChange={onChange}
          options={[{ key: 'due', label: 'Due', count: 3 }, { key: 'paid', label: 'Paid' }]}
        />
        <BottomCartBar amountText="₹341" caption="3 items" actionLabel="Make bill" onAction={onAction} />
      </>,
    );
    await fireEvent.press(screen.getByTestId('seg-paid'));
    expect(onChange).toHaveBeenCalledWith('paid');
    expect(screen.getByText('Due · 3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Make bill'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  function Shower() {
    const toast = useToast();
    return <Button label="go" onPress={() => toast.show({ message: 'Bill saved', tone: 'success' })} />;
  }
  it('shows a message from anywhere under the provider', async () => {
    await renderScreen(
      <ToastProvider>
        <Shower />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByText('go'));
    expect(await screen.findByText('Bill saved')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(screen.queryByText('Bill saved')).toBeNull();
  });
});

describe('FloatingTabBar', () => {
  const icon = () => null;
  const props = (index: number) => ({
    state: {
      index,
      routes: [
        { key: 'index-1', name: 'index' },
        { key: 'orders-1', name: 'orders' },
        { key: 'billing-1', name: 'billing' },
        { key: 'more-1', name: 'more' },
      ],
    },
    descriptors: {
      'index-1': { options: { title: 'Today', tabBarIcon: icon } },
      'orders-1': { options: { title: 'Orders', tabBarIcon: icon } },
      'billing-1': { options: { title: 'Billing', tabBarIcon: icon, tabBarBadge: 2 } },
      'more-1': { options: { title: 'More', tabBarIcon: icon, tabBarBadge: '99+' } },
    },
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
  });

  it('renders exactly the routes the navigator holds, label on the active one only', async () => {
    const p = props(0);
    await renderScreen(<FloatingTabBar {...(p as unknown as React.ComponentProps<typeof FloatingTabBar>)} />);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText('Orders')).toBeNull();
    expect(screen.getByLabelText('Billing (2)')).toBeTruthy();
    expect(screen.getByLabelText('More (99+)')).toBeTruthy();
    expect(screen.queryByTestId('tab-bookings')).toBeNull();
  });

  it('emits tabPress and navigates to an unfocused tab, like the default bar', async () => {
    const p = props(0);
    await renderScreen(<FloatingTabBar {...(p as unknown as React.ComponentProps<typeof FloatingTabBar>)} />);
    await fireEvent.press(screen.getByTestId('tab-orders'));
    expect(p.navigation.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'orders-1', canPreventDefault: true });
    expect(p.navigation.navigate).toHaveBeenCalledWith('orders', undefined);
    await fireEvent.press(screen.getByTestId('tab-index'));
    expect(p.navigation.navigate).toHaveBeenCalledTimes(1);
  });

  it('respects a prevented tabPress', async () => {
    const p = props(0);
    p.navigation.emit = jest.fn(() => ({ defaultPrevented: true }));
    await renderScreen(<FloatingTabBar {...(p as unknown as React.ComponentProps<typeof FloatingTabBar>)} />);
    await fireEvent.press(screen.getByTestId('tab-billing'));
    expect(p.navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('dev UI kit screen', () => {
  it('renders the gallery in dev', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DevUiKit = require('../../app/dev-ui-kit').default;
    await renderScreen(
      <ToastProvider>
        <DevUiKit />
      </ToastProvider>,
    );
    expect(screen.getByText('Good morning, Sharma ji')).toBeTruthy();
    expect(screen.getByText('UI kit')).toBeTruthy();
  });
});
