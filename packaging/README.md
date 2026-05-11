# Electron Packaging v1

This directory contains the first Windows desktop packaging path for the project.

Current scope:

- Reuse the existing Electron launcher prototype.
- Build `win-unpacked` for local smoke validation.
- Build `zip` for first-round distribution.
- Keep backend as Python source code instead of converting it to an exe.
- Keep backend business logic unchanged.

Out of scope for this stage:

- Installer / NSIS.
- Backend bundling as a standalone Python runtime.
- Code signing / polished Windows executable metadata.

## What Gets Packaged

Build-time staging copies these runtime files into `packaging/runtime/app/` and then ships them as Electron `extraResources`:

- `index.html`
- `alchemy_intro_book/`
- `frontend/`
- `backend/`

The Electron app itself only packages:

- `packaging/electron/main.js`
- `packaging/electron/preload.js`
- `packaging/electron/scripts/`
- `packaging/electron/assets/`

## Runtime Strategy

### Frontend

- `frontend/`, `alchemy_intro_book/`, and root `index.html` are bundled as static resources.
- Electron still opens the app over local HTTP instead of `file://`.
- The packaged app starts `python -m http.server` against the staged runtime root.

### Backend

- First version still depends on local Python in `PATH`.
- The packaged app starts `python -m uvicorn app.main:app` from the staged `backend/`.
- Target machine still needs Python and backend dependencies installed.

### `backend/.env`

- `backend/.env` remains the only formal runtime config file.
- `prepare:runtime` copies local `backend/.env` by default so local packaging smoke can hit the real `openai_compat` path.
- To avoid embedding secrets into a build artifact, run:

```powershell
$env:PACKAGING_COPY_BACKEND_ENV='0'
npm run prepare:runtime
```

- `backend/.env.example` is always kept in the staged backend.

### User Config Directory

- v1 does not introduce a separate user config directory yet.
- Current tradeoff: config stays coupled to the shipped runtime tree, which is simple for local validation but not ideal for broader external distribution.

## Prerequisites

- Node.js 18+
- Python available in `PATH` (`python` or `py -3`)
- Backend dependencies installed once:

```powershell
cd backend
pip install -r requirements.txt
```

## Electron Build Scripts

```powershell
cd packaging/electron
npm install
npm run pack:win
npm run dist:win
```

Scripts:

- `npm run prepare:runtime`: stage runtime files into `packaging/runtime/app`
- `npm run pack:win`: build `packaging/release/win-unpacked/`
- `npm run dist:win`: build `packaging/release/Alchemy Game-0.1.0-win.zip`

## Build Notes

- `productName`: `Alchemy Game`
- `appId`: `com.alchemygame.desktop`
- Windows icon is wired from `packaging/electron/assets/icon.ico`
- Output directory is `packaging/release/`
- Current distributable target is `zip`; unpacked validation target is `win-unpacked`
- `electron-builder` is configured to reuse local `node_modules/electron/dist`, which avoids redownloading Electron itself during packaging

If this machine cannot access GitHub for builder helper binaries, set a mirror first:

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
```

## Smoke Test Checklist

1. Launch `packaging/release/win-unpacked/Alchemy Game.exe`
2. Confirm `http://127.0.0.1:8000/` responds
3. Confirm `http://127.0.0.1:18001/docs` responds
4. Confirm `GET /api/debug/llm-config` shows:
   - `forge.provider=openai_compat`
   - `glyphRouter.provider=openai_compat`
   - `forgeFallback.provider=gemini_rest`
   - `envFilesLoaded=["backend/.env"]`
5. Send one minimal `POST /api/forge` request and wait for `completed`

## Known Pitfalls

- If `ELECTRON_RUN_AS_NODE=1` exists in the shell, packaged Electron will start in Node mode and exit immediately. Clear it first:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

- On this machine, `winCodeSign` extraction requires privileges that are not available in the current environment. To keep v1 packaging buildable, the Windows build currently uses:

```json
"signAndEditExecutable": false
```

This keeps `win-unpacked` and `zip` buildable, but a later release machine should restore executable resource editing for a more polished Windows EXE icon / metadata result.

## Current Verified Result

Current verified packaging path:

- `npm run pack:win` succeeds
- `npm run dist:win` succeeds
- `packaging/release/win-unpacked/Alchemy Game.exe` starts successfully after clearing `ELECTRON_RUN_AS_NODE`
- backend is started from packaged runtime resources
- static server is started from packaged runtime resources
- `GET /api/debug/llm-config` returns `forge.provider=openai_compat`
- a real packaged `POST /api/forge` smoke request reaches `completed`
