# Backend - AI法阵生成服务

## 功能概览

- 提供异步 forge 接口：`POST /api/forge` + `GET /api/forge/status/{taskId}`
- 提供最小每日配额接口：`GET /api/player/quota` + `POST /api/admin/quota/reset`
- 支持炼金炉 A/B 双槽的 `0 / 1 / 2` 输入态
- forge 语义 LLM 负责输出 `name / attrSet / themeText`
- rulebase 负责 `generation / baseAtk / 兼容字段 / fallback / opening pool`
- 内嵌模块B `backend/alchemy_glyph_router/`，通过稳定 Python API `run_alchemy_glyph_router(...)` 把 `themeText` 转成最终 `videoPrompt`

## 启动

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 18001
```

启动后可访问：

- `http://localhost:18001/`
- `http://localhost:18001/docs`

## 环境变量

今后本项目唯一正式运行时配置文件是 `backend/.env`，唯一模板文件是
`backend/.env.example`。本地日常维护时，只需要维护 `backend/.env`。

```env
# Primary LLM
FORGE_USE_REAL_LLM=true
LLM_PROVIDER=openai_compat
LLM_BASE_URL=https://relay.tuyoo.com/v1
LLM_API_KEY=
OPENAI_COMPAT_MODEL=gpt-5.4

# Fallback LLM
GEMINI_API_KEY=
LLM_MODEL=gemini-3-flash-preview

# Forge / Debug
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=1
LOG_LEVEL=INFO
FORGE_DAILY_QUOTA=5
FORGE_QUOTA_TIMEZONE=Asia/Shanghai

# PixVerse Video API (Phase 2 Reserved)
PIXVERSE_BASE_URL=
PIXVERSE_API_KEY=
PIXVERSE_MODEL=c1
PIXVERSE_QUALITY=360p
PIXVERSE_ASPECT_RATIO=1:1
PIXVERSE_GENERATE_AUDIO=true
PIXVERSE_DURATION_SECONDS=1
PIXVERSE_WATERMARK=false
PIXVERSE_SEED=1320994540
PIXVERSE_MAX_RETRIES=1
PIXVERSE_POLL_INTERVAL_SECONDS=5
PIXVERSE_TIMEOUT_SECONDS=120
```

说明：

- forge 宿主 backend 与 glyph router 现在都以 `backend/.env` 为唯一文件级配置来源
- 项目根目录 `./.env` 与 `backend/alchemy_glyph_router/.env*` 不再是正式文件入口
- 推荐主用：`LLM_PROVIDER=openai_compat` + `OPENAI_COMPAT_MODEL=gpt-5.4`
- 当前 forge 语义阶段会把 `GEMINI_API_KEY + LLM_MODEL` 作为 fallback LLM
- glyph router 当前仍只使用 Primary LLM 区块，但也只读 `backend/.env`
- 当 `LLM_PROVIDER=openai_compat` 且未设置 `OPENAI_COMPAT_MODEL` 时，仍兼容回退到 `LLM_MODEL`
- `FORGE_USE_REAL_LLM=false` 时，forge 语义阶段直接走本地 fallback
- PixVerse 配置目前只做 Phase 2 预留，本轮未接入视频 API

更完整的接手说明见 [../docs/llm-env-alignment.md](../docs/llm-env-alignment.md)。

## 接口

### POST /api/forge

请求体：

```json
{
  "playerId": "player_xxx",
  "spellA": {
    "id": "spell_a",
    "type": "spell",
    "name": "赤焰印",
    "attrSet": ["fire"],
    "mainAttr": "fire",
    "themeText": "火焰主题的炼金法阵，中心像被压缩的熔火核心般稳定脉动。",
    "generation": 1
  },
  "spellB": null
}
```

说明：

- `spellA / spellB` 允许为 `null`
- 双空输入会直接走固定开局结果池
- 单输入与双输入进入统一 forge 语义链路

成功响应：

```json
{
  "taskId": "task_xxx",
  "status": "pending"
}
```

### GET /api/forge/status/{taskId}

```json
{
  "taskId": "task_xxx",
  "status": "completed",
  "result": {
    "name": "焚霜裂环",
    "attrSet": ["fire", "ice"],
    "themeText": "火焰与寒霜在边界清晰的炼金阵内相互撕扯，中央裂环向上抬升并完成一次受控释放。",
    "mainAttr": "fire",
    "subAttr": "ice",
    "element": "fire",
    "generation": 2,
    "baseAtk": 130.0,
    "videoPrompt": "最终中文视频 prompt",
    "promptRoute": "C",
    "promptRouteReason": "主题核心是地面内部向上破土生成事件",
    "promptFallbackApplied": false,
    "promptTemplate": "C_eruption_full",
    "promptModel": "gpt-5.4",
    "promptRouteElapsedMs": 3280,
    "promptGenerationElapsedMs": 12425,
    "promptTotalElapsedMs": 15707,
    "videoUrl": null,
    "status": "partial",
    "source": "llm",
    "inputState": "dual"
  },
  "error": null
}
```

### GET /api/player/quota

示例：

```text
GET /api/player/quota?playerId=player_xxx
```

### POST /api/admin/quota/reset

```json
{
  "playerId": "player_xxx",
  "applyToAll": false,
  "usedCount": 0,
  "dailyLimit": 5
}
```

## Forge 规则摘要

- 双空：直接从固定开局结果池中选择一个明确结果
- 单输入 / 双输入：调用 forge 语义 LLM 输出 `name / attrSet / themeText`
- `attrSet` 合法值只允许 `fire / ice / thunder / blight`
- forge LLM 返回非法 `attrSet` 时，先做关键词 rulebase 兜底，再退到已有 spell 属性，最后才随机
- `mainAttr = attrSet[0]`
- `subAttr = attrSet[1]`，不存在则为 `null`
- `element = mainAttr`
- 单/双输入 `generation = max(parent.gen) + 1`
- 双空固定开局候选当前为 Gen1
- `baseAtk = 100 * (1 + 0.3 * (generation - 1))`

## 模块B接入说明

- 当前只依赖其稳定入口：`run_alchemy_glyph_router(theme, save_output=False, verbose=False)`
- 宿主 backend 不直接耦合其私有模板、路由或生成实现
- 成功时保留：
  - `promptRoute`
  - `promptRouteReason`
  - `promptFallbackApplied`
  - `promptTemplate`
  - `promptModel`
  - `promptRouteElapsedMs`
  - `promptGenerationElapsedMs`
  - `promptTotalElapsedMs`
- 失败时使用本地 `videoPrompt` 回退，并把 `promptRoute` 记为 `local_fallback`

## 已知限制

- 任务状态仍保存在进程内存中，重启后丢失
- `videoUrl` 仍为 `null`
- 前端目前没有新增复杂配额 UI
- 视频 API / CLI / MP4 仍未接入

## 调试与验证

- 启动后端时会输出一条 `llm.runtime_snapshot` 日志，包含 `forge`、`forgeFallback`、`glyphRouter` 的脱敏配置摘要
- 可访问 `GET /api/debug/llm-config` 查看当前运行时实际命中的 provider、model、base_url、apiKeyHint、变量来源，以及是否检测到被忽略的旧 `.env` 文件
- 本地联调时可直接打开 `http://localhost:18001/api/debug/llm-config` 做运行时配置核对
