// @expo/vector-icons loads fonts through expo-font; in tests every icon set is a
// plain View stub carrying the glyph name as a testID.
const React = require('react');
const { View } = require('react-native');

const cache = {};
module.exports = new Proxy({ __esModule: true }, {
  get(target, name) {
    if (name in target) return target[name];
    if (typeof name !== 'string') return undefined;
    if (!cache[name]) {
      const Icon = ({ name: glyph, ...props }) => React.createElement(View, { testID: `icon-${glyph}`, ...props });
      Icon.displayName = name;
      Icon.glyphMap = {};
      cache[name] = Icon;
    }
    return cache[name];
  },
});
