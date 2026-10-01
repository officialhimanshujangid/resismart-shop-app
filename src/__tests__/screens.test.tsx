/**
 * Two screens with the api mocked:
 *  - BookingActionModal's completion-code panel: "Send a new code" is drawn
 *    only while the server says `canResend`, with tries / new codes left, and a
 *    resend refreshes those counts from the server's answer;
 *  - the Reviews list marks a moderator-HELD review with its badge.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { BookingActionModal } from '../features/bookings/components/BookingActionModal';
import type { CompletionCodeState, PartnerBookingView } from '../features/bookings/booking.types';
import ReviewsScreen from '../../app/(app)/reviews/index';
import type { ReviewPublicView } from '../features/reviews/types';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

// The reviews screen reads the partner's permissions; everyone here may reply.
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({ can: () => true, hasModule: () => true }),
}));

// ─────────────────────────────────────────────── completion code panel
const booking = (completionCode?: CompletionCodeState): PartnerBookingView => ({
  id: 'bk-1',
  code: 'BK-1001',
  status: 'IN_PROGRESS',
  mode: 'AT_CUSTOMER',
  serviceSnapshot: { name: 'AC service' },
  completionOtpSentAt: '2026-09-28T10:00:00.000Z',
  completionCode,
} as unknown as PartnerBookingView);

const renderModal = (b: PartnerBookingView, opts: { lang?: 'en' | 'hi'; onSubmit?: jest.Mock } = {}) =>
  renderScreen(
    <BookingActionModal
      visible
      verb="complete"
      booking={b}
      isDark={false}
      submitting={false}
      onDismiss={jest.fn()}
      onSubmit={opts.onSubmit ?? jest.fn()}
    />,
    { lang: opts.lang },
  );

const tries = (n: number) => (n === 1 ? en.bookings.code.triesLeft_one : en.bookings.code.triesLeft_other.replace('{{count}}', String(n)));
const newCodes = (n: number) => (n === 1 ? en.bookings.code.newCodesLeft_one : en.bookings.code.newCodesLeft_other.replace('{{count}}', String(n)));
/** The button's accessible name also carries Paper's icon glyph, so match the label inside it. */
const named = (label: string) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const sendNew = () => screen.queryByRole('button', { name: named(en.bookings.code.sendNew) });

describe('BookingActionModal — Send a new code', () => {
  it('canResend: the button is there and enabled, with tries and new codes left', async () => {
    await renderModal(booking({ attemptsLeft: 3, resendsLeft: 2, canResend: true }));
    expect(screen.getByText(tries(3))).toBeTruthy();
    expect(screen.getByText(newCodes(2))).toBeTruthy();
    expect(sendNew()).toBeTruthy();
    expect(sendNew()).toBeEnabled();
    expect(screen.getByText(en.bookings.code.sendNewHint)).toBeTruthy();
    expect(screen.queryByText(en.bookings.code.locked)).toBeNull();
  });

  it('pressing it posts resend-code and shows the server\'s fresh counts', async () => {
    setRoutes({
      'POST /partners/me/bookings/bk-1/resend-code': {
        success: true,
        data: { ...booking({ attemptsLeft: 5, resendsLeft: 1, canResend: true }) },
      },
    });
    await renderModal(booking({ attemptsLeft: 0, resendsLeft: 2, canResend: true }));
    // Locked: no tries left — the new code is the way out, and Complete is off.
    expect(screen.getByText(tries(0))).toBeTruthy();
    expect(screen.getByText(en.bookings.code.locked)).toBeTruthy();

    await fireEvent.press(sendNew()!);

    await waitFor(() => expect(screen.getByText(en.bookings.code.resent)).toBeTruthy());
    expect(callsTo('POST', '/partners/me/bookings/bk-1/resend-code')).toHaveLength(1);
    expect(screen.getByText(tries(5))).toBeTruthy();
    expect(screen.getByText(newCodes(1))).toBeTruthy();
    expect(screen.queryByText(en.bookings.code.locked)).toBeNull();
  });

  it('a RESEND_LIMIT refusal is said in place and the button goes away', async () => {
    setRoutes({
      'POST /partners/me/bookings/bk-1/resend-code': fail(409, { code: 'BOOKING_CODE_RESEND_LIMIT', error: 'server words' }),
    });
    await renderModal(booking({ attemptsLeft: 0, resendsLeft: 1, canResend: true }));
    await fireEvent.press(sendNew()!);
    await waitFor(() => expect(screen.getByText(en.errors.BOOKING_CODE_RESEND_LIMIT)).toBeTruthy());
    expect(sendNew()).toBeNull();
    expect(screen.getByText(newCodes(0))).toBeTruthy();
    expect(screen.getByText(en.bookings.code.noNewCodes)).toBeTruthy();
  });

  it('canResend false and no tries: no button, the stuck message instead', async () => {
    await renderModal(booking({ attemptsLeft: 0, resendsLeft: 0, canResend: false }));
    expect(sendNew()).toBeNull();
    expect(screen.getByText(tries(0))).toBeTruthy();
    expect(screen.getByText(en.bookings.code.noNewCodes)).toBeTruthy();
  });

  it('canResend false with tries left: no button and no stuck message', async () => {
    await renderModal(booking({ attemptsLeft: 4, resendsLeft: 0, canResend: false }));
    expect(sendNew()).toBeNull();
    expect(screen.getByText(tries(4))).toBeTruthy();
    expect(screen.queryByText(en.bookings.code.noNewCodes)).toBeNull();
  });

  it('in Hindi: the button and the one-try-left line are Hindi', async () => {
    await renderModal(booking({ attemptsLeft: 1, resendsLeft: 1, canResend: true }), { lang: 'hi' });
    expect(screen.getByRole('button', { name: named(hi.bookings.code.sendNew) })).toBeTruthy();
    expect(screen.getByText(hi.bookings.code.triesLeft_one.replace('{{count}}', '1'))).toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────── reviews
const review = (over: Partial<ReviewPublicView>): ReviewPublicView => ({
  _id: 'rv-1',
  partnerId: 'p-1',
  authorName: 'Priya N.',
  rating: 4,
  text: 'Quick and tidy.',
  moderationStatus: 'PUBLISHED',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  ...over,
});

describe('Reviews list', () => {
  it('a HELD review carries the badge; a published one does not', async () => {
    setRoutes({
      'GET /reviews/mine': {
        data: [
          review({ _id: 'rv-1', authorName: 'Priya N.', moderationStatus: 'HELD', text: 'Held text' }),
          review({ _id: 'rv-2', authorName: 'Ravi K.', moderationStatus: 'PUBLISHED', text: 'Published text' }),
        ],
        total: 2, page: 1, limit: 20,
      },
    });
    await renderScreen(<ReviewsScreen />);
    await waitFor(() => expect(screen.getByText('Held text')).toBeTruthy());
    expect(screen.getAllByText(en.reviews.held)).toHaveLength(1);
    expect(screen.getByText('Published text')).toBeTruthy();
    expect(callsTo('GET', '/reviews/mine')[0].params).toEqual({ page: 1, limit: 20 });
  });

  it('the HELD badge is Hindi for a Hindi reader', async () => {
    setRoutes({
      'GET /reviews/mine': { data: [review({ moderationStatus: 'HELD' })], total: 1, page: 1, limit: 20 },
    });
    await renderScreen(<ReviewsScreen />, { lang: 'hi' });
    await waitFor(() => expect(screen.getByText(hi.reviews.held)).toBeTruthy());
  });
});
