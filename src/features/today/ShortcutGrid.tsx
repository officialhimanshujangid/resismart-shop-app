// >>> SHORTCUTS
import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../constants/colors';
import { usePartnerEntitlements } from '../../hooks';
import type { PartnerAccessModule, PartnerModule } from '../../types/api-contract.generated';
import { useCommerceAccess, type CommerceAccess } from '../commerce/access';

/**
 * The Shortcuts grid on Today — the jobs a shop does most, one tap each.
 *
 * Every tile carries the SAME gate its destination already applies (the
 * route's `_layout.tsx` plus the screen's own "may I do this" check), so a tile
 * is never a door that bounces back to Today or opens on a refusal. Bookings
 * and Orders are not here: they are bottom tabs, and a tile that repeats a tab
 * is a second path to the same screen. Labels are the words More and the
 * destination screens already use, so the tile, the menu and the screen title
 * agree. The web dashboard draws the same list with the same gates
 * (`frontend/src/components/partners/PartnerShortcuts.tsx`).
 *
 * Absorbs the P1 quick buttons (Add expense, Khata, Close the day) that used to
 * sit as a pill row lower down Today — one place for shortcuts, not two.
 */

export interface ShortcutTile {
  key: string;
  icon: string;
  labelKey: string;
  href: Href;
}

export interface ShortcutGateInput {
  ready: boolean;
  can: (m: PartnerAccessModule, level?: 'READ' | 'FULL') => boolean;
  hasModule: (m: PartnerModule) => boolean;
  commerce: CommerceAccess;
}

/**
 * Pure — the tiles this person may open, most-used first. `[]` until the
 * entitlements answer lands (fail closed, like the tab bar).
 */
export function shortcutTilesFor({ ready, can, hasModule, commerce }: ShortcutGateInput): ShortcutTile[] {
  if (!ready) return [];
  const invoicing = hasModule('INVOICING');
  const catalog = hasModule('CATALOG');
  // billing/_layout.tsx + payments/_layout.tsx: INVOICING + INVOICING_VIEW; the
  // new-bill and record-payment screens then refuse without INVOICING_MANAGE FULL.
  const sell = invoicing && can('INVOICING_VIEW', 'READ') && can('INVOICING_MANAGE', 'FULL');
  const tiles: (ShortcutTile & { show: boolean })[] = [
    { key: 'NEW_BILL', icon: 'receipt-text-plus-outline', labelKey: 'billing.list.newInvoice', href: '/billing/new', show: sell },
    { key: 'RECORD_PAYMENT', icon: 'cash-plus', labelKey: 'payments.new.title', href: '/payments/new', show: sell },
    // catalog/_layout.tsx (CATALOG + CATALOG_VIEW) and catalog/create.tsx (CATALOG_MANAGE FULL).
    { key: 'ADD_PRODUCT', icon: 'package-variant-plus', labelKey: 'catalog.list.addProduct', href: '/catalog/create', show: catalog && can('CATALOG_VIEW', 'READ') && can('CATALOG_MANAGE', 'FULL') },
    // khata/_layout.tsx.
    { key: 'KHATA', icon: 'notebook-outline', labelKey: 'more.rows.khata', href: '/khata', show: invoicing && can('CUSTOMERS', 'READ') },
    // money/_layout.tsx + money/expense.tsx (EXPENSES_MANAGE FULL); EXPENSES_VIEW too,
    // because the web expenses page will not open without it.
    { key: 'ADD_EXPENSE', icon: 'cash-minus', labelKey: 'money.addExpense', href: '/money/expense', show: invoicing && can('EXPENSES_VIEW', 'READ') && can('EXPENSES_MANAGE', 'FULL') },
    // stock/_layout.tsx (CATALOG + STOCK_VIEW; a count-only role has no stock levels to look at).
    { key: 'STOCK', icon: 'package-variant', labelKey: 'more.rows.stock', href: '/stock', show: catalog && can('STOCK_VIEW', 'READ') },
    // parties/_layout.tsx — CUSTOMERS only, no module lock (see its header).
    { key: 'PARTIES', icon: 'account-group-outline', labelKey: 'more.rows.parties', href: '/parties', show: can('CUSTOMERS', 'READ') },
    // The More "Grow your shop" door's own gate (commerceDoors): feature OFFERS on + CATALOG + OFFERS_VIEW.
    { key: 'OFFERS', icon: 'ticket-percent-outline', labelKey: 'commerce.doors.offers', href: '/commerce/offers' as Href, show: commerce.has('OFFERS') && commerce.offers.canView },
    // money/_layout.tsx (ACCOUNTS READ) + day-close.tsx's close button (INVOICING_MANAGE FULL).
    { key: 'DAY_CLOSE', icon: 'lock-check-outline', labelKey: 'money.dayClose', href: '/money/day-close', show: invoicing && can('ACCOUNTS', 'READ') && can('INVOICING_MANAGE', 'FULL') },
    // reports/_layout.tsx.
    { key: 'REPORTS', icon: 'chart-line', labelKey: 'more.rows.reports', href: '/reports', show: can('REPORTS', 'READ') },
    // The More door (settings.canEdit) AND the screen's own read gate (settings.canView).
    { key: 'ONLINE_SHOP', icon: 'storefront-edit-outline', labelKey: 'commerce.doors.settings', href: '/commerce/settings' as Href, show: commerce.settings.canView && commerce.settings.canEdit },
  ];
  return tiles.filter((x) => x.show).map(({ key, icon, labelKey, href }) => ({ key, icon, labelKey, href }));
}

