# Multi-stage Docker build for Coolify / Docker hosting with persistent disk storage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .

RUN npm run test
RUN npm run build

# Stage 2: Hardened Node.js persistent runtime
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/src/data/initialSeed.json ./src/data/initialSeed.json
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=80
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data/backups

VOLUME ["/app/data"]
EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/api/health || exit 1

CMD ["node", "server.mjs"]
