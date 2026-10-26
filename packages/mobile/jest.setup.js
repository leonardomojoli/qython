/* eslint-env jest */
// Mocks dos módulos nativos. No Jest não há lado nativo: sem isto, cada lib
// quebra ao procurar o próprio TurboModule/NativeModule.
// Não precisam de mock aqui:
// - react-native-mmkv 4 troca a instância por uma em memória sozinho
//   quando vê JEST_WORKER_ID;
// - @react-native-documents/picker e @react-native-google-signin usam o setup
//   que publicam, carregado pelo jest.config.js.

require('react-native-gesture-handler/jestSetup');

// O MMKV importa o Nitro no topo, e o Nitro exige o TurboModule ao carregar.
// Com o MMKV já em memória, nenhum HybridObject chega a ser criado.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(name => {
      throw new Error(`Nitro HybridObject "${name}" não existe no Jest`);
    }),
  },
}));

// O gesture-handler 3 pede ao Worklets o runtime de UI ao carregar.
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/src/mock'),
);
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock('@react-native-clipboard/clipboard', () =>
  require('@react-native-clipboard/clipboard/jest/clipboard-mock.js'),
);

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('react-native-localize', () =>
  require('react-native-localize/mock/jest'),
);

// Firebase, API modular. Sem app padrão, como num build sem
// google-services.json: isFirebaseConfigured() devolve false.
jest.mock('@react-native-firebase/app', () => ({
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => {
    throw new Error("No Firebase App '[DEFAULT]' has been created");
  }),
}));

jest.mock('@react-native-firebase/auth', () => {
  const auth = { currentUser: null };
  return {
    getAuth: jest.fn(() => auth),
    GoogleAuthProvider: { credential: jest.fn(idToken => ({ idToken })) },
    signInWithCredential: jest.fn(async () => ({ user: null })),
    signInWithPhoneNumber: jest.fn(async () => ({ confirm: jest.fn() })),
    signOut: jest.fn(async () => {}),
    onAuthStateChanged: jest.fn(() => () => {}),
  };
});

jest.mock('@react-native-firebase/messaging', () => {
  const messaging = {};
  return {
    getMessaging: jest.fn(() => messaging),
    requestPermission: jest.fn(async () => 0),
    getToken: jest.fn(async () => null),
    getInitialNotification: jest.fn(async () => null),
    onMessage: jest.fn(() => () => {}),
    onNotificationOpenedApp: jest.fn(() => () => {}),
    onTokenRefresh: jest.fn(() => () => {}),
    setBackgroundMessageHandler: jest.fn(),
    AuthorizationStatus: {
      NOT_DETERMINED: -1,
      DENIED: 0,
      AUTHORIZED: 1,
      PROVISIONAL: 2,
      EPHEMERAL: 3,
    },
  };
});

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, WebView: View };
});

jest.mock('react-native-linear-gradient', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View };
});

jest.mock('@react-native-voice/voice', () => ({
  __esModule: true,
  default: {
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    cancel: jest.fn(async () => {}),
    destroy: jest.fn(async () => {}),
    removeAllListeners: jest.fn(),
    isAvailable: jest.fn(async () => false),
  },
}));

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    config: jest.fn(() => ({
      fetch: jest.fn(async () => ({ path: () => '/tmp/mock.pdf', data: '' })),
    })),
    fs: { unlink: jest.fn(async () => {}) },
  },
}));

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn(async () => ({ success: true })) },
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(async () => ({ didCancel: true })),
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
}));
