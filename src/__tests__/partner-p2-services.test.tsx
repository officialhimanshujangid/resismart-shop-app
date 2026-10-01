/**
 * The P2 service fields (buffer, SAC, GST rate, repair job) on the service
 * form: hidden AND absent from the body while neither APPOINTMENTS nor JOBS is
 * on; sent (and cleared with `null` on edit) while one is.
 */
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen } from '@testing-library/react-native';

import { ServiceForm } from '../features/services/components/ServiceForm';
import { p2BodyPart, p2DraftFromRow, p2Problem } from '../features/services/p2Fields';
import type { PartnerServiceRow } from '../features/services/types';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';

const mockModules: { list: string[] } = { list: [] };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: () => true,
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: true, categoryModules: mockModules.list },
    roleLimits: {},
  }),
}));

type Dict = { [k: string]: string | Dict };
const tx = (path: string): string => String(path.split('.').reduce<unknown>((o, k) => (o as Dict | undefined)?.[k], en));

const ROW: PartnerServiceRow = {
  _id: 'sv1', name: 'Haircut', pricePaise: 20000, priceType: 'FIXED', durationMin: 30, modes: ['AT_PARTNER'],
  advancePaise: 0, visitChargePaise: 0, isActive: true, sortOrder: 0,
};
const TODAY_KEYS = [
  'advancePaise', 'capacityPerSlotOverride', 'categoryId', 'durationMin', 'isActive', 'modes', 'name',
  'priceType', 'pricePaise', 'sortOrder', 'visitChargePaise',
];

const renderForm = async (initial: PartnerServiceRow | null, onSubmit: jest.Mock) => renderScreen(
  <PaperProvider>
    <ServiceForm initial={initial} categories={[]} allowedModes={null} canManage submitLabel="Save service" submitting={false} onSubmit={onSubmit} />
  </PaperProvider>,
);

beforeEach(() => { mockModules.list = []; });

describe('Service form — P2 fields', () => {
  it('modules off: no P2 fields and today\'s body, key for key', async () => {
    const onSubmit = jest.fn();
    await renderForm({ ...ROW, bufferMin: 10, sac: '9983' }, onSubmit);
    expect(screen.queryByTestId('service-p2-fields')).toBeNull();
    await fireEvent.press(screen.getByText('Save service'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(Object.keys(JSON.parse(JSON.stringify(onSubmit.mock.calls[0][0]))).sort()).toEqual([...TODAY_KEYS].sort());
  });

  it('APPOINTMENTS on: buffer / SAC / GST shown and sent; no repair-job switch without JOBS', async () => {
    mockModules.list = ['APPOINTMENTS'];
    const onSubmit = jest.fn();
    await renderForm({ ...ROW, bufferMin: 10, sac: '9983' }, onSubmit);
    expect(screen.getByTestId('service-p2-fields')).toBeTruthy();
    expect(screen.queryByTestId('service-isjob')).toBeNull();
    await fireEvent.press(screen.getByLabelText(`+ ${tx('services.p2.buffer')}`));
    await fireEvent.press(screen.getByLabelText(`${tx('services.p2.tax')} 18%`));
    await fireEvent.press(screen.getByText('Save service'));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ bufferMin: 15, sac: '9983', taxRatePercent: 18 });
    expect('isJob' in onSubmit.mock.calls[0][0]).toBe(false);
  });

  it('JOBS on: the repair-job switch is sent; clearing a field on edit sends null', async () => {
    mockModules.list = ['JOBS'];
    const onSubmit = jest.fn();
    await renderForm({ ...ROW, taxRatePercent: 18 }, onSubmit);
    await fireEvent(screen.getByTestId('service-isjob'), 'valueChange', true);
    await fireEvent.press(screen.getByLabelText(`${tx('services.p2.tax')} ${tx('services.p2.taxNotSet')}`));
    await fireEvent.press(screen.getByText('Save service'));
    const body = onSubmit.mock.calls[0][0];
    expect(body).toMatchObject({ isJob: true, taxRatePercent: null });
    expect('bufferMin' in body).toBe(false);
    expect('sac' in body).toBe(false);
  });
});

describe('p2BodyPart / p2Problem', () => {
  const d = p2DraftFromRow(null);
  it('off → nothing, whatever the draft', () => {
    expect(p2BodyPart({ ...d, bufferMin: 15, isJob: true }, null, false, true)).toEqual({});
  });
  it('create → only the keys with a value, never null', () => {
    expect(p2BodyPart(d, null, true, true)).toEqual({});
    expect(p2BodyPart({ ...d, bufferMin: 10, sac: ' 9983 ', taxRatePercent: 0, isJob: true }, null, true, true))
      .toEqual({ bufferMin: 10, sac: '9983', taxRatePercent: 0, isJob: true });
    expect(p2BodyPart({ ...d, isJob: true }, null, true, false)).toEqual({});
  });
  it('edit → null clears what the service had', () => {
    const row: PartnerServiceRow = { ...ROW, bufferMin: 10, sac: '9983', taxRatePercent: 5, isJob: true };
    expect(p2BodyPart(d, row, true, true)).toEqual({ bufferMin: null, sac: null, taxRatePercent: null, isJob: null });
    expect(p2BodyPart(d, ROW, true, true)).toEqual({});
  });
  it('bounds', () => {
    expect(p2Problem({ ...d, sac: '12' }, true)).toBe('services.p2.sacInvalid');
    expect(p2Problem({ ...d, bufferMin: 125 }, true)).toBe('services.p2.bufferInvalid');
    expect(p2Problem({ ...d, sac: '12' }, false)).toBeNull();
  });
});
