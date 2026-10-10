import React from 'react';
import { IconButton } from 'react-native-paper';
import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../constants/colors';
import { IconButton as KitIconButton } from '../../components/ui';

/**
 * The "?" that opens Help for the screen it sits on.
 *
 * Opens Help with the pathname of the screen it was tapped on, so the Help
 * screen can lead with the articles for THAT screen (`GET /help/route`). The
 * pathname is expo-router's own — groups stripped, dynamic segments filled in
 * (`/parties/66f…`) — and the server matches by longest prefix, so a detail
 * screen still finds its list screen's help.
 *
 * One size everywhere (IconButton at 26, the back button's size in `Screen`):
 *   - `default` — in the shared `Screen` header and native stack headers;
 *   - `hero`    — top-right on the gradient `Hero`, white on a glass circle so
 *                 it reads on both the light and dark ramps;
 *   - `glass`   — M04-H: the DS v1 kit glass `IconButton` (44 dp, press scale)
 *                 for the redesigned `HeroHeader` sky (Today). Same label, same
 *                 destination.
 */
export function HelpButton({ c, variant = 'default' }: { c: ColorScheme; variant?: 'default' | 'hero' | 'glass' }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const open = () => router.push(`/help?from=${encodeURIComponent(pathname)}`);
  if (variant === 'glass') {
    return <KitIconButton icon="help-circle-outline" variant="glass" accessibilityLabel={t('help.openHelp')} onPress={open} />;
  }
  const onHero = variant === 'hero';
  return (
    <IconButton
      icon="help-circle-outline"
      size={26}
      iconColor={onHero ? '#FFFFFF' : c.primary}
      containerColor={onHero ? 'rgba(255,255,255,0.16)' : undefined}
      style={{ margin: 0 }}
      accessibilityLabel={t('help.openHelp')}
      onPress={open}
    />
  );
}
