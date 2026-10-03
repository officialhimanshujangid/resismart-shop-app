// >>> WEB-UI — new file (web/phone UI fix, 2026-10-03).
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

type SegmentedProps = React.ComponentProps<typeof SegmentedButtons>;

/**
 * Paper's `SegmentedButtons`, but every segment is as wide as its own words.
 *
 * Paper gives each segment an EQUAL share of the row (`flex: 1`, at least
 * 76dp, with 16dp of padding each side), so on a 344–430dp phone four or five
 * segments either cut a label short ("Unp…") or push the last segment off the
 * screen. Here each segment starts at its text width and the spare room is
 * shared out, so a row that fits looks exactly like before; a row that does
 * not fit scrolls sideways instead of hiding words. Same props, same words.
 *
 * `flex: 0` is deliberate: with `flex: 1` still set, the native layout engine
 * ignores `flexBasis: 'auto'` and goes back to equal shares.
 */
export function FitSegments({ buttons, style, ...rest }: SegmentedProps) {
  const props = {
    ...rest,
    buttons: buttons.map((b) => ({ ...b, style: [styles.segment, b.style] })),
    style: [styles.row, style],
  } as SegmentedProps;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <SegmentedButtons {...props} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Only as tall as the buttons — a horizontal scroller must not grow on web.
  scroll: { flexGrow: 0, flexShrink: 0 },
  // At least the full width, so a row that fits still spans it edge to edge.
  content: { flexGrow: 1 },
  row: { flexGrow: 1 },
  segment: { flex: 0, flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
});
// <<< WEB-UI
