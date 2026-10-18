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
    files: ['src/globe/**/*.tsx', 'src/components/noticias/DeskScene.tsx'],
    rules: {
      'react/no-unknown-property': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  {
    // Motor de simulação: TypeScript puro e determinístico (AI_INSTRUCTIONS.md §3).
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Motor: use monthIndex (src/engine/calendar.ts), nunca Date.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Motor: use o Rng com semente (src/engine/rng.ts).' },
        { object: 'console', message: 'Motor: sem console; devolva informações no relatório do mês.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'expo', 'expo-*', '@expo/*'], message: 'Motor não importa React/Expo.' },
            {
              group: ['@/app/*', '@/components/*', '@/database/*', '@/store/*', '@/globe/*'],
              message: 'Motor não depende da interface nem da persistência.',
            },
          ],
        },
      ],
    },
  },
  {
    // Persistência: só motor (tipos) e src/types; nunca a interface (AI_INSTRUCTIONS.md §3).
    files: ['src/database/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-native',
                '@/app/*',
                '@/components/*',
                '@/store/*',
                '@/globe/*',
                '../app/*',
                '../components/*',
                '../store/*',
                '../globe/*',
              ],
              message: 'Persistência não depende da interface.',
            },
          ],
        },
      ],
    },
  },
  // Formatação é do Prettier; desliga regras de estilo do ESLint que conflitam.
  prettierConfig,
]);
