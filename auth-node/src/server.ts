// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok applicationi

import { buildAuthApp } from "./app.js";
import { loadAuthConfig } from "./config.js";

const config = loadAuthConfig();
const app = await buildAuthApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error, "auth-node failed to start");
  process.exitCode = 1;
}
