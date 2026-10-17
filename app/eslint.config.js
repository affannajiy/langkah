// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // These two are React Compiler advice. The app does not use the compiler, and the
      // flagged code (Animated values in refs, "latest value" refs, loading flags set in
      // effects) works as written. Kept as warnings so they still show up.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      // i18next's default export is the shared instance; calling its methods is correct.
      'import/no-named-as-default-member': 'off',
    },
  },
]);