/**
 * The label grows with the phone's text size up to this much, then stops —
 * past it a three-across tile on a 320dp phone cannot hold two lines of Hindi.
 * It still shrinks to fit (`adjustsFontSizeToFit`) before it would ever be cut.
 */
const TILE_MAX_FONT_SCALE = 1.3;
const TILE_LINE_HEIGHT = 17;

/** Three across on a phone; more on a tablet so tiles never stretch wide. */
function columnsFor(width: number): number {
  if (width >= 900) return 6;
  if (width >= 600) return 4;
  return 3;
}

export function TodayShortcutGrid({ c }: { c: ColorScheme }) {
  const { t } = useTranslation();
  const { ready, can, hasModule } = usePartnerEntitlements();
  const commerce = useCommerceAccess();
  const { width, fontScale } = useWindowDimensions();
  const tiles = shortcutTilesFor({ ready, can, hasModule, commerce });
  // Nothing this person may open → no heading, no empty card.
  if (!tiles.length) return null;

  const cols = columnsFor(width);
  // Every tile reserves the same two-line label slot, sized for the text size
  // (capped), so every tile in the grid is one height whatever its label.
  const labelSlot = Math.ceil(2 * TILE_LINE_HEIGHT * Math.min(Math.max(fontScale || 1, 1), TILE_MAX_FONT_SCALE));

  return (
    <View style={styles.section} testID="today-shortcuts">
      <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">{t('today.shortcuts')}</Text>
      <View style={styles.grid}>
        {tiles.map((tile) => {
          const label = t(tile.labelKey);
          return (
            <View key={tile.key} style={[styles.cell, { width: `${100 / cols}%` }]}>
              <Pressable
                onPress={() => router.push(tile.href)}
                accessibilityRole="button"
                accessibilityLabel={label}
                testID={`today-shortcut-${tile.key}`}
                style={({ pressed }) => [
                  styles.tile,
                  { backgroundColor: c.surface, borderColor: c.divider, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: c.surfaceVariant }]}>
                  <MaterialCommunityIcons name={tile.icon as never} size={22} color={c.primary} />
                </View>
                {/* A fixed two-line slot, label centred in it. A long name
                    (Hindi especially) wraps and, if a word still will not fit,
                    shrinks — never spills out of the tile, never ends in "…". */}
                <View style={[styles.labelSlot, { height: labelSlot }]}>
                  <Text
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    maxFontSizeMultiplier={TILE_MAX_FONT_SCALE}
                    style={[styles.label, { color: c.textPrimary }]}
                  >
                    {label}
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  title: { fontSize: 16, fontWeight: '600' },
  // -4 / +4 gutter: the outer tiles line up with the cards above and below.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { paddingHorizontal: 4, marginBottom: 8 },
  tile: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 4,
    minHeight: 48,
  },
  iconBox: { width: 42, height: 42, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  labelSlot: { alignSelf: 'stretch', justifyContent: 'center', marginTop: 6 },
  label: { fontSize: 12.5, fontWeight: '600', lineHeight: TILE_LINE_HEIGHT, textAlign: 'center' },
});
// <<< SHORTCUTS
