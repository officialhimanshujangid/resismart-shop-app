/**
 * >>> SCANNER — Owner, Oct 2026: "it scanned ONE product in different ways and
 * kept ADDING it again and again". The normaliser / checksum / type routing in
 * `features/scanner/scanCore.ts`, the gate's duplicate lock, and the hook that
 * wires them to the camera.
 */
import { act, renderHook } from '@testing-library/react-native';
import {
  ScanGate, barcodeLookupKeys, canonicalBarcode, classifyScan, compressUpcA, expandUpcE,
  gtinCheckDigitOk, normaliseSymbology, sameBarcode,
} from '../features/scanner/scanCore';
import { useProductScanner } from '../features/scanner/useProductScanner';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

jest.mock('../features/scanner/useScanFeedback', () => ({
  useScanFeedback: () => ({ hit: jest.fn(), unknown: jest.fn() }),
}));
const mockLookup = jest.fn();
jest.mock('../features/scanner/api', () => ({
  lookupProductByBarcode: (code: string) => mockLookup(code),
}));

const MILK = '8901234567890'; // valid EAN-13
const UPCA = '036000291452'; // valid UPC-A
/** Append the GS1 mod-10 check digit. */
const withCheck = (body: string): string => {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return `${body}${(10 - (sum % 10)) % 10}`;
};

describe('normaliser', () => {
  it('validates GS1 check digits', () => {
    expect(gtinCheckDigitOk(MILK)).toBe(true);
    expect(gtinCheckDigitOk('8901234567891')).toBe(false);
    expect(gtinCheckDigitOk(UPCA)).toBe(true);
    expect(gtinCheckDigitOk('96385074')).toBe(true); // EAN-8
  });

  it('one UPC-A, every spelling → one canonical EAN-13', () => {
    for (const s of [UPCA, `0${UPCA}`, `00${UPCA}`, ` ${UPCA}\n`, `]E0${`0${UPCA}`}`]) {
      expect(canonicalBarcode(s)).toBe(`0${UPCA}`);
    }
    // iOS reports a UPC-A as type ean13 with the leading 0 stripped.
    expect(classifyScan(UPCA, 'ean13').code).toBe(`0${UPCA}`);
    expect(classifyScan(UPCA, 'upc_a').code).toBe(`0${UPCA}`);
    expect(sameBarcode(UPCA, `0${UPCA}`)).toBe(true);
  });

  it('expands UPC-E and keeps every legacy spelling in the lookup keys', () => {
    expect(expandUpcE('04252614')).toBe('042100005264');
    expect(compressUpcA('042100005264')).toBe('04252614');
    expect(classifyScan('04252614', 'upc_e').code).toBe('0042100005264');
    expect(barcodeLookupKeys('04252614')).toEqual(expect.arrayContaining(['04252614', '0042100005264', '042100005264']));
  });

  it('strips control bytes, AIM prefixes and reads a GS1-128 GTIN', () => {
    expect(canonicalBarcode(`\u0002${MILK}\r`)).toBe(MILK);
    expect(classifyScan(`]C101${'0'}${MILK}\u001d10BATCH7`, 'code128').code).toBe(MILK);
    expect(classifyScan(`01${'0'}${MILK}17261231`, 'code128').code).toBe(MILK);
    expect(canonicalBarcode('(01)08901234567890')).toBe(MILK);
    expect(canonicalBarcode('8901 2345 67890')).toBe(MILK);
    expect(canonicalBarcode('abc-12')).toBe('ABC-12');
    expect(normaliseSymbology('org.gs1.EAN-13')).toBe('ean13');
    expect(normaliseSymbology('UPC_A')).toBe('upca');
  });
});

describe('type routing', () => {
  it('a retail barcode is a product; a failed check digit is a misread', () => {
    expect(classifyScan(MILK, 'ean13').kind).toBe('product');
    expect(classifyScan('8901234567891', 'ean13').kind).toBe('invalid');
    expect(classifyScan('8901234567891').kind).toBe('invalid'); // keyboard-wedge read
    const typed = classifyScan('8901234567891', 'manual');
    expect(typed.kind).toBe('product');
    expect(typed.checksumWarning).toBe(true);
  });

  it('links, UPI, passes and 2D text are never products', () => {
    expect(classifyScan('https://shop.example/p/1', 'qr').kind).toBe('url');
    expect(classifyScan('www.example.com', 'code128').kind).toBe('url');
    expect(classifyScan('resismart-shop://order/1', 'qr').kind).toBe('url');
    expect(classifyScan('upi://pay?pa=shop@upi&am=10', 'qr').kind).toBe('upi');
    expect(classifyScan(`eyJ0IjoiZ3AiLCJjIjoiMTIzNDU2In0.${'A'.repeat(86)}`, 'qr').kind).toBe('pass');
    expect(classifyScan('BATCH 7 EXP 12/26', 'datamatrix').kind).toBe('unsupported');
    expect(classifyScan('HELLO', 'qr', { allowTwoD: true }).kind).toBe('product');
  });

  it('ITF-14: full + valid accepted on receiving screens, refused on billing; partial always invalid', () => {
    const recv = { allowItf: true };
    expect(classifyScan('123456', 'itf14', recv).kind).toBe('invalid');
    expect(classifyScan('0890123456789', 'itf14', recv).kind).toBe('invalid'); // 13 digits: partial, even if it checks
    expect(classifyScan(withCheck('1234567890123'), 'itf14', recv).kind).toBe('product');
    expect(classifyScan(`${withCheck('1234567890123').slice(0, 13)}${(Number(withCheck('1234567890123')[13]) + 1) % 10}`, 'itf14', recv).kind).toBe('invalid');
    // Indicator 0 = the same item as its GTIN-13 (GS1); indicator 1–8 = a case, its own 14-digit code.
    expect(classifyScan(`0${MILK}`, 'itf14', recv)).toMatchObject({ kind: 'product', code: MILK });
    const caseCode = withCheck(`1${MILK.slice(0, 12)}`);
    expect(classifyScan(caseCode, 'itf14', recv)).toMatchObject({ kind: 'product', code: caseCode });
    // Billing counter (no allowItf): a valid carton code is "not a product barcode", never added.
    expect(classifyScan(`0${MILK}`, 'itf14').kind).toBe('unsupported');
    expect(classifyScan('123456', 'itf14').kind).toBe('invalid');
  });
});

