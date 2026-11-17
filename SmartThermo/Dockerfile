# Etap 1: Budowanie aplikacji TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

# package-lock.json jest commitowany do repo, więc npm ci zadziała
COPY package*.json package-lock.json tsconfig.json ./
RUN npm ci --legacy-peer-deps

COPY src/ ./src/
RUN npm run build

# Etap 2: Środowisko produkcyjne (minimalne)
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY public/ ./public/

EXPOSE 3000
CMD ["node", "dist/server.js"]
