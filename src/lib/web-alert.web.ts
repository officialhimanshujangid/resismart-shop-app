import { Alert, type AlertButton } from 'react-native';
import i18n from 'i18next';

const t = (k: string): string => { const v = i18n.t(k); return typeof v === 'string' && v && v !== k ? v : 'OK'; };

/**
 * Web build of `Alert.alert`.
 *
 * react-native-web ships `Alert.alert` as a no-op, so every confirm in the app
 * ("Retire this slot?", "Delete this block?", …) silently did nothing when the
 * app ran in a browser: the button looked dead. Rather than touch every screen,
 * this swaps in a web dialog once, at start-up. Metro picks this file over
 * `web-alert.ts` only when bundling for web; phones are unchanged.
 *
 * 11-06 overnight — it used to call the browser's own `alert` / `confirm`, and a
 * choice of several actions ("Take photo / Choose from gallery / Cancel") was
 * offered as a CHAIN of OK/Cancel boxes, one per action: confusing, unstyled,
 * and the page froze until each was answered (every photo picker in the app).
 * Now it is one in-page sheet with a real button per action, the app's colours,
 * dark mode, Esc / backdrop = cancel, focus on the first action, and a short
 * rise animation that respects reduced motion.
 */
type Btn = AlertButton & { text?: string };

// This app follows the phone / computer theme, so the sheet does too.
const isDark = () => {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
};
const reduceMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

function webAlert(title: string, message?: string, buttons?: Btn[]): void {
  if (typeof document === 'undefined') return;
  const list: Btn[] = buttons && buttons.length ? buttons : [{ text: t('common.ok') }];
  const cancel = list.find((b) => b.style === 'cancel');
  const actions = list.filter((b) => b !== cancel);
  const dark = isDark();
  const ink = dark ? '#E8ECF8' : '#0F172A';
  const soft = dark ? '#A7B0C8' : '#475569';
  const card = dark ? '#121A2E' : '#FFFFFF';
  const line = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
  const brand = dark ? '#6F8DFF' : '#3B5BDB';
  const danger = dark ? '#FF7A7A' : '#D92D20';

  const prevFocus = document.activeElement as HTMLElement | null;
  const root = document.createElement('div');
  root.setAttribute('data-testid', 'web-alert');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;'
    + `background:${dark ? 'rgba(2,6,18,0.62)' : 'rgba(15,23,42,0.38)'};opacity:0;transition:opacity 160ms ease-out;`;

  const box = document.createElement('div');
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', title);
  box.style.cssText = `width:100%;max-width:360px;background:${card};color:${ink};border-radius:22px;padding:20px 18px 14px;`
    + `box-shadow:0 24px 60px rgba(2,6,23,0.28);border:1px solid ${line};font-family:inherit;`
    + `transform:${reduceMotion() ? 'none' : 'translateY(14px) scale(0.98)'};transition:transform 220ms cubic-bezier(.2,.8,.2,1);`;

  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText = 'font-size:17px;font-weight:700;line-height:1.3;margin:0 2px 6px;';
  box.appendChild(h);
  if (message) {
    const p = document.createElement('div');
    p.textContent = message;
    p.style.cssText = `font-size:14px;line-height:1.45;color:${soft};margin:0 2px 4px;white-space:pre-line;`;
    box.appendChild(p);
  }

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:14px;';
  box.appendChild(row);

  let closed = false;
  const close = (b?: Btn) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    try { prevFocus?.focus?.(); } catch { /* element gone */ }
    b?.onPress?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(cancel); }
  };

  const make = (b: Btn, kind: 'primary' | 'plain' | 'danger' | 'cancel') => {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = b.text ?? t('common.ok');
    const bg = kind === 'primary' ? brand : 'transparent';
    const fg = kind === 'primary' ? '#FFFFFF' : kind === 'danger' ? danger : kind === 'cancel' ? soft : brand;
    const border = kind === 'primary' ? brand : line;
    el.style.cssText = `min-height:46px;width:100%;border-radius:14px;border:1px solid ${border};background:${bg};color:${fg};`
      + 'font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;padding:10px 14px;transition:transform 90ms ease, opacity 120ms;';
    el.onpointerdown = () => { el.style.transform = 'scale(0.98)'; };
    el.onpointerup = el.onpointerleave = () => { el.style.transform = 'none'; };
    el.onclick = () => close(b);
    row.appendChild(el);
    return el;
  };

  // One action → it is the primary; several → each a plain choice (a destructive one in red).
  const first = actions.map((b) =>
    make(b, b.style === 'destructive' ? 'danger' : actions.length === 1 ? 'primary' : 'plain'))[0];
  if (cancel) make(cancel, 'cancel');

  root.addEventListener('click', (e) => { if (e.target === root && cancel) close(cancel); });
  root.appendChild(box);
  document.body.appendChild(root);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    box.style.transform = 'none';
    (first ?? row.querySelector('button'))?.focus?.();
  });
}

if (typeof window !== 'undefined') {
  Alert.alert = webAlert as typeof Alert.alert;
}

export {};
