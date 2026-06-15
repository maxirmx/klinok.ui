// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  console: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  FormData: 'readonly',
  File: 'readonly',
  Blob: 'readonly',
  HTMLElement: 'readonly',
  SVGElement: 'readonly',
  Event: 'readonly',
  MessageEvent: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly'
}

const nodeGlobals = {
  process: 'readonly',
  module: 'readonly',
  require: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly'
}

const testGlobals = {
  ...nodeGlobals,
  global: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  vi: 'readonly'
}

export default [
  {
    ignores: [
      'docs/**',
      'logs',
      '*.log',
      'npm-debug.log*',
      'yarn-debug.log*',
      'yarn-error.log*',
      'pnpm-debug.log*',
      'lerna-debug.log*',
      'node_modules/**',
      '.DS_Store',
      '__MACOSX',
      'dist/**',
      'dist-ssr/**',
      'coverage/**',
      '*.local',
      '.idea',
      '*.suo',
      '*.ntvs*',
      '*.njsproj',
      '*.sln',
      '*.sw?',
      '.env'
    ]
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,vue}'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2022,
      globals: browserGlobals
    }
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,vue}'],
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022
      }
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off'
    }
  },
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: 'module',
        ecmaVersion: 2022,
        extraFileExtensions: ['.vue']
      }
    },
    rules: {
      'vue/comment-directive': 'off',
      'no-undef': 'off'
    }
  },
  {
    files: ['**/*.spec.{js,ts}', '**/tests/**/*.{js,ts}'],
    languageOptions: {
      globals: testGlobals
    }
  },
  {
    files: ['*.config.{js,mjs,cjs,ts}', 'eslint.config.js', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      globals: nodeGlobals
    },
    rules: {
      'no-undef': 'off'
    }
  }
]
