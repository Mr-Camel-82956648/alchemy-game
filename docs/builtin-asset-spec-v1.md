# Built-In Asset Spec v1

This document is the current spec for committed `built_in` and `curated` card
assets.

## Directory Layout

Each static asset is a self-contained directory:

```text
backend/resources/assets/cards/<assetId>/
  metadata.json
  video.mp4
  thumbnail.webp
```

`video.mp4` and `thumbnail.webp` are recommended filenames. If another filename
or a subdirectory is needed, write that relative path in `metadata.json`.

## Metadata

```json
{
  "id": "fire-basic-01",
  "name": "炎龙法阵",
  "sourceType": "built_in",
  "category": "default_pool",
  "attrSet": ["fire"],
  "generation": 1,
  "inputPhrase": "火龙法阵",
  "videoPrompt": "最终视频提示词",
  "description": "默认火系资产。",
  "videoPath": "video.mp4",
  "thumbnailPath": "thumbnail.webp",
  "sfxPath": "video.mp4",
  "origin": "handcrafted",
  "originCardId": null,
  "curationNote": null
}
```

Required fields:

- `id`: unique asset id, matching the directory name.
- `name`: display name.
- `sourceType`: `built_in` or `curated`.
- `category`: usually `starter` or `default_pool`.
- `attrSet`: one to three of `fire`, `ice`, `thunder`, `blight`.
- `generation`: normally `1` for static pool assets.
- `videoPath`: relative path from the asset directory.
- `thumbnailPath`: relative path from the asset directory.

Optional fields:

- `inputPhrase`
- `videoPrompt`
- `description`
- `sfxPath`
- `origin`
- `originCardId`
- `curationNote`

## Runtime API

`GET /api/assets/cards` scans `backend/resources/assets/cards/` and returns
frontend-ready URLs:

- `thumbnailUrl`
- `videoUrl`
- `resultUrl`
- `sfxUrl`

Metadata should store relative file paths. The API layer resolves those paths
into `/api/assets/files/cards/...` URLs, and the frontend finalizes them through
`AlchemyRuntime.resolveMediaUrl()`.

If metadata exists but a referenced media file is missing, the asset is still
listed with `mediaReady=false`, `missingMedia`, and `null` for the missing URL.

## Curated Assets

To promote a player-generated result into a static pool:

1. Create `backend/resources/assets/cards/<assetId>/`.
2. Copy or download the final video as `video.mp4`.
3. Add a local `thumbnail.webp`.
4. Create `metadata.json`.
5. Use `sourceType: "curated"`.
6. Set `origin: "player_generated"` and record the source card in
   `originCardId` when available.
7. Keep external PixVerse URLs out of static metadata; static assets should be
   self-contained.
