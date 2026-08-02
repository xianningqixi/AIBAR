# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Repository layout

This repo is two coupled parts:

- `web/` — **AIBAR**, a standalone Vue 3 + TypeScript SPA. This is the app you'll almost always be editing. It is a character.ai / aifuck.cc-style "browse cards → enter chat" frontend.
- `SillyTavern/` — a git submodule (fork `xianningqixi/SillyTavern`, branch `codex/aibar-local-deploy`) that provides the **backend HTTP API**. AIBAR has no backend of its own; it reuses SillyTavern's routes.

`PLAN.md` (Chinese) is the original implementation/parity plan and is the best source for *why* things are built the way they are and what still differs from the old `simple-ui.js` baseline. The app UI, code comments, and LLM prompts are in Chinese.

## Commands

Frontend (`cd web`):
- `npm install` — install deps
- `npm run dev` — Vite dev server on :5173 (proxies to the ST backend)
- `npm run test` — run the Vitest unit suite
- `npm run check` — run ESLint, Vitest, type-checking, and the production build
- `npm run build` — `vue-tsc -b && vite build` (type-check then bundle to `dist/`)
- `npm run build:install` — build, then deploy `dist/` into `SillyTavern/public/aibar/` for same-origin production serving

Backend (`cd SillyTavern`, Node >= 20):
- `npm install`
- `npm start` — `node server.js`
- `npm run lint` / `npm run lint:fix` — ESLint

## How the frontend reaches the backend

- **Dev**: `web/vite.config.ts` proxies `/api`, `/csrf-token`, `/thumbnail`, `/characters`, and `/User Avatars` to `VITE_ST_BACKEND` (`web/.env.development`, default `http://localhost:8001`). Note: `SillyTavern/config.yaml` defaults to port **8000** — if you run ST on its default port, either start it on 8001 or change `.env.development`.
- **Prod**: built assets are copied to `SillyTavern/public/aibar/` and served same-origin at `/aibar/`. `vite.config.ts` sets `base: '/aibar/'` only in production.
- The router uses **hash history** (`createWebHashHistory`) specifically so the app works under the `/aibar/` subpath without server-side history fallback.
- **CSRF/session**: `src/api/client.ts` `bootCsrf()` fetches `/csrf-token` once at startup (router `beforeEach` in `main.ts`), then every request sends `X-CSRF-Token`. `stores/session.ts` pings `/api/ping?extend=true` every 5 min to keep the session alive.

## Architecture of the Vue app (`web/src`)

- `api/` — thin wrappers over backend endpoints. `client.ts` provides `apiPost`/`apiPostForm`/`apiPostBlob`/`apiStream` (SSE). Generation goes through `/api/backends/chat-completions/generate` (`api/generate.ts`), streaming via Server-Sent Events parsed in `apiStream`.
- `lib/buildPayload.ts` — assembles the chat-completion request: `getSystemPrompt()` composes the system message from character fields + world info + mods + preset + persona; `buildGeneratePayload()` slices recent history (last 24), injects mod text by position, and maps to provider params. Provider-specific endpoint/secret handling lives in `lib/providers.ts`.
- `stores/` — one Pinia store per domain (`chat`, `characters`, `modelProfiles`, `presets`, `personas`, `mods`, `imageGen`, `tts`, `session`, `ui`). `chat.ts` owns the live conversation, streaming state, and swipes.
- `pages/` + `router/index.ts` — routes are lazy-loaded. Settings and Mods both render `SettingsPage.vue`.

## Persistence model (important)

There is no AIBAR database. State lives in three places:

- **App settings** (model profiles, etc.): stored inside SillyTavern's settings JSON under an `aibar` key, via `/api/settings/get|save` (`api/settings.ts`, `loadAibarSettings`/`saveAibarSettings`). Some stores migrate from legacy `localStorage` keys.
- **Chats**: persisted as SillyTavern JSONL chat files. The selected model profile, preset, world, and mods are written into the chat's JSONL **metadata** so they survive a browser refresh.
- **Stories & generated images**: served by **custom endpoints added to the ST fork** — `SillyTavern/src/endpoints/aibar.js` (mounted at `/api/aibar` in `src/server-startup.js`). Stories live under the user dir `aibar/stories`, images under `aibar/images`. These routes (`/api/aibar/stories/*`, `/api/aibar/images/*`) do not exist in upstream SillyTavern, so backend changes for stories/media go here.

When changing anything story/image/media-related end to end, expect to touch both `web/src/api/{stories,imageGen}.ts` and `SillyTavern/src/endpoints/aibar.js` (the submodule is on its own branch and committed separately).

## Discord hot-resource workflow

When the user asks to refresh Discord hot resources, import selected cards, retry failed imports, or classify standalone frontends, read and follow [`docs/discord-hot-import-runbook.md`](docs/discord-hot-import-runbook.md) before operating the browser. It is the executable runbook for the fixed Discord source, manifest handoff, `/下载` interaction, card validation, web-app classification, retries, and final QA.

Never persist Discord passwords, cookies, tokens, authorization headers, or signed CDN URLs in the repository. Use only the visible logged-in browser session, and treat attachment URLs as short-lived handoff data.
