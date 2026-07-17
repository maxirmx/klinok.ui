// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";

const generatedMixedDevConfig = resolve(process.cwd(), ".klinok-local/mixed-dev-config.json");
const canonicalDevUrl = new URL(process.env.KLINOK_PUBLIC_ORIGIN ?? "http://localhost:8080");
const canonicalDevPort = Number(canonicalDevUrl.port || (canonicalDevUrl.protocol === "https:" ? 443 : 80));

function canonicalOriginRedirect(canonicalOrigin = canonicalDevUrl.origin): Plugin {
  const canonical = new URL(canonicalOrigin);
  return {
    name: "klinok-canonical-origin",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestHost = request.headers.host?.toLocaleLowerCase("en-US");
        if (!requestHost || requestHost === canonical.host.toLocaleLowerCase("en-US")) {
          next();
          return;
        }
        const requestTarget = request.url?.startsWith("/") ? request.url : `/${request.url ?? ""}`;
        response.statusCode = 308;
        response.setHeader("Location", `${canonical.origin}${requestTarget}`);
        response.setHeader("Cache-Control", "no-store");
        response.end();
      });
    },
  };
}

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
  plugins: [canonicalOriginRedirect(), mixedDevRuntimeConfig(), vue()],
  resolve: {
    alias: {
      events: "events/",
    },
  },
  server: {
    host: "127.0.0.1",
    port: canonicalDevPort,
    strictPort: true,
    allowedHosts: [canonicalDevUrl.hostname],
    watch: {
      // Auth's local LevelDB directory is runtime data, not UI source. In
      // particular, it can contain user-created symlinks that must not bring
      // down Vite's file watcher.
      ignored: ["**/.klinok-auth", "**/.klinok-auth/**"],
    },
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
