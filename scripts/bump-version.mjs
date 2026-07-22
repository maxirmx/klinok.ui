// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = process.argv[2]?.replace(/^v/, "");

const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!target || !semver.test(target)) {
  console.error("Usage: npm run release:bump -- <version>");
  console.error("Example: npm run release:bump -- 0.8.0");
  process.exit(1);
}

const manifests = [
  "package.json",
  "auth-node/package.json",
  "p2p-node/package.json",
  "packages/protocol/package.json",
];

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const currentVersions = new Set(
  await Promise.all(manifests.map(async (path) => (await json(path)).version)),
);

if (currentVersions.size !== 1) {
  console.error(
    `Klinok component versions are already inconsistent: ${
      [...currentVersions].join(", ")
    }`,
  );
  process.exit(1);
}

const shimVersionBefore =
  (await json("packages/node-datachannel-disabled/package.json")).version;

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npm,
  [
    "version",
    target,
    "--no-git-tag-version",
    "--allow-same-version",
    "--ignore-scripts",
    "--include-workspace-root",
    "--workspace",
    "@klinok/auth-node",
    "--workspace",
    "@klinok/p2p-node",
    "--workspace",
    "@klinok/protocol",
  ],
  {
    cwd: root,
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

for (const path of manifests) {
  const actual = (await json(path)).version;
  if (actual !== target) {
    throw new Error(`${path} has version ${actual}; expected ${target}`);
  }
}

const lock = await json("package-lock.json");
for (const path of ["", "auth-node", "p2p-node", "packages/protocol"]) {
  const actual = lock.packages[path]?.version;
  if (actual !== target) {
    throw new Error(
      `package-lock.json entry ${path || "<root>"} has ${actual}; expected ${target}`,
    );
  }
}

const shimVersionAfter =
  (await json("packages/node-datachannel-disabled/package.json")).version;

if (shimVersionAfter !== shimVersionBefore) {
  throw new Error("The node-datachannel compatibility shim was unexpectedly bumped");
}

console.log(`All Klinok components updated to ${target}`);
