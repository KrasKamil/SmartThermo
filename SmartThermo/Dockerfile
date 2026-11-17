# Etap 1: Budowanie aplikacji TypeScript
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# Usuwamy devDependencies po buildzie
RUN npm prune --omit=dev

# Etap 2: Środowisko produkcyjne
FROM node:22-bookworm-slim AS runner

# Czcionki (wykresy) + Python 3 (skrypty tła)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-dejavu-core \
    python3 \
    python3-pip \
    python3-venv \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8889

# Instalacja zależności Pythona w izolowanym venv
COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

# Kopiujemy zbudowany kod, zależności i pliki statyczne
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY public/ ./public/
COPY jsons/ ./jsons/
COPY scripts/ ./scripts/

EXPOSE 8889
CMD ["node", "dist/server.js"]