# LLM Runtime Configuration

The current backend is the Node implementation under `backend/`. The single
official local runtime config file is:

```text
backend/.env
```

The committed template is:

```text
backend/.env.example
```

Do not commit a real `.env` file. It is ignored by both `.gitignore` and
`.dockerignore`.

## Required LLM Fields

```env
FORGE_USE_REAL_LLM=true
LLM_PROVIDER=openai_compat
LLM_BASE_URL=https://zgc.apihy.com/v1
LLM_API_KEY=
OPENAI_COMPAT_MODEL=gpt-5.4
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=1
```

The forge semantic step and the glyph prompt router share this same
OpenAI-compatible GPT config. There is no Gemini or backup provider in the
current Node backend; debug output should report `forgeFallback.provider` as
`disabled`.

## PixVerse Fields

```env
PIXVERSE_BASE_URL=https://app-api.pixverse.ai/openapi/v2
PIXVERSE_API_KEY=
PIXVERSE_MODEL=c1
PIXVERSE_QUALITY=360p
PIXVERSE_ASPECT_RATIO=1:1
PIXVERSE_GENERATE_AUDIO_SWITCH=true
PIXVERSE_DURATION_SECONDS=1
PIXVERSE_WATERMARK=false
PIXVERSE_SEED=1320994540
PIXVERSE_MAX_RETRIES=1
PIXVERSE_POLL_INTERVAL_SECONDS=5
PIXVERSE_TIMEOUT_SECONDS=120
```

## Internal Access

```env
FORGE_REQUIRE_AI_AUTH=true
INTERNAL_API_PASSWORD=
FORGE_DAILY_QUOTA=50
FORGE_QUOTA_TIMEZONE=Asia/Shanghai
```

## Verification

Start the Node backend and inspect:

```text
GET /api/debug/llm-config
```

Expected shape:

- `forge.provider = openai_compat`
- `forge.baseUrl = https://zgc.apihy.com/v1`
- `forge.model = gpt-5.4`
- `glyphRouter.provider = openai_compat`
- `glyphRouter.baseUrl = https://zgc.apihy.com/v1`
- `glyphRouter.model = gpt-5.4`
- `forgeFallback.provider = disabled`
- `aligned = true`
- `envFilesLoaded` includes `backend/.env`

If the route falls back locally, first check `missing`, `baseUrl`, `model`, and
the masked `apiKeyHint` in this debug response.
