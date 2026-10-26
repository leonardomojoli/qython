// O resolver do Reanimated (que inclui o do Worklets) tira os .native.* da
// resolução dentro dessas libs, para o mock delas não carregar o código que
// fala com o lado nativo. Por baixo dele continua o resolver do preset do RN.
const rnResolver = require(require('@react-native/jest-preset').resolver);
const reanimatedResolver = require('react-native-reanimated/jest/resolver');

module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    defaultResolver: (req, opts) =>
      rnResolver(req, { ...opts, defaultResolver: options.defaultResolver }),
  });
