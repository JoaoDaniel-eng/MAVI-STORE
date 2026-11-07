import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/', 'public/service-worker.js'] },
  js.configs.recommended,
  {
    // Servidor e testes: módulos ES rodando no Node.
    files: ['src/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node }
  },
  {
    // Navegador: scripts clássicos carregados em ordem, que compartilham o escopo global.
    // Por isso `no-undef` (uma função definida em outro arquivo) e `no-unused-vars` (uma função usada só por outro
    // arquivo) ficam desligados aqui; o resto das regras recomendadas continua valendo.
    files: ['public/js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: globals.browser },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off', 'no-empty': ['error', { allowEmptyCatch: true }] }
  }
];
