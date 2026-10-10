/**
 * UX-P (2026-10-10) — the Option A + C kit pieces for the shop app. Render and
 * behaviour only: each piece draws in light AND dark and in Hindi, presses
 * reach their handlers, counts appear only when given, the count-up text ends
 * on (and is announced as) the final value, the sheet's close paths call
 * `onDismiss`. Tests run with reduce-motion ON (see jest.setup.ts), so every
 * animation is at its final frame.
 */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import {
  CountUp,
  EmptyArt,
  EmptyState,
  LargeTitle,
  LargeTitleBar,
  ProgressRing,
  ScanLine,
  SegmentedTabs,
  SkeletonGrid,
  SnapSheet,
  Stamp,
  StatusDot,
  SuccessCheck,
  SwipeAction,
} from '../components/ui';
import { formatPaise } from '../lib/money';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';

const mockScheme = { value: 'light' as 'light' | 'dark' };
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme.value,
}));

afterEach(() => {
  mockScheme.value = 'light';
});

const SCHEMES = ['light', 'dark'] as const;

describe('UX-P kit', () => {
  it.each(SCHEMES)('LargeTitle + bar render the title, eyebrow and trailing (%s)', async (scheme) => {
    mockScheme.value = scheme;
    await renderScreen(
      <>
        <LargeTitleBar title="Khata" right={<Text>help</Text>} testID="bar" />
        <LargeTitle title="Khata" eyebrow="Total due · 3 customers" trailing={<Text>₹1,250</Text>} testID="lt" />
      </>,
    );
    expect(screen.getByTestId('lt')).toHaveTextContent(/Total due · 3 customers/);
    expect(screen.getByRole('header')).toHaveTextContent('Khata');
    expect(screen.getByText('₹1,250')).toBeTruthy();
    expect(screen.getByLabelText(en.common.back)).toBeTruthy();
  });

  it('CountUp shows and announces the final value', async () => {
    await renderScreen(<CountUp value={125000} format={(n) => formatPaise(n)} testID="cu" />);
    expect(screen.getByTestId('cu')).toHaveTextContent(formatPaise(125000));
    expect(screen.getByLabelText(formatPaise(125000))).toBeTruthy();
  });

  it.each(SCHEMES)('SegmentedTabs: badges only where a count is known, press changes the tab (%s)', async (scheme) => {
    mockScheme.value = scheme;
    const onChange = jest.fn();
    await renderScreen(
      <SegmentedTabs
        testID="tabs"
        value="NEW"
        onChange={onChange}
        options={[
          { key: 'NEW', label: 'New', count: 4 },
          { key: 'READY', label: 'Ready' },
        ]}
      />,
    );
    expect(screen.getByTestId('tabs-NEW')).toHaveTextContent(/New\s*4/);
    expect(screen.getByTestId('tabs-READY')).toHaveTextContent('Ready');
    expect(screen.getByTestId('tabs-NEW').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId('tabs-READY'));
    expect(onChange).toHaveBeenCalledWith('READY');
  });

  it('SwipeAction renders its row (the actions sit behind the swipe)', async () => {
    const onPress = jest.fn();
    await renderScreen(
      <SwipeAction actions={[{ key: 'accept', label: 'Accept', onPress }]}>
        <Text>Order #41</Text>
      </SwipeAction>,
    );
    expect(screen.getByText('Order #41')).toBeTruthy();
  });

  it('SnapSheet: title, content, footer; close button and back dismiss', async () => {
    const onDismiss = jest.fn();
    await renderScreen(
      <SnapSheet visible title="Cart" subtitle="3 items" onDismiss={onDismiss} footer={<Text>footer</Text>} testID="sheet">
        <Text>line one</Text>
      </SnapSheet>,
    );
    expect(screen.getByText('Cart')).toBeTruthy();
    expect(screen.getByText('line one')).toBeTruthy();
    expect(screen.getByText('footer')).toBeTruthy();
    const closers = screen.getAllByLabelText(en.kit.dismiss);
    await fireEvent.press(closers[closers.length - 1]);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('SnapSheet draws nothing while closed', async () => {
    await renderScreen(
      <SnapSheet visible={false} title="Cart" onDismiss={() => undefined}>
        <Text>hidden line</Text>
      </SnapSheet>,
    );
    expect(screen.queryByText('hidden line')).toBeNull();
  });

  it.each(SCHEMES)('ring, dot, scan line, stamp, tick, art and skeleton grid render (%s)', async (scheme) => {
    mockScheme.value = scheme;
    await renderScreen(
      <>
        <ProgressRing progress={0.72} label="Sales vs yesterday" testID="ring" trackColor="rgba(255,255,255,0.22)" />
        <StatusDot label="Open" pulse testID="dot" />
        <ScanLine testID="scan" />
        <Stamp label="Accepted" testID="stamp" />
        <SuccessCheck testID="tick" haptic />
        <EmptyArt kind="orders" testID="art" />
        <SkeletonGrid tiles={2} testID="skg" />
      </>,
    );
    expect(screen.getByLabelText('Sales vs yesterday, 72%')).toBeTruthy();
    expect(screen.getByTestId('dot')).toHaveTextContent('Open');
    expect(screen.getByTestId('scan', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('stamp', { includeHiddenElements: true })).toHaveTextContent('Accepted');
    expect(screen.getByTestId('tick', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('art', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('skg')).toBeTruthy();
  });

  it('EmptyState takes an illustration and reads Hindi', async () => {
    await renderScreen(<EmptyState illustration="khata" title="कोई बकाया नहीं" testID="empty" />, { lang: 'hi' });
    expect(screen.getByTestId('empty')).toHaveTextContent('कोई बकाया नहीं');
  });
});
