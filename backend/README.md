# Alchemy Game Node Backend

This is the Node backend for Alchemy Game. It keeps the public API shape used by
the current frontend and listens on port `18001` by default.

## Run

Split local frontend/backend mode:

```powershell
cd backend
npm start
```

Keep using the existing frontend server at `http://localhost:8000/`; the
frontend detects ports `8000` and `8080` as split local static servers and calls
the backend at `http://localhost:18001`.

Optional static hosting from the repo root:

```powershell
$env:ALCHEMY_SERVE_STATIC='1'
npm start
```

Then open:

- `http://localhost:18001/api/debug/llm-config`
- `http://localhost:18001/api/assets/cards`
- `http://localhost:18001/frontend/` when static hosting is enabled

## Docker

```powershell
cd backend
docker compose up --build
```

The compose file reads `backend/.env` at runtime and persists backend state
to `backend/data/`. The `.env` file is excluded from the image build context
by the repository root `.dockerignore`.

## Smoke Test

```powershell
cd backend
npm run smoke
```

The smoke test disables AI auth and real LLM calls, starts the backend on a
temporary port, and checks the core assets, quota, forge, and card video state
APIs.

## Runtime Scope

- Compatible API routes for the frontend game loop.
- JSON-backed quota and card/video state under `backend/data/`.
- Static built-in card assets are read from `backend/resources/assets/cards/`.
- Forge semantic prompts and glyph router templates are bundled under
  `backend/resources/`.
- Optional real OpenAI-compatible forge calls and PixVerse calls use
  `backend/.env`.

## Desktop Packaging Direction

Electron can start `backend/src/desktop-entry.js` instead of invoking
another runtime. The desktop entry serves both API routes and static files, so
the packaged app no longer needs a separate static server or a system Python
installation.
