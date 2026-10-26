const path = require('path');

// O preset só transforma react-native e @react-native(-community)/*. As libs
// de RN publicam ESM sem transpilar, e com npm workspaces elas ficam no
// node_modules da raiz; esta lista vale para qualquer node_modules do caminho.
const esmPackages = [
  '(jest-)?react-native[^/]*',
  '@react-native[^/]*',
  '@react-navigation',
];

// O `exports` destas libs não expõe o setup de jest que elas publicam.
const publishedSetup = pkg =>
  path.join(
    path.dirname(require.resolve(`${pkg}/package.json`)),
    'jest/build/jest/setup.js',
  );

module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [`node_modules/(?!(${esmPackages.join('|')})/)`],
  resolver: './jest.resolver.js',
  // Somados aos setupFiles do preset (o Jest concatena).
  setupFiles: [
    './jest.setup.js',
    publishedSetup('@react-native-documents/picker'),
    publishedSetup('@react-native-google-signin/google-signin'),
  ],
};
