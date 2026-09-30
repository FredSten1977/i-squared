// ESLint (flat config). Regler er satt eksplisitt fordi prosjektet ikke er avhengig av @eslint/js.
const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', fetch: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', performance: 'readonly', AbortController: 'readonly', Image: 'readonly',
  btoa: 'readonly', URL: 'readonly', console: 'readonly', globalThis: 'readonly', Promise: 'readonly',
  HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLVideoElement: 'readonly', HTMLAudioElement: 'readonly',
  HTMLImageElement: 'readonly', HTMLButtonElement: 'readonly', HTMLDetailsElement: 'readonly', AudioContext: 'readonly', Event: 'readonly',
  Uint8Array: 'readonly'
};
const shared = {
  ISQ_Config: 'writable', ISQ_Scoring: 'writable', ISQ_Timer: 'writable', ISQ_Validate: 'writable',
  ISQ_StateMachine: 'writable', ISQ_Engine: 'writable', ISQ_QR: 'writable', ISQ_Client: 'writable',
  module: 'readonly', require: 'readonly', globalThis: 'readonly'
};
const gas = {
  SpreadsheetApp: 'readonly', CacheService: 'readonly', PropertiesService: 'readonly', LockService: 'readonly',
  Utilities: 'readonly', HtmlService: 'readonly', ContentService: 'readonly', ScriptApp: 'readonly',
  Session: 'readonly', Logger: 'readonly'
};
const node = {
  process: 'readonly', console: 'readonly', Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', URL: 'readonly', require: 'readonly', module: 'writable',
  __dirname: 'readonly', globalThis: 'readonly', fetch: 'readonly'
};
const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^(ISQ_|doGet$|doPost$|rpc$|oppsett$|nullstillAdminPin$|skrivRapport$)' }],
  'no-redeclare': ['error', { builtinGlobals: false }],
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
  'no-sparse-arrays': 'error',
  'no-unsafe-finally': 'error',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-fallthrough': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  eqeqeq: ['error', 'smart'],
  'no-var': 'off',
  'no-eval': 'error',
  'no-implied-eval': 'error'
};
export default [
  { ignores: ['dist/**', 'legacy/**', 'node_modules/**', 'test-results/**'] },
  {
    files: ['src/shared/**/*.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...shared } },
    rules
  },
  {
    files: ['src/gas/**/*.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...shared, ...gas } },
    rules
  },
  {
    files: ['src/web/**/*.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: { ...shared, ...browser, google: 'readonly' } },
    rules
  },
  {
    files: ['dev/**/*.js', 'tests/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: node },
    rules
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...node, ...browser } },
    rules
  }
];
