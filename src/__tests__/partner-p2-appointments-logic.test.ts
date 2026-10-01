/**
 * APPOINTMENTS pure rules (CONTRACT-partner-P2 §9): the booking grid drawn
 * from the weekly schedule (there is no partner slots endpoint), the "Now"
 * slot, the per-person day sections and the request bodies.
 */
import {
  blockRangeOn, currentSlot, gridSlots, packageBody, packagesForService, pickableSlots, seriesBody, staffSections, timeOffBody,
  timeOffByStaff, walkInBody,
} from '../features/appointments/logic';
import type { AvailabilityRow } from '../features/availability/types';
import type { CalendarView } from '../features/appointments/types';

const open = (day: number) => ({
  day, isOpen: true, windows: [{ from: '09:00', to: '13:00' }, { from: '14:00', to: '18:00' }], slotMin: 30, capacityPerSlot: 1,
});
const AV: AvailabilityRow = {
  _id: 'av1', staffId: null, timezone: 'Asia/Kolkata',
  weekly: [{ ...open(0), isOpen: false, windows: [] }, open(1), open(2), open(3), open(4), open(5), open(6)],
  breaks: [{ day: 4, from: '11:00', to: '11:30' }],
  blackoutDates: ['2026-10-02T00:00:00.000Z'],
  advanceBookingDays: 30, cutoffMin: 30, isActive: true,
};
// 2026-10-01 is a Thursday (weekday 4); 10-02 a blackout Friday; 10-04 a Sunday.
const THU = '2026-10-01';
const at = (istHHmm: string, day = THU) => new Date(`${day}T${istHHmm}:00+05:30`);

describe('gridSlots', () => {
  it('steps each window by slotMin and skips a start that runs into the break', () => {
    expect(gridSlots(AV, THU)).toEqual([
      '09:00', '09:30', '10:00', '10:30', '11:30', '12:00', '12:30',
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    ]);
  });
  it('a longer service must end inside the window and clear the break', () => {
    expect(gridSlots(AV, THU, 60)).toEqual([
      '09:00', '09:30', '10:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
    ]);
  });
  it('breaks only apply to their own weekday', () => {
    expect(gridSlots(AV, '2026-09-30')).toContain('11:00');
  });
  it('nothing on a closed weekday, a blackout date, a switched-off or missing schedule', () => {
    expect(gridSlots(AV, '2026-10-04')).toEqual([]);
    expect(gridSlots(AV, '2026-10-02')).toEqual([]);
    expect(gridSlots({ ...AV, isActive: false }, THU)).toEqual([]);
    expect(gridSlots(null, THU)).toEqual([]);
  });
});

describe('currentSlot / pickableSlots', () => {
  it('the slot running now', () => {
    expect(currentSlot(AV, at('10:40'))).toBe('10:30');
    expect(currentSlot(AV, at('09:00'))).toBe('09:00');
    expect(currentSlot(AV, at('17:59'))).toBe('17:30');
  });
  it('none in a break, at lunch, after closing, on a closed day or a blackout', () => {
    expect(currentSlot(AV, at('11:10'))).toBeNull();
    expect(currentSlot(AV, at('13:30'))).toBeNull();
    expect(currentSlot(AV, at('18:10'))).toBeNull();
    expect(currentSlot(AV, at('10:40', '2026-10-04'))).toBeNull();
    expect(currentSlot(AV, at('10:40', '2026-10-02'))).toBeNull();
  });
  it('today keeps the running slot and later ones; a later day all; a past day none', () => {
    const now = at('10:40');
    expect(pickableSlots(AV, THU, now).slice(0, 3)).toEqual(['10:30', '11:30', '12:00']);
    expect(pickableSlots(AV, '2026-10-03', now)).toHaveLength(16);
    expect(pickableSlots(AV, '2026-09-30', now)).toEqual([]);
  });
});