describe('gate', () => {
  const milk = classifyScan(MILK, 'ean13');
  const run = (g: ScanGate, from: number, to: number, step = 50, onAccept?: (t: number) => void) => {
    let n = 0;
    for (let t = from; t < to; t += step) {
      const d = g.offer(milk, 'camera', t);
      if (d.action === 'accept') { n += 1; onAccept?.(t); g.release(t + 20); }
    }
    return n;
  };

  it('10 rapid camera callbacks for one item → ONE accept', () => {
    expect(run(new ScanGate(), 0, 500)).toBe(1);
  });

  it('a pack held for 5 s, with a 600 ms glare flicker, is still one', () => {
    const g = new ScanGate();
    expect(run(g, 0, 2000)).toBe(1);
    expect(run(g, 2600, 5000)).toBe(0); // gap < settle → still the same presentation
  });

  it('nothing is accepted while the lookup is in flight, any code', () => {
    const g = new ScanGate();
    g.offer(milk, 'camera', 0);
    expect(g.offer(milk, 'camera', 50).action).toBe('accept');
    const other = classifyScan('96385074', 'ean8');
    for (let t = 1000; t < 3000; t += 50) expect(g.offer(other, 'camera', t).action).toBe('ignore');
    g.release(3000);
  });

  it('a deliberate re-scan after the cooldown is a second accept', () => {
    const g = new ScanGate();
    expect(run(g, 0, 300)).toBe(1);
    expect(run(g, 1200, 1500)).toBe(0); // re-presented too soon: cooldown
    expect(run(g, 2600, 3000)).toBe(1); // gap ≥ settle and ≥ 2 s after release
  });

  it('a non-product is reported once per presentation, not every frame', () => {
    const g = new ScanGate();
    const url = classifyScan('https://x.example', 'qr');
    const decisions = Array.from({ length: 10 }, (_, i) => g.offer(url, 'camera', i * 50).action);
    expect(decisions.filter((a) => a === 'reject')).toHaveLength(1);
  });

  it('USB reader: every trigger pull of the same code adds; only a <250 ms double-send is dropped', () => {
    const g = new ScanGate();
    const hid = classifyScan(MILK);
    let n = 0;
    for (const t of [0, 400, 800, 1200]) {
      if (g.offer(hid, 'hid', t).action === 'accept') { n += 1; g.release(t + 50); }
      expect(g.offer(hid, 'hid', t + 100).action).toBe('ignore'); // the reader double-sending
    }
    expect(n).toBe(4);
    // …but never while the previous lookup is in flight.
    expect(g.offer(hid, 'hid', 2000).action).toBe('accept');
    expect(g.offer(classifyScan(UPCA), 'hid', 2400).action).toBe('ignore');
  });

  it('stock count camera: the same code counts again 1 s after its add (2 s elsewhere)', () => {
    const count = new ScanGate({ cooldownMs: 1000 });
    const bill = new ScanGate();
    const present = (g: ScanGate, from: number, to: number) => {
      let n = 0;
      for (let t = from; t < to; t += 50) if (g.offer(milk, 'camera', t).action === 'accept') { n += 1; g.release(t + 20); }
      return n;
    };
    expect(present(count, 0, 200)).toBe(1);
    expect(present(bill, 0, 200)).toBe(1);
    // Tin lifted away, next tin shown at 1.2 s: counted on the stock count, not yet on billing.
    expect(present(count, 1200, 1400)).toBe(1);
    expect(present(bill, 1200, 1400)).toBe(0);
  });

  it('typed codes skip the cooldown — twice typed is two', () => {
    const g = new ScanGate();
    const typed = classifyScan(MILK, 'manual');
    expect(g.offer(typed, 'manual', 0).action).toBe('accept');
    expect(g.offer(typed, 'manual', 10).action).toBe('ignore'); // still in flight
    g.release(20);
    expect(g.offer(typed, 'manual', 30).action).toBe('accept');
  });

  it('after a pause, the code that fired last is held until it leaves the frame', () => {
    const g = new ScanGate();
    expect(run(g, 0, 200)).toBe(1);
    g.pause();
    g.resume(10_000);
    expect(run(g, 10_050, 11_000)).toBe(0); // still hovering over the same pack
    expect(g.offer(classifyScan('96385074', 'ean8'), 'camera', 11_000).action).toBe('ignore'); // confirming
    expect(g.offer(classifyScan('96385074', 'ean8'), 'camera', 11_050).action).toBe('accept');
  });
});

