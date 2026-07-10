// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.spec.ts'],
      environment: 'jsdom',
      globals: true,
      isolate: true,
      exclude: [...configDefaults.exclude, 'e2e/*'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov', 'json'],
        include: ['src/**/*.{ts,vue}'],
        exclude: ['src/env.d.ts', '**/node_modules/**', '**/dist/**', '**/tests/**', '**/*.spec.ts']
      }
    },
    define: {
      global: 'globalThis'
    }
  })
)
