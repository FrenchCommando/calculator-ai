# arm64-capable (Pi target) — built on the Pi via `docker compose up -d --build`.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY lib ./lib
COPY apps ./apps
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
