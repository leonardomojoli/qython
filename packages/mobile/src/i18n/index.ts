import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as RNLocalize from 'react-native-localize';

import pt from './locales/pt.json';
import en from './locales/en.json';
import es from './locales/es.json';

const resources = {
  pt: { translation: pt },
  en: { translation: en },
  es: { translation: es },
};

function getDeviceLanguage(): string {
  const locales = RNLocalize.getLocales();
  if (locales.length > 0) {
    const lang = locales[0].languageCode;
    if (lang in resources) {
      return lang;
    }
  }
  return 'pt';
}

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'pt',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