describe('useProductScanner (the camera callback)', () => {
  let now = 0;
  beforeEach(() => {
    now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockLookup.mockReset();
    mockLookup.mockImplementation(async (code: string) => ({ found: true, product: { _id: 'p1', name: 'Milk 1L', barcode: code } }));
  });
  afterEach(() => { (Date.now as jest.Mock).mockRestore?.(); });

  const frame = (data: string, type = 'ean13') => ({ data, type } as never);

  it('10 rapid callbacks (mixed UPC-A spellings) → 1 add; re-scan after the cooldown → qty +1', async () => {
    let qty = 0;
    const onResult = jest.fn((o: { status: string }) => { if (o.status === 'found') qty += 1; });
    const { result } = await renderHook(() => useProductScanner({ enabled: true, onResult }));

    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        now = i * 40;
        // Android: 12-digit upc_a; iOS: ean13 with the 0 stripped; a reader: 13 digits.
        result.current.handleBarcodeScanned(frame(i % 2 ? UPCA : `0${UPCA}`, i % 3 ? 'upc_a' : 'ean13'));
      }
    });
    expect(qty).toBe(1);
    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(mockLookup).toHaveBeenCalledWith(`0${UPCA}`);

    // Still held for 3 s: nothing more.
    await act(async () => { for (now = 400; now < 3000; now += 50) result.current.handleBarcodeScanned(frame(UPCA, 'upc_a')); });
    expect(qty).toBe(1);

    // Lifted away for a second, shown again: the second tin.
    await act(async () => { for (now = 4000; now < 4200; now += 50) result.current.handleBarcodeScanned(frame(UPCA, 'upc_a')); });
    expect(qty).toBe(2);
    expect(mockLookup).toHaveBeenCalledTimes(2);
  });

  it('a URL QR is never looked up — one rejection, no add', async () => {
    const onResult = jest.fn();
    const onRejected = jest.fn();
    const { result } = await renderHook(() => useProductScanner({ enabled: true, onResult, onRejected, allowTwoD: false }));
    await act(async () => { for (now = 0; now < 500; now += 50) result.current.handleBarcodeScanned(frame('https://x.example/p', 'qr')); });
    expect(mockLookup).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected.mock.calls[0][0].reason).toBe('url');
  });

  it('a misread EAN (bad check digit) is silently dropped', async () => {
    const onResult = jest.fn();
    const onRejected = jest.fn();
    const { result } = await renderHook(() => useProductScanner({ enabled: true, onResult, onRejected }));
    await act(async () => { for (now = 0; now < 500; now += 50) result.current.handleBarcodeScanned(frame('8901234567891')); });
    expect(mockLookup).not.toHaveBeenCalled();
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('a carton ITF-14 is looked up on a receiving screen and refused on billing', async () => {
    const carton = `0${MILK}`;
    const recv = await renderHook(() => useProductScanner({ enabled: true, onResult: jest.fn(), allowItf: true }));
    await act(async () => { for (now = 0; now < 200; now += 50) recv.result.current.handleBarcodeScanned(frame(carton, 'itf14')); });
    expect(mockLookup).toHaveBeenCalledWith(MILK);
    mockLookup.mockClear();
    const onRejected = jest.fn();
    const bill = await renderHook(() => useProductScanner({ enabled: true, onResult: jest.fn(), onRejected }));
    await act(async () => { for (now = 5000; now < 5200; now += 50) bill.result.current.handleBarcodeScanned(frame(carton, 'itf14')); });
    expect(mockLookup).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected.mock.calls[0][0].reason).toBe('unsupported');
  });

  it('paused (a sheet is open) → nothing', async () => {
    const onResult = jest.fn();
    const { result } = await renderHook(() => useProductScanner({ enabled: false, onResult }));
    await act(async () => { for (now = 0; now < 500; now += 50) result.current.handleBarcodeScanned(frame(MILK)); });
    expect(mockLookup).not.toHaveBeenCalled();
  });
});

describe('strings', () => {
  it('every scanner message exists in en and hi', () => {
    const keys = ['scannedFound', 'scannedUnknown', 'addNew', 'addNewShort'] as const;
    for (const k of keys) {
      expect(en.components.scanner[k]).toBeTruthy();
      expect(hi.components.scanner[k]).toBeTruthy();
    }
    for (const r of ['url', 'upi', 'pass', 'unsupported', 'invalid'] as const) {
      expect(en.components.scanner.reject[r]).toBeTruthy();
      expect(hi.components.scanner.reject[r]).toBeTruthy();
    }
  });
});
