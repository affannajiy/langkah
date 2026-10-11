import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ms from './locales/ms.json';

// ms.json repeats each _other plural as _one: Malay has one form, but Hermes has no
// Malay plural rules and falls back to English ones, which ask for _one.
export const resources = { en: { translation: en }, ms: { translation: ms } } as const;
export type Language = keyof typeof resources;

// Follow the phone language: Malay gets BM, everything else gets English.
// Onboarding (Phase 6) will let the user override and store the choice.
function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code === 'ms' ? 'ms' : 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
