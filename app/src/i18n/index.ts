import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getSettings, loadSettings, updateSettings, type Language } from '../storage/settings';
import en from './locales/en.json';
import ms from './locales/ms.json';

// ms.json repeats each _other plural as _one: Malay has one form, but Hermes has no
// Malay plural rules and falls back to English ones, which ask for _one.
export const resources = { en: { translation: en }, ms: { translation: ms } } as const satisfies Record<Language, unknown>;
export type { Language };

// English only for the prototype (owner's call, 2026-10-17): the Malay copy needs a
// proper review first. ms.json stays; set this to false to bring the choice back.
export const ENGLISH_ONLY = true;

// Until the user picks a language (onboarding or Settings), follow the phone:
// Malay gets BM, everything else gets English.
export function deviceLanguage(): Language {
  if (ENGLISH_ONLY) return 'en';
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

// The stored choice, once settings are read from the phone.
loadSettings().then((s) => {
  if (ENGLISH_ONLY) return;
  if (s.language && s.language !== i18n.language) void i18n.changeLanguage(s.language);
});

export function appLanguage(): Language {
  if (ENGLISH_ONLY) return 'en';
  return getSettings().language ?? deviceLanguage();
}

// Onboarding and Settings: switch now and remember the choice.
export function setLanguage(language: Language) {
  updateSettings({ language });
  void i18n.changeLanguage(language);
}

export default i18n;
