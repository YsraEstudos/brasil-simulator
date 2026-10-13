// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'src/globe/data/*', 'data-raw/*'],
  },
  {
    // Cena three.js: propriedades JSX do R3F e mutação imperativa de objetos 3D em useFrame são o padrão.
    files: ['src/globe/**/*.tsx'],
    rules: {
      'react/no-unknown-property': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  // Formatação é do Prettier; desliga regras de estilo do ESLint que conflitam.
  prettierConfig,
]);
