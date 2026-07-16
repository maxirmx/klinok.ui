// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";

const generatedMixedDevConfig = resolve(process.cwd(), ".klinok-local/mixed-dev-config.json");

function mixedDevRuntimeConfig(path = process.env.KLINOK_DEV_CONFIG ?? (existsSync(generatedMixedDevConfig) ? generatedMixedDevConfig : undefined)): Plugin {
  return {
    name: "klinok-mixed-dev-runtime-config",
    configureServer(server) {
      if (!path) return;
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?", 1)[0] !== "/config.json") {
          next();
          return;
        }
        try {
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(readFileSync(path, "utf8"));
        } catch (error) {
          server.config.logger.error(`Не удалось прочитать конфигурацию mixed dev: ${String(error)}`);
          response.statusCode = 500;
          response.end("Mixed dev runtime configuration is unavailable.");
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [mixedDevRuntimeConfig(), vue()],
  resolve: {
    alias: {
      events: "events/",
    },
  },
  server: {
    proxy: {
      "/api/auth": {
        target: process.env.KLINOK_AUTH_DEV_TARGET ?? "http://127.0.0.1:8090",
      },
      "/api/events": {
        target: process.env.KLINOK_P2P_DEV_TARGET ?? "http://127.0.0.1:8091",
        rewrite: () => "/events",
      },
    },
  },
});
