# Backend - AI法阵生成服务

## 功能概览

- 提供异步 forge 接口：`POST /api/forge` + `GET /api/forge/status/{taskId}`
- 提供最小每日配额接口：`GET /api/player/quota` + `POST /api/admin/quota/reset`
- 支持炼金炉 A/B 双槽的 `0 / 1 / 2` 输入态
- forge 语义 LLM 负责输出 `name / attrSet / themeText`
- rulebase 负责 `generation / baseAtk / 兼容字段 / fallback / opening pool`
- 内嵌模块B `backend/alchemy_glyph_router/`，通过稳定 Python API `run_alchemy_glyph_router(...)` 把 `themeText` 转成最终 `videoPrompt`
- 提供 PixVerse 最小后端闭环：从现有 `videoPrompt` 提交文生视频、轮询状态并拿到 MP4 URL

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

# PixVerse Video API
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

说明：

- forge 宿主 backend 与 glyph router 现在都以 `backend/.env` 为唯一文件级配置来源
- 项目根目录 `./.env` 与 `backend/alchemy_glyph_router/.env*` 不再是正式文件入口
- 推荐主用：`LLM_PROVIDER=openai_compat` + `OPENAI_COMPAT_MODEL=gpt-5.4`
- 当前 forge 语义阶段会把 `GEMINI_API_KEY + LLM_MODEL` 作为 fallback LLM
- glyph router 当前仍只使用 Primary LLM 区块，但也只读 `backend/.env`
- 当 `LLM_PROVIDER=openai_compat` 且未设置 `OPENAI_COMPAT_MODEL` 时，仍兼容回退到 `LLM_MODEL`
- `FORGE_USE_REAL_LLM=false` 时，forge 语义阶段直接走本地 fallback
- PixVerse 当前已接入第一版最小闭环：`POST /openapi/v2/video/text/generate` + `GET /openapi/v2/video/result/{id}`
- `PIXVERSE_BASE_URL` 当前默认按国际版 OpenAPI v2，推荐直接填 `https://app-api.pixverse.ai/openapi/v2`
- `PIXVERSE_GENERATE_AUDIO_SWITCH` 对应文档真实字段 `generate_audio_switch`
- 国际版文档下，当前默认组合 `model=c1 + aspect_ratio=1:1 + duration=1 + generate_audio_switch=true` 成立
- 国内版 `.cn` 与国际版 `.ai` 的 endpoint / key 不能混用；此前 `ErrCode=10005, apiKey is not registered` 的已定位根因就是“国际版 key 命中了国内版 endpoint”

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

## PixVerse 调试接口

### POST /api/video/pixverse/from-forge/{forgeTaskId}

- 从已完成的 forge task 读取 `videoPrompt`
- 创建本地 `videoTaskId`
- 后台提交 PixVerse 文生视频任务并自动轮询

成功响应示例：

```json
{
  "videoTaskId": "vtask_xxx",
  "forgeTaskId": "task_xxx",
  "pixverseVideoId": 123456,
  "traceId": "uuid-for-submit",
  "lastPollTraceId": null,
  "status": "polling",
  "providerStatus": 5,
  "providerErrCode": 0,
  "providerErrMsg": "Success",
  "error": null,
  "resultUrl": null,
  "promptSummary": "焚霜裂环",
  "promptLength": 187,
  "submitAttempts": 1,
  "pollCount": 0,
  "createdAt": 1746670000000,
  "updatedAt": 1746670000000,
  "finishedAt": null,
  "events": []
}
```

### GET /api/video/pixverse/status/{videoTaskId}

- 查询单个本地视频任务状态
- `status` 为本地状态：`queued / submitting / polling / succeeded / failed`
- `providerStatus` 为 PixVerse 轮询状态：`1 / 5 / 7 / 8`
- 只有 `status=succeeded` 且 `providerStatus=1` 时，`resultUrl` 才可用

### GET /api/debug/pixverse/config

- 查看当前 PixVerse 运行时配置快照与字段来源

### GET /api/debug/pixverse/tasks

- 查看最近 PixVerse 本地任务列表
- 支持 `?forgeTaskId=task_xxx` 过滤某次 forge 对应的视频任务

### GET /api/debug/pixverse/tasks/{videoTaskId}

