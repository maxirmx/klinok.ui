# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok ui application

FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY --chown=node:node package*.json ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY p2p-node/package.json p2p-node/package.json
RUN npm ci --workspace @klinok/protocol --workspace @klinok/p2p-node --include-workspace-root
COPY packages/protocol packages/protocol
COPY p2p-node p2p-node
RUN npm run build --workspace @klinok/protocol && npm run build --workspace @klinok/p2p-node

FROM node:24.18.0-bookworm-slim AS final
WORKDIR /app
ENV NODE_ENV=production KLINOK_P2P_DATA_DIR=/data KLINOK_P2P_WS_PORT=8089
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/protocol packages/protocol
COPY --from=build --chown=node:node /app/p2p-node p2p-node
RUN install -d -o node -g node /data
USER node

VOLUME ["/data"]
EXPOSE 8089/tcp

CMD ["node", "p2p-node/dist/index.js"]
