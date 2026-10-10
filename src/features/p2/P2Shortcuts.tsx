import React from 'react';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../constants/colors';
import { usePartnerEntitlements } from '../../hooks';
import { ActionRow } from '../p1/ui';
import { Button } from '../../components/ui';
import { Rise } from '../../theme/motion';
import { categoryModulesOf, P2Module } from './modules';
import type { PartnerAccessModule, PartnerModule } from '../../types/api-contract.generated';

/**
 * Where each business-type module is reached from, and who may reach it. One
 * table read by the More rows AND the Today shortcuts, so the two can never
 * offer a door the other hides (and neither offers one the `_layout.tsx` gate
 * would bounce). Nothing here for a business that never switched one on.
 */
export interface P2Door {
  key: string;
  module: P2Module;
  base: readonly PartnerModule[];
  href: Href;
  icon: string;
  labelKey: string;
  blurbKey: string;
  /** Any one of these opens the door. */
  anyOf: readonly [PartnerAccessModule, 'READ' | 'FULL'][];
  /** A Today shortcut too (the daily job, not the set-up screens). */
  today?: boolean;
}

export const P2_DOORS: readonly P2Door[] = [
  {
    key: 'DELIVERIES', module: 'SUBSCRIPTIONS', base: ['INVOICING'], href: '/subscriptions/deliveries' as Href,
    icon: 'truck-delivery-outline', labelKey: 'p2.doors.deliveries', blurbKey: 'p2.doors.deliveriesBlurb',
    anyOf: [['DELIVERIES_MARK', 'FULL'], ['SUBSCRIPTIONS_VIEW', 'READ']], today: true,
  },
  {
    key: 'ATTENDANCE', module: 'SUBSCRIPTIONS', base: ['INVOICING'], href: '/subscriptions/attendance' as Href,
    icon: 'account-check-outline', labelKey: 'p2.doors.attendance', blurbKey: 'p2.doors.attendanceBlurb',
    anyOf: [['ATTENDANCE_MARK', 'FULL']], today: true,
  },
  {
    key: 'SUBSCRIPTIONS', module: 'SUBSCRIPTIONS', base: ['INVOICING'], href: '/subscriptions' as Href,
    icon: 'calendar-sync-outline', labelKey: 'p2.doors.subscriptions', blurbKey: 'p2.doors.subscriptionsBlurb',
    anyOf: [['SUBSCRIPTIONS_VIEW', 'READ']],
  },
  {
    key: 'PHARMACY', module: 'PHARMACY', base: ['CATALOG'], href: '/pharmacy' as Href,
    icon: 'pill', labelKey: 'p2.doors.pharmacy', blurbKey: 'p2.doors.pharmacyBlurb',
    anyOf: [['PHARMACY_VIEW', 'READ'], ['RX_REGISTER', 'READ']],
  },
  {
    key: 'NEAR_EXPIRY', module: 'PHARMACY', base: ['CATALOG'], href: '/pharmacy/near-expiry' as Href,
    icon: 'calendar-alert', labelKey: 'p2.doors.nearExpiry', blurbKey: 'p2.doors.nearExpiryBlurb',
    anyOf: [['PHARMACY_VIEW', 'READ']], today: true,
  },
  {
    key: 'APPOINTMENTS', module: 'APPOINTMENTS', base: ['BOOKINGS'], href: '/appointments' as Href,
    icon: 'calendar-account-outline', labelKey: 'p2.doors.appointments', blurbKey: 'p2.doors.appointmentsBlurb',
    anyOf: [['BOOKINGS_VIEW', 'READ']], today: true,
  },
  {
    key: 'JOBS', module: 'JOBS', base: ['BOOKINGS', 'INVOICING'], href: '/jobs' as Href,
    icon: 'hammer-wrench', labelKey: 'p2.doors.jobs', blurbKey: 'p2.doors.jobsBlurb',
    anyOf: [['BOOKINGS_VIEW', 'READ']], today: true,
  },
];

/** The doors this person may open, in table order. `[]` until entitlements land. */
export function useP2Doors(): P2Door[] {
  const { ready, can, hasModule, entitlements } = usePartnerEntitlements();
  if (!ready) return [];
  const on = categoryModulesOf(entitlements);
  if (!on.length) return [];
  return P2_DOORS.filter((d) => on.includes(d.module)
    && d.base.every((m) => hasModule(m))
    && d.anyOf.some(([m, level]) => can(m, level)));
}

/**
 * Today's quick buttons for the daily P2 work (deliveries, attendance, expiry, diary, jobs).
 *
 * M04-H redesign: DS v1 kit `Button`s (soft, small) in a wrapping row. They were
 * `PillButton`s with the first one filled — white on `c.primary` `#2E9C68` is
 * 3.46:1 (below AA) and its label was cut to one line ("…" in Hindi). Today's
 * single primary action is "New bill" on the sales card, so these are all the
 * secondary-soft look. Same doors, same gates, same testIDs.
 */
export function P2TodayShortcuts(_props: { c: ColorScheme }) {
  const { t } = useTranslation();
  const doors = useP2Doors().filter((d) => d.today);
  if (!doors.length) return null;
  return (
    <Rise index={4}>
      <ActionRow>
        {doors.map((d) => (
          <Button
            key={d.key}
            variant="soft"
            size="sm"
            icon={d.icon}
            label={t(d.labelKey)}
            onPress={() => router.push(d.href)}
            testID={`p2-today-${d.key}`}
          />
        ))}
      </ActionRow>
    </Rise>
  );
}
