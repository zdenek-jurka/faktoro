module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    overrides: [
      {
        test: (filename) => filename != null && !filename.includes('node_modules'),
        plugins: [
          ['@babel/plugin-proposal-decorators', { legacy: true }],
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
        ],
      },
    ],
    plugins: ['react-native-reanimated/plugin'],
  };
};
