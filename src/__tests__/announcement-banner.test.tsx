// >>> OC6 — the platform announcement banner (web parity with AnnouncementMarquee).
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from './setup/harness';
import { setRoutes, fail } from './setup/mockApi';
import { AnnouncementBanner, announcementText } from '../components/AnnouncementBanner';

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

const data = (over: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    enabled: true, text: 'Maintenance tonight 11 PM', textHi: 'आज रात 11 बजे मेंटेनेंस',
    tone: 'info', startsAt: null, endsAt: null, updatedAt: '2026-10-03T10:00:00.000Z', ...over,
  },
});

describe('AnnouncementBanner (shop)', () => {
  it('shows the English text, and closes on the X', async () => {
    setRoutes({ 'GET /settings/announcement': data() });
    await renderScreen(<AnnouncementBanner />);
    expect(await screen.findByText('Maintenance tonight 11 PM')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close announcement'));
    expect(screen.queryByTestId('announcement-banner')).toBeNull();
  });

  it('picks the Hindi text when the app is in Hindi', async () => {
    setRoutes({ 'GET /settings/announcement': data({ updatedAt: '2026-10-03T11:00:00.000Z' }) });
    await renderScreen(<AnnouncementBanner />, { lang: 'hi' });
    expect(await screen.findByText('आज रात 11 बजे मेंटेनेंस')).toBeTruthy();
    expect(screen.getByLabelText('सूचना बंद करें')).toBeTruthy();
  });

  it('shows nothing when switched off, or when the read fails', async () => {
    setRoutes({ 'GET /settings/announcement': data({ enabled: false, updatedAt: '2026-10-03T12:00:00.000Z' }) });
    await renderScreen(<AnnouncementBanner />);
    await act(async () => {});
    expect(screen.queryByTestId('announcement-banner')).toBeNull();

    setRoutes({ 'GET /settings/announcement': fail(500) });
    await renderScreen(<AnnouncementBanner />);
    await act(async () => {});
    expect(screen.queryByTestId('announcement-banner')).toBeNull();
  });

  it('falls back to English when Hindi text is missing (older server)', () => {
    expect(announcementText({ enabled: true, text: 'Hello' }, 'hi')).toBe('Hello');
    expect(announcementText({ enabled: false, text: 'Hello' }, 'en')).toBe('');
  });
});
// <<< OC6
