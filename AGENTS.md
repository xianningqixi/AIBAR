# AGENTS.md

Canonical guidance for AI coding agents (Claude Code, Codex, etc.) working in this repository. `CLAUDE.md` imports this file — edit here, not there. Human contributor workflow lives in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Repository layout

This repo is two coupled parts plus local/optional companions:

- `web/` — **AIBAR**, a standalone Vue 3 + TypeScript SPA. This is the app you'll almost always be editing. It is a character.ai / aifuck.cc-style "browse cards → enter chat" frontend.
- `SillyTavern/` — a git submodule (fork `xianningqixi/SillyTavern`, branch `main`) that provides the **backend HTTP API**. AIBAR has no backend of its own; it reuses SillyTavern's routes plus custom `/api/aibar` endpoints added in the fork.
- `telegram-bot/` — optional Telegram companion using a dedicated AIBAR account.
- `discord-import-service/` — local-only Node 20 T+1 orchestrator for Discord discovery coverage and manifest generation. It runs on the administrator's computer, never on the deployed AIBAR server, and never owns Discord credentials.

`docs/PLAN.md` (Chinese) is the original implementation/parity plan and is the best source for *why* things are built the way they are. The app UI, code comments, and LLM prompts are in Chinese.

## Commands

Frontend (`cd web`):
- `npm run dev` — Vite dev server on :5173 (proxies to the ST backend)
- `npm run check` — ESLint (zero warnings), Vitest, type-check and production build. **This is the quality gate; run it before finishing any frontend change.** CI runs the same entry point.
- `npm run build:install` — build, then deploy `dist/` into `SillyTavern/public/aibar/` for same-origin production serving

Backend (`cd SillyTavern`, Node >= 20):
- `npm start` — `node server.js`
- `npm run test:aibar` — Node test suite for the AIBAR backend extensions
- `npm run lint` / `npm run lint:fix` — ESLint

Local Discord import service (`cd discord-import-service`, Node >= 20):
- `npm start` — loopback service on `127.0.0.1:4317`
- `npm run client -- latest` — inspect the latest local T+1 job
- `npm run check` — Node tests and syntax check

## How the frontend reaches the backend

- **Dev**: `web/vite.config.ts` proxies `/api`, `/csrf-token`, `/thumbnail`, `/characters`, and `/User Avatars` to `VITE_ST_BACKEND` (`web/.env.development`, default `http://localhost:8001`). Note: `SillyTavern/config.yaml` defaults to port **8000** — either start ST on 8001 or change `.env.development`.
- **Prod**: built assets are copied to `SillyTavern/public/aibar/` and served same-origin at `/aibar/`. `vite.config.ts` sets `base: '/aibar/'` only in production.
- The router uses **hash history** (`createWebHashHistory`) specifically so the app works under the `/aibar/` subpath without server-side history fallback.
- **CSRF/session**: `src/api/client.ts` `bootCsrf()` fetches `/csrf-token` once at startup (router `beforeEach`), then every request sends `X-CSRF-Token`. `stores/session.ts` pings `/api/ping?extend=true` every 5 min to keep the session alive.

## Architecture of the Vue app (`web/src`)

- `api/` — thin wrappers over backend endpoints, camelCase file names. `client.ts` provides `apiPost`/`apiPostForm`/`apiPostBlob`/`apiStream` (SSE). Admin generation goes through `/api/backends/chat-completions/generate` (`api/generate.ts`); regular users call shared models via `/api/aibar/models/generate`.
- `lib/` — pure logic, unit-tested with Vitest (`*.test.ts` next to sources). `buildPayload.ts` assembles the chat-completion request: `getSystemPrompt()` composes the system message from character fields + world info + mods + preset + persona; `buildGeneratePayload()` selects recent history within a size budget, injects mod text by position, and maps to provider params. Provider metadata lives in `lib/providers.ts`.
- `stores/` — one Pinia store per domain (`chat`, `characters`, `modelProfiles`, `presets`, `personas`, `mods`, `imageGen`, `tts`, `session`, `billing`, `ui`). `chat.ts` owns the live conversation, streaming state, and swipes.
- `pages/` (PascalCase `*Page.vue`) + `router/index.ts` — routes are lazy-loaded.
- `components/` — grouped by domain: `chat`, `community`, `image`, `layout`, `mods`, `settings`, `ui`, `world`.

Architecture rules: pages read stores and dispatch actions, never `fetch()` directly; stores are the only owners of mutable state; `api/` stays a pure fetch wrapper; no global event bus.

## Persistence model (important)

There is no standalone AIBAR database server. State lives in four places:

- **Per-account app settings** (presets, personas, mods, etc.): stored inside SillyTavern's settings JSON under an `aibar` key, via `/api/settings/get|save` (`api/settings.ts`).
- **Chats**: SillyTavern JSONL chat files. The selected model profile, preset, world, and mods are written into the chat's JSONL **metadata** so they survive a browser refresh.
- **Stories & generated images**: custom endpoints in the ST fork — `SillyTavern/src/endpoints/aibar.js` (mounted at `/api/aibar`). Stories live under the user dir `aibar/stories`, images under `aibar/images`.
- **Shared community data**: `SillyTavern/src/aibar-community-db.js` keeps a SQLite WAL database at `DATA_ROOT/_aibar/community.sqlite` (works, immutable versions, favorites, ratings, comments, invites, registration review, Discord import batches). Community/review routes live in `src/endpoints/aibar-community.js` and `src/endpoints/aibar-public.js`.

None of these custom routes exist in upstream SillyTavern. When changing anything story/image/media/community-related end to end, expect to touch both `web/src/api/*.ts` and the `SillyTavern/src/endpoints/aibar*.js` files — and remember the submodule is on its own branch: **commit and push the submodule first, then commit the new submodule pointer in the main repo**.

## Discord hot-resource workflow

When the user asks to refresh Discord hot resources, import selected cards, retry failed imports, or classify standalone frontends (e.g. via `/discord-import`), read and follow [`docs/discord-hot-import-runbook.md`](docs/discord-hot-import-runbook.md) before operating the browser. It is the executable runbook for the fixed Discord source, manifest handoff, `/下载` interaction, card validation, web-app classification, retries, and final QA.

For scheduled T+1 discovery, the local service contract and ownership boundary are defined in [`docs/local-discord-import-service.md`](docs/local-discord-import-service.md). Keep browser automation local and visible; do not move its scheduler, state, or Discord session into SillyTavern.

Never persist Discord passwords, cookies, tokens, authorization headers, or signed CDN URLs in the repository. Use only the visible logged-in browser session, and treat attachment URLs as short-lived handoff data.
