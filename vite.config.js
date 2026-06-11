const path = require('path');
const uni = require('@dcloudio/vite-plugin-uni').default;

module.exports = {
  plugins: [uni()],
  resolve: {
    alias: {
      'uview-ui': path.resolve(__dirname, 'src/uview-ui'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@use "@/uview-ui/theme.scss" as *;',
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
};
