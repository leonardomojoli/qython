/**
 * @format
 */

import React, { useEffect, useState } from 'react';
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import { initStorage } from './src/services/storage';

// O cache offline (pacientes, consultas, fila) é cifrado com uma chave do Android Keystore, que o Android só
// entrega de forma assíncrona. O app só é carregado DEPOIS de o armazenamento abrir: muitos módulos leem o
// armazenamento já ao serem importados, então o require do App fica adiado até aqui.
function Root() {
  const [App, setApp] = useState(null);

  useEffect(() => {
    let alive = true;
    initStorage()
      .catch(() => {})
      .finally(() => {
        if (alive) {
          setApp(() => require('./App').default);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return App ? <App /> : null;
}

AppRegistry.registerComponent(appName, () => Root);
