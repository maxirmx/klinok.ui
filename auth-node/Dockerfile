FROM node:26.3.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY auth-node/package.json auth-node/package.json
RUN npm ci --workspace @klinok/protocol --workspace @klinok/auth-node --include-workspace-root
COPY packages/protocol packages/protocol
COPY auth-node auth-node
RUN npm run build --workspace @klinok/protocol && npm run build --workspace @klinok/auth-node

FROM node:26.3.0-bookworm-slim AS final
WORKDIR /app
ENV NODE_ENV=production KLINOK_AUTH_DATA_DIR=/data
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/protocol packages/protocol
COPY --from=build --chown=node:node /app/auth-node auth-node
RUN install -d -o node -g node /data
USER node
VOLUME ["/data"]
EXPOSE 8090
CMD ["node", "auth-node/dist/server.js"]