describe('staffSections', () => {
  const view: CalendarView = {
    timezone: 'Asia/Kolkata',
    staff: [{ id: 's1', name: 'Asha', canTakeBookings: true }, { id: 's2', name: 'Ravi', canTakeBookings: true }],
    days: [{
      day: THU,
      byStaff: [
        { staffId: null, bookings: [], timeOff: [] },
        {
          staffId: 's1',
          bookings: [
            { id: 'b2', code: 'B2', slotStart: '2026-10-01T06:00:00.000Z', slotEnd: '2026-10-01T06:30:00.000Z', occupiesUntil: '2026-10-01T06:30:00.000Z', status: 'ACCEPTED', customerName: 'Late' },
            { id: 'b1', code: 'B1', slotStart: '2026-10-01T04:00:00.000Z', slotEnd: '2026-10-01T04:30:00.000Z', occupiesUntil: '2026-10-01T04:30:00.000Z', status: 'ACCEPTED', customerName: 'Early' },
          ],
          timeOff: [{ id: 'o1', from: '2026-10-01T08:30:00.000Z', to: '2026-10-01T12:30:00.000Z' }],
        },
        { staffId: 's2', bookings: [], timeOff: [] },
      ],
    }],
  };
  it('one section per person, bookings by time; an empty day is "free"; an empty Not assigned is left out', () => {
    const s = staffSections(view, THU, 'ALL', 'Not assigned');
    expect(s.map((x) => x.key)).toEqual(['s1', 's2']);
    expect(s[0].bookings.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(s[1].free).toBe(true);
  });
  it('filters to one person, or to Not assigned', () => {
    expect(staffSections(view, THU, 's2', 'Not assigned').map((x) => x.key)).toEqual(['s2']);
    expect(staffSections(view, THU, 'NONE', 'Not assigned').map((x) => x.key)).toEqual(['none']);
  });
  it('a time-off block is shown for its part of the day', () => {
    expect(blockRangeOn({ from: '2026-10-01T08:30:00.000Z', to: '2026-10-01T12:30:00.000Z' }, THU)).toEqual({ from: '14:00', to: '18:00' });
    expect(blockRangeOn({ from: '2026-09-30T08:30:00.000Z', to: '2026-10-02T04:30:00.000Z' }, THU)).toEqual({ from: '00:00', to: '24:00' });
  });
  it('upcoming time off grouped by person in staff order', () => {
    const g = timeOffByStaff([
      { id: 'x', staffId: 's2', from: '2026-10-03T04:00:00Z', to: '2026-10-03T08:00:00Z', createdByName: 'o', createdAt: '' },
      { id: 'y', staffId: 's1', from: '2026-10-05T04:00:00Z', to: '2026-10-05T08:00:00Z', createdByName: 'o', createdAt: '' },
    ], view.staff);
    expect(g.map((x) => x.name)).toEqual(['Asha', 'Ravi']);
  });
});

describe('packagesForService', () => {
  const pk = [
    { id: 'a', serviceIds: ['sv1'] },
    { id: 'b', serviceIds: ['sv2'] },
    { id: 'c' },
  ];
  it('keeps packages covering the service, and any without serviceIds (older backend)', () => {
    expect(packagesForService(pk, 'sv1').map((p) => p.id)).toEqual(['a', 'c']);
  });
  it('no service picked yet → all', () => {
    expect(packagesForService(pk, undefined).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(packagesForService(undefined, 'sv1')).toEqual([]);
  });
});

describe('bodies', () => {
  it('walk-in: IST instant, optional keys only when set, a home visit needs an address', () => {
    const out = walkInBody({ partyId: 'p', serviceId: 's', mode: 'AT_PARTNER', day: THU, time: '10:30', notifyCustomer: true });
    expect(out).toEqual({ body: { partyId: 'p', serviceId: 's', slotStart: '2026-10-01T10:30:00+05:30', mode: 'AT_PARTNER', notifyCustomer: true } });
    expect(walkInBody({ partyId: 'p', serviceId: 's', mode: 'AT_CUSTOMER', day: THU, time: '10:30', notifyCustomer: false }))
      .toEqual({ problem: 'needAddress' });
    const home = walkInBody({
      partyId: 'p', serviceId: 's', mode: 'AT_CUSTOMER', day: THU, time: '10:30', notifyCustomer: false,
      partyAddress: { line1: 'Flat 4, Rose Apts', pincode: '12' }, staffId: 's1', packagePurchaseId: 'pp',
    });
    expect(home).toEqual({ body: expect.objectContaining({ address: { line1: 'Flat 4, Rose Apts' }, staffId: 's1', packagePurchaseId: 'pp' }) });
    expect(walkInBody({ serviceId: 's', mode: 'AT_PARTNER', day: THU, time: '10:30', notifyCustomer: true })).toEqual({ problem: 'needCustomer' });
    expect(walkInBody({ partyId: 'p', serviceId: 's', mode: 'AT_PARTNER', day: THU, notifyCustomer: true })).toEqual({ problem: 'needTime' });
  });

  it('time off: must end after it starts, at most 31 days', () => {
    expect(timeOffBody({ staffId: 's1', fromDay: THU, fromTime: '14:00', toDay: THU, toTime: '18:00', reason: ' Doctor ' }))
      .toEqual({ body: { staffId: 's1', from: '2026-10-01T14:00:00+05:30', to: '2026-10-01T18:00:00+05:30', reason: 'Doctor' } });
    expect(timeOffBody({ staffId: 's1', fromDay: THU, fromTime: '18:00', toDay: THU, toTime: '14:00' })).toEqual({ problem: 'badRange' });
    expect(timeOffBody({ staffId: 's1', fromDay: THU, fromTime: '10:00', toDay: '2026-11-05', toTime: '10:00' })).toEqual({ problem: 'tooLong' });
    expect(timeOffBody({ fromDay: THU, fromTime: '10:00', toDay: THU, toTime: '11:00' })).toEqual({ problem: 'needStaff' });
  });

  it('series: weekdays sorted, 1–3; exactly one of count / endDate', () => {
    const base = {
      partyId: 'p', serviceId: 's', mode: 'AT_PARTNER' as const, weekdays: [4, 1], time: '10:00', interval: 2, startDate: THU,
    };
    const byCount = seriesBody({ ...base, endBy: 'COUNT', count: 8, endDate: '2026-12-01' });
    expect(byCount).toEqual({ body: {
      partyId: 'p', serviceId: 's', mode: 'AT_PARTNER', rule: { freq: 'WEEKLY', interval: 2, weekdays: [1, 4], time: '10:00' },
      startDate: THU, count: 8,
    } });
    const byDate = seriesBody({ ...base, endBy: 'DATE', count: 8, endDate: '2026-12-01' });
    expect(byDate).toEqual({ body: expect.objectContaining({ endDate: '2026-12-01' }) });
    expect('count' in (byDate as { body: object }).body).toBe(false);
    expect(seriesBody({ ...base, weekdays: [1, 2, 3, 4], endBy: 'COUNT', count: 8 })).toEqual({ problem: 'needWeekdays' });
    expect(seriesBody({ ...base, endBy: 'COUNT', count: 53 })).toEqual({ problem: 'countRange' });
    expect(seriesBody({ ...base, endBy: 'DATE', endDate: '2026-09-01' })).toEqual({ problem: 'endBeforeStart' });
  });

  it('package: bounds, SAC only when given', () => {
    const f = { name: ' Facial x5 ', serviceIds: ['a', 'a', 'b'], sessions: 5, pricePaise: 250000, validityDays: 90, taxRatePercent: 18, sac: '', isActive: true };
    expect(packageBody(f)).toEqual({ body: { name: 'Facial x5', serviceIds: ['a', 'b'], sessions: 5, pricePaise: 250000, validityDays: 90, taxRatePercent: 18, isActive: true } });
    expect(packageBody({ ...f, sessions: 1 })).toEqual({ problem: 'sessions' });
    expect(packageBody({ ...f, validityDays: 6 })).toEqual({ problem: 'validity' });
    expect(packageBody({ ...f, pricePaise: null })).toEqual({ problem: 'price' });
    expect(packageBody({ ...f, sac: '12' })).toEqual({ problem: 'sac' });
    expect(packageBody({ ...f, serviceIds: [] })).toEqual({ problem: 'services' });
  });
});
