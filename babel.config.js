// babel-preset-expo (SDK 54) already wires react-native-worklets (Reanimated 4),
// so no explicit reanimated/worklets plugin entry is needed here.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
