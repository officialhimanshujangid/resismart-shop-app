import { Alert, type AlertButton } from 'react-native';

/**
 * Web build of `Alert.alert`.
 *
 * react-native-web ships `Alert.alert` as a no-op, so every confirm in the app
 * ("Retire this slot?", "Delete this block?", …) silently did nothing when the
 * app ran in a browser: the button looked dead. Rather than touch every screen,
 * this swaps in the browser's own dialogs once, at start-up. Metro picks this
 * file over `web-alert.ts` only when bundling for web; phones are unchanged.
 *
 * The browser has only OK and OK/Cancel, so:
 *   - no buttons or one button → window.alert, then that button's onPress
 *   - one action + cancel      → window.confirm
 *   - several actions          → offered one at a time until one is accepted
 */
function webAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const text = [title, message].filter(Boolean).join('\n\n');
  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const cancel = buttons.find((b) => b.style === 'cancel');
  const actions = buttons.filter((b) => b !== cancel);
  if (actions.length === 1) {
    if (window.confirm(text)) actions[0].onPress?.();
    else cancel?.onPress?.();
    return;
  }
  for (const b of actions) {
    if (window.confirm(`${text}\n\n${b.text ?? ''}?`)) {
      b.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}

if (typeof window !== 'undefined') {
  Alert.alert = webAlert;
}

export {};
