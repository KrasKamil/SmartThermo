# Raport z audytu czystości kodu (SmartThermo)

Data analizy: 2026-11-17
Narzędzia wykorzystane do weryfikacji: `knip`, `eslint`, `vitest`, `tsc`

---

## 1. Wykryte i usunięte martwe zależności (npm)
- **`@google/genai`**: W `package.json` znajdowały się dwa pakiety Gemini. Cała aplikacja (`src/services/llmService.ts`) korzysta z oficjalnego `@google/generative-ai`. Pakiet `@google/genai` był nieużywany i został usunięty.
- **`ts-node`**: Wcześniej używany do uruchamiania TypeScript, ale projekt przeszedł na szybszy `tsx` (`npm run dev`). Pakiet `ts-node` został bezpiecznie odinstalowany.

---

## 2. Wykryte i wyczyszczone martwe fragmenty w kodzie
- **`src/services/telegramService.ts`**:
  - Usunięto nieużywane importy systemowe: `fs`, `exec` z `child_process`.
  - Usunięto martwe stałe: `NIRCMD_PATH`, `sleep` (pozostałości po starszych mechanizmach sterowania mediami).
- **`src/routes/air.ts`**:
  - Usunięto zbędny import `{ error } from 'console'`.
- **`src/routes/weather.ts`**:
  - Poprawiono deklarację `let rawTemp` na `const rawTemp`.

---

## 3. Elementy zweryfikowane jako aktywne (nieusuwane)
- **`serverRadioState`** & **`setServerRadio`**: Funkcje są aktywnie wykorzystywane przez `src/routes/media.ts` do synchronizacji stanu stacji radiowych z klientami Web / Socket.IO.
- **`mediaState`**: Kluczowy obiekt stanu odtwarzacza w `src/routes/media.ts`.
- **`getWindowsMedia` / `getLineInStatus` / `playRadioById`**: Zostawione w `src/helpers/system.ts` jako publiczne funkcje pomocnicze backendu.

---

## 4. Dodana infrastruktura CI/CD & Jakości kodu
1. **Vitest** – framework do testów jednostkowych (`tests/namedayService.test.ts`, `tests/jokeService.test.ts`).
2. **ESLint (Flat Config)** – weryfikacja poprawności i higieny kodu (`eslint.config.mjs`).
3. **Knip** – automatyczne wykrywanie nieużywanych plików, zależności i eksportów (`knip.json`).
4. **GitHub Actions CI** – `.github/workflows/ci.yml` (uruchamia lint, build, testy jednostkowe oraz testowe budowanie Dockera przy każdym pushu/PR do `main`).
5. **Docker Multi-Stage & Compose** – optymalny obraz kontenera i gotowy plik `docker-compose.yml` z bazą MongoDB.
6. **Automatyczne Releases (GHCR)** – `.github/workflows/release.yml` (publikacja obrazu i paczki po dodaniu taga `v*.*.*`).
7. **Dependabot** – `.github/dependabot.yml` (automatyczne aktualizacje npm, pip i GitHub Actions).
