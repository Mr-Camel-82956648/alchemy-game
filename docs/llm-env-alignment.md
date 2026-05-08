# LLM 配置对齐与本地验证说明

本文说明当前宿主 backend 与 `backend/alchemy_glyph_router/` 的 LLM 配置如何对齐、推荐怎么配、本地如何验证，以及出现 `401 / 额度已用尽` 时先看哪里。

## 1. 推荐主配置文件

本地开发时，推荐把 LLM 相关变量统一写在：

```text
backend/.env
```

原因：

- 宿主 backend 启动时会显式加载 `backend/.env`
- glyph router 现在也会优先复用 `backend/.env`
- 只有当 `backend/.env` 不存在时，glyph router 才会退回读取 `backend/alchemy_glyph_router/.env`

也就是说，日常联调应把 `backend/.env` 当成主配置，不要再默认把 router 单独配成另一套 `.env`。

## 2. 推荐变量格式

优先使用与 `backend/alchemy_glyph_router/.env.example` 对齐的格式：

```env
FORGE_USE_REAL_LLM=true
LLM_PROVIDER=openai_compat
LLM_BASE_URL=
LLM_API_KEY=
OPENAI_COMPAT_MODEL=
LLM_TIMEOUT_SECONDS=60
LLM_MAX_RETRIES=1
LOG_LEVEL=INFO
```

这是当前最容易让 forge 语义阶段与 glyph router 共用同一套 provider / key / model 的配置方式。

## 3. 新旧变量兼容关系

### 推荐统一方案

- `LLM_PROVIDER=openai_compat`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `OPENAI_COMPAT_MODEL`

此时：

- forge 语义 LLM 直接走这套 openai-compatible 配置
- glyph router 也走同一套 openai-compatible 配置

### 旧变量兼容

旧项目如果还在用 Gemini，当前仍兼容：

```env
LLM_PROVIDER=gemini_rest
GEMINI_API_KEY=
LLM_MODEL=gemini-2.0-flash
```

但要注意：

- forge 语义阶段会用 `GEMINI_API_KEY + LLM_MODEL`
- glyph router 不会直接使用 `GEMINI_API_KEY`
- 如果同时没配 `LLM_BASE_URL / LLM_API_KEY / OPENAI_COMPAT_MODEL`，glyph router 就无法与 forge 共用同一套 LLM

### openai_compat 的旧模型别名兼容

如果你已经切到：

```env
LLM_PROVIDER=openai_compat
```

但暂时只有：

```env
LLM_MODEL=...
```

而还没写 `OPENAI_COMPAT_MODEL`，则 glyph router 会兼容把 `LLM_MODEL` 当作模型别名使用。

推荐仍然尽快补齐 `OPENAI_COMPAT_MODEL`，避免语义歧义。

## 4. 当前配置读取优先级

### 文件级优先级

1. 进程环境变量 / 当前 shell 已导出的变量
2. `backend/.env`
3. `backend/alchemy_glyph_router/.env`，但只在 `backend/.env` 不存在时使用

### forge 语义阶段

1. `LLM_PROVIDER`
2. 若 `LLM_PROVIDER=openai_compat`
3. 读取 `LLM_BASE_URL`
4. 读取 `LLM_API_KEY`
5. 优先 `OPENAI_COMPAT_MODEL`
6. 若缺失则兼容回退到 `LLM_MODEL`
7. 若 `LLM_PROVIDER=gemini_rest`
8. 读取 `GEMINI_API_KEY`
9. 读取 `LLM_MODEL`

### glyph router

1. 读取 `LLM_BASE_URL`
2. 读取 `LLM_API_KEY`
3. 优先 `OPENAI_COMPAT_MODEL`
4. 仅当 `LLM_PROVIDER=openai_compat` 且 `OPENAI_COMPAT_MODEL` 缺失时，兼容回退到 `LLM_MODEL`

## 5. 现在如何验证“运行时到底读了哪套配置”

有两个最直接的入口：

### 方式 A：看后端启动日志

启动 `uvicorn app.main:app --reload --port 18001` 后，会输出一条：

```text
llm.runtime_snapshot
```

其中会包含脱敏后的：

- forge 当前 provider
- forge 当前 model
- glyph router 当前 model
- `baseUrl`
- `apiKeyHint`
- 变量来源，例如 `OPENAI_COMPAT_MODEL` 或 `LLM_MODEL`
- `aligned` 与 `alignmentReason`

### 方式 B：看调试接口

访问：

```text
GET /api/debug/llm-config
```

返回会明确给出：

- `forge`
- `glyphRouter`
- `sourceFamily`
- `fieldSources`
- `envFilesLoaded`
- `aligned`
- `alignmentReason`

这是当前最适合实机确认“宿主和 glyph router 是否真的共用同一套配置”的入口。

### 方式 C：看 prompt router 日志

在 forge 调用模块B时，`forge.prompt_router` 日志现在也会附带：

- `llmConfig.baseUrl`
- `llmConfig.apiKeyHint`
- `llmConfig.model`
- `llmConfig.sourceFamily`
- `llmConfig.fieldSources`

因此当 reveal 调试区里看到 `local_fallback` 时，可以直接对照后端日志确认当时 glyph router 实际命中的变量族。

## 6. 出现 `401 / 额度已用尽` 时先检查什么

优先按这个顺序看：

1. 先请求 `GET /api/debug/llm-config`
2. 确认 `glyphRouter.provider` 是否是你预期的 provider
3. 确认 `glyphRouter.baseUrl / model / apiKeyHint` 是否对应你当前想用的那套账号
4. 看 `glyphRouter.fieldSources.model` 是来自 `OPENAI_COMPAT_MODEL` 还是旧的 `LLM_MODEL`
5. 如果 `forge.provider` 和 `glyphRouter.provider` 不同，先处理配置分叉，再继续查业务逻辑
6. 如果 provider / key / model 都对，但仍然 `401`，再去确认该 key 是否真的到达日额度或账号额度

当前这类 `local_fallback` 的一个主要来源不是模板路由逻辑本身，而是 glyph router 在 route 阶段调用其实际命中的 LLM 时被上游直接拒绝。

## 7. playerId 本地测试管理

当前前端的 `playerId` 规则已经整理为：

- 默认保存在 `localStorage` 的 `alchemy-forge-data.playerId`
- 首次没有值时会自动生成 `player_xxx`
- URL 参数 `?playerId=your_test_id` 会覆盖并持久化到本地

### 常用操作

浏览器地址栏切换测试号：

```text
http://localhost:8000/?playerId=player_quota_a
```

浏览器控制台查看当前状态：

```js
GameStorage.getPlayerIdInfo()
```

浏览器控制台手动切换：

```js
GameStorage.setPlayerId('player_quota_b')
```

浏览器控制台重置成新随机号：

```js
GameStorage.resetPlayerId()
```

这对 quota 测试的帮助是：

- 可以稳定复现同一个玩家的配额消耗
- 可以快速切换到另一个测试玩家，不必手动清整个 localStorage
- 前端发起 forge 请求时，控制台会打印本次使用的 `playerId`
