# Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
# All rights reserved.
# This file is a part of Klinok ui application

FROM node:26.3.0-bookworm-slim AS final
WORKDIR /app

ENV NODE_ENV=production
ENV KLINOK_P2P_DATA_DIR=/data
ENV KLINOK_P2P_WS_PORT=8089

RUN mkdir -p /data \
    && chown node:node /app /data

USER node

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --chown=node:node p2p-node ./p2p-node

VOLUME ["/data"]
EXPOSE 8089/tcp

CMD ["node", "p2p-node/src/index.js"]
