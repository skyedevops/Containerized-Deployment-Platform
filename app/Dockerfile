# syntax=docker/dockerfile:1.7

############################
# Stage 1 - dependencies
############################
FROM node:20-alpine AS deps
WORKDIR /build

# Install only production deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi

############################
# Stage 2 - runtime
############################
FROM node:20-alpine AS runtime

# tini for proper PID 1 signal handling
RUN apk add --no-cache tini curl \
    && addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NODE_OPTIONS="--enable-source-maps"

WORKDIR /app

# Copy production node_modules
COPY --from=deps --chown=app:app /build/node_modules ./node_modules
# Copy source
COPY --chown=app:app package.json ./
COPY --chown=app:app src ./src

USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
