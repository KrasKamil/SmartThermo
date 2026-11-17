# Etap 1: Budowanie aplikacji TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm install --legacy-peer-deps

# Kopiowanie źródeł aplikacji
COPY src/ ./src/
RUN npm run build

# Etap 2: Środowisko produkcyjne
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Instalacja tylko zależności produkcyjnych
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

# Kopiowanie skompilowanego kodu oraz plików statycznych
COPY --from=builder /app/dist ./dist
COPY public/ ./public/

# Port serwera Express / Socket.io
EXPOSE 3000

# Uruchomienie aplikacji
CMD ["node", "dist/server.js"]
