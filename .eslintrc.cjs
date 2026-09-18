module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'functions/lib', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    {
      /*
        Die Vorschau unter `tools/` ist Werkzeug, kein Anwendungscode. Sie
        ERSETZT `AuthContext` und muss dafuer dieselben Namen exportieren wie
        das Original — eine Komponente UND einen Hook aus einer Datei. Die
        Regel dahinter (Fast Refresh) betrifft nur die Entwicklung der App
        selbst und hat hier keinen Gegenstand.
      */
      files: ['tools/**/*.{ts,tsx,mjs}'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  ],
};
