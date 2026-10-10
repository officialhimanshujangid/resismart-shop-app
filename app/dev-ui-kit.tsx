/**
 * DEV-ONLY gallery of the Design System v1 kit (Phase D0).
 *
 *   Expo web:  http://localhost:8081/dev-ui-kit   ·   app: resismart-shop://dev-ui-kit
 *
 * Guarded by `__DEV__`: a release build redirects to the app's start. It sits
 * at the root (outside `(app)` / `(auth)`) so it opens without signing in.
 * Light/dark follows the phone (or the browser's colour scheme); the "हिंदी"
 * chip switches the language for this session only (not saved) to check that
 * Hindi labels wrap.
 *
 * Sample copy here is fixed English/Hindi on purpose — it is a design fixture,
 * never shown to a partner.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  AreaChart,
  BottomCartBar,
  Button,
  Card,
  Chip,
  ChipStrip,
  Detail,
  EmptyState,
  ErrorState,
  GlassCard,
  HeroHeader,
  IconButton,
  ListRow,
  MiniBars,
  Money,
  ProductArt,
  ProductCard,
  ProductGrid,
  Ring,
  SearchField,
  SectionTitle,
  Segmented,
  ServiceTile,
  SkeletonList,
  StatusBadge,
  Storefront,
  TextField,
  TileGrid,
  Title,
  useToast,
} from '../src/components/ui';
import { Rise, useCountUp, useMotionOK } from '../src/theme/motion';
import { useAppTheme } from '../src/theme/useAppTheme';
import { radius, space } from '../src/theme/tokens';

const SALES = [12, 14, 13, 18, 16, 22, 19, 24, 21, 27, 31, 30];

export default function DevUiKit() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Gallery />;
}

function Gallery() {
  const { i18n } = useTranslation();
  const hi = i18n.language === 'hi';
  const L = (en: string, h: string) => (hi ? h : en);
  const th = useAppTheme();
  const { ds, c } = th;
  const motionOK = useMotionOK();
  const toast = useToast();
  const sales = useCountUp(12480);
  const [seg, setSeg] = useState<'due' | 'paid' | 'all'>('due');
  const [cat, setCat] = useState('all');
  const [qty, setQty] = useState<Record<string, number>>({ milk: 2 });
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const items = Object.values(qty).reduce((a, b) => a + b, 0);
  const add = (k: string) => setQty((q) => ({ ...q, [k]: (q[k] ?? 0) + 1 }));
  const remove = (k: string) => setQty((q) => ({ ...q, [k]: Math.max(0, (q[k] ?? 0) - 1) }));

  return (
    <View style={[styles.root, { backgroundColor: ds.ground }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <HeroHeader
          avatarText="SG"
          eyebrow={L('Sunday, 5 Oct', 'रविवार, 5 अक्टूबर')}
          title={L('Good morning, Sharma ji', 'सुप्रभात, शर्मा जी')}
          right={<IconButton icon="bell-outline" variant="glass" badge={2} accessibilityLabel="Notifications" onPress={() => router.back()} />}
          chips={[
            { label: L('Open · taking orders', 'खुला · ऑर्डर ले रहे हैं'), live: true },
            { label: L('Delivery 3 km', 'डिलीवरी 3 किमी') },
            { label: L('UPI ready', 'UPI तैयार') },
          ]}
          illustration={({ width, height }) => <Storefront width={width} height={height} signText="SHARMA GENERAL" />}
        />

        <Rise index={1} style={styles.overlap}>
          <GlassCard>
            <View style={styles.between}>
              <View style={styles.flex}>
                <Detail style={styles.bold}>{L('Sales today', 'आज की बिक्री')}</Detail>
                <Money size="hero">₹{Math.round(sales).toLocaleString('en-IN')}</Money>
              </View>
              <StatusBadge tone="brand" label={L('▲ 18% vs last Sun', '▲ 18% पिछले रवि से')} />
            </View>
            <AreaChart values={SALES} label={L('Sales through the day', 'दिन भर की बिक्री')} latestText="₹12,480" />
            <View style={styles.statRow}>
              {[
                [L('Bills', 'बिल'), '38', false],
                [L('Online', 'ऑनलाइन'), L('6 orders', '6 ऑर्डर'), false],
                [L('Khata due', 'खाता बाकी'), '₹3,200', true],
              ].map(([k, v, warm]) => (
                <View
                  key={String(k)}
                  style={[styles.stat, { backgroundColor: warm ? th.status.warn.bg : ds.surfaceAlt }]}
                >
                  <Text style={[styles.statLabel, { color: warm ? th.status.warn.fg : ds.muted }]}>{k}</Text>
                  <Money size="number" color={warm ? th.status.warn.fg : ds.ink}>{String(v)}</Money>
                </View>
              ))}
            </View>
            <Button label={L('New bill', 'नया बिल')} icon="plus" fullWidth onPress={() => toast.show({ message: 'Primary pressed', tone: 'success' })} />
          </GlassCard>
        </Rise>

        <Rise index={2} style={styles.section}>
          <TileGrid>
            <ServiceTile label={L('Scan', 'स्कैन')} icon="barcode-scan" tint="green" />
            <ServiceTile label={L('Orders', 'ऑर्डर')} icon="shopping-outline" tint="sky" badge={2} />
            <ServiceTile label={L('Products', 'सामान')} icon="cube-outline" tint="amber" />
            <ServiceTile label={L('Khata', 'खाता')} icon="book-open-variant" tint="violet" />
            <ServiceTile label={L('Low stock', 'कम स्टॉक')} icon="alert-box-outline" tint="coral" badge={3} />
            <ServiceTile label={L('Offers', 'ऑफ़र')} icon="tag-outline" tint="rose" badge="new" />
            <ServiceTile label={L('Delivery', 'डिलीवरी')} icon="truck-outline" tint="teal" />
            <ServiceTile label={L('Reports', 'रिपोर्ट')} icon="chart-bar" tint="blue" />
          </TileGrid>
        </Rise>

        <Rise index={3} style={styles.section}>
          <View style={styles.between}>
            <Title>{L('UI kit', 'UI किट')}</Title>
            <Chip label={hi ? 'English' : 'हिंदी'} onPress={() => i18n.changeLanguage(hi ? 'en' : 'hi')} selectedStyle="soft" selected />
          </View>
          <Detail>
            {`${th.isDark ? 'Dark' : 'Light'} · motion ${motionOK ? 'on' : 'reduced'} · ${c.primary}`}
          </Detail>

          <SectionTitle>Buttons</SectionTitle>
          <View style={styles.wrap}>
            <Button label={L('Make bill', 'बिल बनाएँ')} icon="receipt" onPress={() => undefined} />
            <Button label={L('View bill', 'बिल देखें')} variant="soft" onPress={() => undefined} />
            <Button label={L('Turn away', 'वापस भेजें')} variant="outline" onPress={() => undefined} />
            <Button label={L('Delete', 'हटाएँ')} variant="dangerOutline" icon="delete-outline" onPress={() => undefined} />
            <Button label={L('Scan', 'स्कैन')} variant="ink" icon="barcode-scan" size="sm" onPress={() => undefined} />
            <Button label={L('Skip', 'छोड़ें')} variant="ghost" size="sm" onPress={() => undefined} />
            <Button label={L('Saving', 'सेव हो रहा है')} loading onPress={() => undefined} />
            <Button label={L('Disabled', 'बंद')} disabled onPress={() => undefined} />
          </View>
          <Button
            fullWidth
            variant="soft"
            label={L('A long label that has to wrap onto a second line on a small phone', 'एक लंबा लेबल जो छोटे फ़ोन पर दूसरी लाइन में जाना चाहिए, कटना नहीं चाहिए')}
            onPress={() => undefined}
          />
          <View style={styles.wrap}>
            <IconButton icon="arrow-left" accessibilityLabel="Back" />
            <IconButton icon="barcode-scan" variant="ink" rounded={false} size={50} accessibilityLabel="Scan" />
            <IconButton icon="plus" variant="soft" accessibilityLabel="Add" />
            <IconButton icon="dots-horizontal" variant="plain" accessibilityLabel="More" badge={5} />
          </View>

          <SectionTitle>Chips & segmented</SectionTitle>
          <ChipStrip>
            {[
              ['all', L('All', 'सभी'), null],
              ['dairy', L('Dairy', 'डेयरी'), 'milk'],
              ['snacks', L('Snacks', 'स्नैक्स'), 'chips'],
              ['staples', L('Staples', 'राशन'), 'flour'],
              ['cleaning', L('Cleaning', 'सफ़ाई'), 'soap'],
            ].map(([k, label, art]) => (
              <Chip
                key={String(k)}
                label={String(label)}
                selected={cat === k}
                onPress={() => setCat(String(k))}
                leading={art ? <ProductArt kind={art as 'milk'} size={20} /> : undefined}
              />
            ))}
          </ChipStrip>
          <Segmented
            value={seg}
            onChange={setSeg}
            options={[
              { key: 'due', label: L('Due', 'बाकी'), count: 3 },
              { key: 'paid', label: L('Paid', 'चुकाया') },
              { key: 'all', label: L('Receipts', 'रसीदें') },
            ]}
          />
          <View style={styles.wrap}>
            <StatusBadge tone="success" label={L('Paid', 'चुकाया')} />
            <StatusBadge tone="info" label={L('Expected', 'अपेक्षित')} />
            <StatusBadge tone="warn" label={L('Due in 5 days', '5 दिन में देय')} />
            <StatusBadge tone="neutral" label={L('Left', 'चले गए')} />
            <StatusBadge tone="danger" label={L('Overdue', 'बकाया')} />
            <StatusBadge tone="brand" live label={L('New order', 'नया ऑर्डर')} />
          </View>

          <SectionTitle>Cards & rows</SectionTitle>
          <Card>
            <View style={styles.between}>
              <StatusBadge tone="brand" live label={L('New order', 'नया ऑर्डर')} />
              <Detail style={styles.flex}>#214 · B-904</Detail>
              <Money size="number">₹642</Money>
            </View>
            <View style={styles.twoBtns}>
              <Button label={L('View', 'देखें')} variant="outline" size="sm" style={styles.flex} onPress={() => undefined} />
              <Button label={L('Accept', 'स्वीकार करें')} size="sm" style={styles.flex} onPress={() => undefined} />
            </View>
          </Card>
          <Card tone="warm">
            <Text style={[styles.bold, { color: th.status.warn.fg }]}>{L('Running low', 'स्टॉक कम')}</Text>
            <Text style={{ color: ds.ink }}>{L('Milk 500 ml · 4 left', 'दूध 500 ml · 4 बचे')}</Text>
          </Card>
          <ListRow icon="receipt" title={L('Bill #1043 · Walk-in', 'बिल #1043 · काउंटर ग्राहक')} detail={L('Today, 10:42 · UPI', 'आज, 10:42 · UPI')} amount="₹341" onPress={() => undefined} />
          <ListRow icon="book-open-variant" tint="violet" title={L('Khata · Mehta (B-1203)', 'खाता · मेहता (B-1203)')} detail={L('Last paid 2 Oct', 'पिछला भुगतान 2 अक्टू')} trailing={<StatusBadge tone="warn" label="₹1,250" />} />
          <ListRow icon="logout" title={L('Sign out', 'साइन आउट')} danger onPress={() => undefined} />

          <SectionTitle>Products</SectionTitle>
          <SearchField value={query} onChangeText={setQuery} placeholder={L('Search name or code', 'नाम या कोड खोजें')} />
          <ProductGrid>
            <ProductCard name={L('Toned milk 500 ml', 'टोंड दूध 500 ml')} subtitle={L('Dairy', 'डेयरी')} priceText="₹28" art="milk" stockBadge={L('4 left', '4 बचे')} qty={qty.milk ?? 0} onAdd={() => add('milk')} onRemove={() => remove('milk')} bob />
            <ProductCard name={L('Wheat atta 5 kg', 'गेहूँ आटा 5 kg')} subtitle={L('Staples', 'राशन')} priceText="₹285" art="flour" qty={qty.flour ?? 0} onAdd={() => add('flour')} onRemove={() => remove('flour')} bob />
            <ProductCard name={L('Masala chips', 'मसाला चिप्स')} subtitle={L('Snacks', 'स्नैक्स')} priceText="₹20" art="chips" qty={qty.chips ?? 0} onAdd={() => add('chips')} onRemove={() => remove('chips')} bob />
            <ProductCard name={L('Dish bar, 3 pack', 'बर्तन साबुन, 3 पैक')} subtitle={L('Cleaning', 'सफ़ाई')} priceText="₹65" art="soap" qty={qty.soap ?? 0} onAdd={() => add('soap')} onRemove={() => remove('soap')} bob />
          </ProductGrid>

          <SectionTitle>Data</SectionTitle>
          <Card>
            <View style={styles.between}>
              <Ring progress={2 / 3} label={L('Bills paid', 'बिल चुकाए')}>
                <Money size="number">2/3</Money>
              </Ring>
              <MiniBars c={c} width={170} height={64} points={SALES.map((v, i) => ({ t: String(i), v }))} label={L('Daily sales', 'रोज़ की बिक्री')} />
            </View>
          </Card>

          <SectionTitle>Inputs</SectionTitle>
          <TextField label={L('Customer name', 'ग्राहक का नाम')} value={name} onChangeText={setName} placeholder={L('e.g. Mehta', 'जैसे मेहता')} />
          <TextField label={L('Phone', 'फ़ोन')} value="98" onChangeText={() => undefined} error={L('Enter 10 digits', '10 अंक डालें')} keyboardType="phone-pad" />

          <SectionTitle>States</SectionTitle>
          <Card>
            <EmptyState
              art={<ProductArt kind="box" size={64} />}
              title={L('No products yet', 'अभी कोई सामान नहीं')}
              body={L('Add your first product to start billing.', 'बिलिंग शुरू करने के लिए पहला सामान जोड़ें।')}
              actionLabel={L('Add product', 'सामान जोड़ें')}
              actionIcon="plus"
              onAction={() => undefined}
            />
          </Card>
          <Card>
            <ErrorState message={L('Could not load orders. Check the internet.', 'ऑर्डर लोड नहीं हुए। इंटरनेट देखें।')} onRetry={() => undefined} />
          </Card>
          <SkeletonList rows={2} />
          <View style={styles.wrap}>
            <Button label="Toast: success" variant="soft" size="sm" onPress={() => toast.show({ message: L('Bill saved', 'बिल सेव हो गया'), tone: 'success' })} />
            <Button label="Toast: error" variant="dangerOutline" size="sm" onPress={() => toast.show({ message: L('Could not send. Try again.', 'भेजा नहीं जा सका। फिर कोशिश करें।'), tone: 'danger' })} />
          </View>
          <View style={[styles.swatches]}>
            {(['primary', 'primarySoft', 'ground', 'surface', 'ink', 'muted', 'line', 'inkButton'] as const).map((k) => (
              <View key={k} style={styles.swatch}>
                <View style={[styles.swatchBox, { backgroundColor: ds[k], borderColor: ds.line }]} />
                <Text style={[styles.swatchText, { color: ds.muted }]}>{k}</Text>
              </View>
            ))}
          </View>
        </Rise>
      </ScrollView>

      <BottomCartBar
        caption={L(`${items} items · Walk-in`, `${items} सामान · काउंटर ग्राहक`)}
        amountText="₹341"
        actionLabel={L('Make bill', 'बिल बनाएँ')}
        visible={items > 0}
        onAction={() => toast.show({ message: L('Bill made', 'बिल बन गया'), tone: 'success' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 140 },
  overlap: { marginTop: -64, marginHorizontal: space.screen },
  section: { paddingHorizontal: space.screen, paddingTop: space.section, gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 7 },
  statLabel: { fontSize: 11, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  twoBtns: { flexDirection: 'row', gap: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 72, gap: 4 },
  swatchBox: { height: 36, borderRadius: radius.sm, borderWidth: 1 },
  swatchText: { fontSize: 10, fontWeight: '600' },
});