- 按单个 `videoTaskId` 查看最新调试信息
- 返回当前任务摘要 + 当前 PixVerse 配置摘要 + 最近一次提交外呼诊断 + 最近一次轮询外呼诊断
- 成功闭环时可直接在 `task.status / task.providerStatus / task.resultUrl` 中看到 `succeeded / 1 / MP4 URL`
- 外呼诊断会包含：
  - 完整 endpoint URL
  - 脱敏后的请求头摘要（`API-KEY` 只显示 hint）
  - `traceId`
  - HTTP status
  - `ErrCode / ErrMsg`
  - `providerStatus`
  - provider 返回体摘要

## PixVerse 排障

### `ErrCode=10005, apiKey is not registered` 先检查什么

建议优先按这个顺序排：

1. 确认 `backend/.env` 里的 `PIXVERSE_API_KEY` 是否真的是 PixVerse API 平台发放的 key，而不是网页端会员、普通登录态或别的环境的凭证。
2. 打开 `GET /api/debug/pixverse/config`，核对当前后端实际读到的：
   - `baseUrl`
   - `submitUrl`
   - `resultUrlTemplate`
   - `apiKeyHint`
   - `model / quality / aspectRatio / durationSeconds / generateAudioSwitch`
   - `fieldSources`
3. 打开 `GET /api/debug/pixverse/tasks/{videoTaskId}`，确认最近一次提交诊断里的：
   - `url`
   - `requestHeaders`
   - `traceId`
   - `httpStatus`
   - `providerErrCode`
   - `providerErrMsg`
4. 如果这里已经明确是 `https://app-api.pixverse.ai/openapi/v2/video/text/generate`、header 名是 `API-KEY` 和 `Ai-trace-id`，且服务端返回 `10005 apiKey is not registered`，更像是 key 本身未注册、未开通 API 服务、被停用，或 key 与当前平台环境不匹配，而不是宿主主链逻辑问题。
5. 如果手里拿的是国际版 key，但调试接口里 `baseUrl` 仍是旧的 `.cn` 域名，那优先修正 `backend/.env` / `PIXVERSE_BASE_URL`，再重试。
6. 当前已验证过真实国际版闭环：提交命中 `.ai` 域名后，轮询可从 `status=5` 继续走到 `status=1`，本地 `videoTask.status` 会收口到 `succeeded`，同时写入 `resultUrl`。

### 如何看当前 PixVerse 配置摘要

- `GET /api/debug/pixverse/config`

重点看：

- `configSource`
- `baseUrl`
- `submitUrl`
- `resultUrlTemplate`
- `apiKeyHint`
- `fieldSources`

### 如何看某个 video task 的最近一次外呼诊断

- 先通过 `GET /api/debug/pixverse/tasks` 找到目标 `videoTaskId`
- 再访问 `GET /api/debug/pixverse/tasks/{videoTaskId}`

其中：

- `latestSubmitCall` 是最近一次提交文生视频请求的诊断
- `latestPollCall` 是最近一次状态轮询请求的诊断

### 适合拿去和平台 / 供应商同事确认的信息

- 时间点
- 请求 endpoint URL
- `traceId`
- `HTTP status`
- `ErrCode`
- `ErrMsg`
- `apiKeyHint`

这些信息足够帮助对方在服务端侧检索请求，但不会暴露完整 key。

## 已知限制

- 任务状态仍保存在进程内存中，重启后丢失
- forge 结果里的 `videoUrl` 仍不自动回填，当前 MP4 URL 先保存在独立 PixVerse 任务里
- 前端目前没有新增复杂配额 UI
- 当前只接入 PixVerse 文生视频最小闭环，未接 webhook、图生视频、模板、lipsync、sound effect、多镜头或正式战斗替换

## 调试与验证

- 启动后端时会输出一条 `llm.runtime_snapshot` 日志，包含 `forge`、`forgeFallback`、`glyphRouter` 的脱敏配置摘要
- 可访问 `GET /api/debug/llm-config` 查看当前运行时实际命中的 provider、model、base_url、apiKeyHint、变量来源，以及是否检测到被忽略的旧 `.env` 文件
- 本地联调时可直接打开 `http://localhost:18001/api/debug/llm-config` 做运行时配置核对
- PixVerse 会输出 `pixverse.task_created / submit_attempt / submit_success / submit_failed / poll_result / poll_error / task_completed / task_failed` 这些日志，方便观察 endpoint、trace id、HTTP status、ErrCode/ErrMsg、轮询状态和最终 URL
