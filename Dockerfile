# Stage for building the frontend
FROM node:26.3.0-alpine3.24 AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage for running nginx with static files
FROM nginx:1.31.1-alpine AS final

COPY --from=build /app/dist /usr/share/nginx/html
COPY config/nginx.conf /etc/nginx/conf.d/default.conf
COPY config/update-config.sh /docker-entrypoint.d/40-update-config.sh

RUN chmod +x /docker-entrypoint.d/40-update-config.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
