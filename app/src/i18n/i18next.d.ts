import 'i18next';

import type en from './locales/en.json';

// Typed keys: a missing or misspelt key fails the type check.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
