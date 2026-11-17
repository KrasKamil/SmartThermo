# Etap 1: Budowanie aplikacji TypeScript + instalacja zależności
FROM node:22-alpine AS builder

# canvas (chartjs-node-canvas) wymaga narzędzi do kompilacji natywnej
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev

WORKDIR /app

COPY package*.json package-lock.json tsconfig.json ./
RUN npm ci --legacy-peer-deps

COPY src/ ./src/
RUN npm run build

# Usuwamy devDependencies z node_modules po buildzie
RUN npm prune --omit=dev

# Etap 2: Środowisko produkcyjne (minimalne)
FROM node:22-alpine AS runner

# Biblioteki runtime dla canvas (bez narzędzi do kompilacji)
RUN apk add --no-cache \
    cairo \
    pango \
    libjpeg-turbo \
    giflib \
    librsvg \
    pixman

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Kopiujemy zbudowany kod i już przyciętą listę node_modules z buildera
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY public/ ./public/

EXPOSE 3000
CMD ["node", "dist/server.js"]
