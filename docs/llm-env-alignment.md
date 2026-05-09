# 统一运行时敏感配置说明

本文是当前项目的敏感配置接手说明。今后本仓库的唯一正式运行时配置文件是：

```text
backend/.env
```

仓库内唯一保留的模板文件是：

```text
backend/.env.example
```

本地日常维护时，你只需要维护 `backend/.env` 这一份真实文件。

## 1. 当前正式入口

### 唯一正式配置文件

- `backend/.env`

### 唯一模板文件

- `backend/.env.example`

### 已废弃入口

- 项目根目录 `./.env`：已不再作为运行时读取入口
- `backend/alchemy_glyph_router/.env`
- `backend/alchemy_glyph_router/.env.example`

也就是说，后续不要再把 key 或模型配置写进仓库根目录 `.env`，也不要再给 glyph router 单独维护一份 `.env`。

## 2. `backend/.env.example` 现在包含哪些配置块

### Primary LLM

当前主 LLM 方案：

```env
FORGE_USE_REAL_LLM=true
LLM_PROVIDER=openai_compat
LLM_BASE_URL=https://relay.tuyoo.com/v1
LLM_API_KEY=
OPENAI_COMPAT_MODEL=gpt-5.4
```

用途：

- 宿主 forge 语义阶段的首选 LLM
- glyph router 的当前唯一 LLM 来源

### Fallback LLM

当前备用方案：

```env
GEMINI_API_KEY=
LLM_MODEL=gemini-3-flash-preview
```

用途：

- 当前主要作为 forge 语义阶段的备用 LLM
- 当主 provider 设为 `openai_compat` 且 forge 语义请求失败时，forge 会尝试回退到这套 Gemini 配置

说明：

- 当前 glyph router 仍只使用 Primary LLM 区块
- 也就是说，glyph router 与 forge 不会再读不同文件，但它目前不会直接调用 Gemini fallback

### Forge / Debug

```env
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=1
LOG_LEVEL=INFO
FORGE_DAILY_QUOTA=50
FORGE_QUOTA_TIMEZONE=Asia/Shanghai
```

### PixVerse Video API

当前已接入第一版最小后端闭环：

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

说明：

- `PIXVERSE_BASE_URL` 当前默认按国际版 OpenAPI v2 填 `https://app-api.pixverse.ai/openapi/v2`
- 提交与轮询最终路径分别是 `/video/text/generate` 与 `/video/result/{id}`
- `PIXVERSE_GENERATE_AUDIO_SWITCH` 对应文档真实请求字段 `generate_audio_switch`
- 国际版文档下，当前默认组合 `model=c1 + aspect_ratio=1:1 + duration=1 + generate_audio_switch=true` 成立
- 当前后端已打通 `videoPrompt -> 提交文生视频 -> 轮询状态 -> MP4 URL`
- 当前仍未接入 webhook、图生视频、模板能力与正式战斗替换

## 3. 运行时代码现在如何读取配置

### 文件级规则

文件级读取现在只认：

1. `backend/.env`

不会再读取：

- 项目根目录 `./.env`
- `backend/alchemy_glyph_router/.env`

补充说明：

- 如果部署环境本身已经注入系统环境变量，进程环境变量仍会覆盖文件值
- 但在本仓库里，唯一正式维护的文件入口仍然是 `backend/.env`

### 宿主 forge

- 首先看 `LLM_PROVIDER`
- 当 `LLM_PROVIDER=openai_compat` 时，主用 `LLM_BASE_URL / LLM_API_KEY / OPENAI_COMPAT_MODEL`
- 这时若 forge 主请求失败，会回退尝试 `GEMINI_API_KEY / LLM_MODEL`
- 当 `LLM_PROVIDER=gemini_rest` 时，则反过来主用 Gemini，OpenAI-compatible 作为备选

### glyph router

- 只读取 `LLM_BASE_URL / LLM_API_KEY / OPENAI_COMPAT_MODEL`
- 如果 `OPENAI_COMPAT_MODEL` 缺失，且当前 `LLM_PROVIDER=openai_compat`，允许兼容回退到 `LLM_MODEL`
- 但它仍然只从 `backend/.env` 这一份文件读取，不会再去读自己子目录的 `.env`

## 4. 现在主用哪个、备用哪个、如何切换

### 当前推荐口径

- 主用：`openai_compat`
- 备用：Gemini

也就是：

```env
LLM_PROVIDER=openai_compat
OPENAI_COMPAT_MODEL=gpt-5.4
LLM_MODEL=gemini-3-flash-preview
```

### 如果要切回 Gemini 主用

只需要把：

```env
LLM_PROVIDER=gemini_rest
```

改掉即可。此时：

- forge 主用 `GEMINI_API_KEY + LLM_MODEL`
- forge 备用会变成 openai-compatible
- glyph router 仍然读取 Primary LLM 区块里的 openai-compatible 配置

所以如果你真的切回 Gemini 主用，仍然建议保留 `LLM_BASE_URL / LLM_API_KEY / OPENAI_COMPAT_MODEL`，否则 glyph router 会缺配置。

## 5. 如何验证当前运行时到底读了哪套配置

### 方式 A：启动日志

启动后端后会输出：

```text
llm.runtime_snapshot
```

其中会包含：

- `fileConfigSource`
- `fileConfigPresent`
- `ignoredEnvFilesDetected`
- `forge`
- `forgeFallback`
- `glyphRouter`
- `aligned`
- `alignmentReason`

### 方式 B：调试接口

访问：

```text
GET /api/debug/llm-config
```

重点看这些字段：

- `forge.provider / model / baseUrl / apiKeyHint`
- `forgeFallback.provider / model / apiKeyHint`
- `glyphRouter.provider / model / baseUrl / apiKeyHint`
- `ignoredEnvFilesDetected`
- `fieldSources`

### 方式 C：forge / prompt router 日志

当前日志也会打印脱敏摘要：

- forge 语义阶段会打印主 provider 和 fallback provider
- prompt router 会打印 glyph router 实际命中的 `baseUrl / model / apiKeyHint / fieldSources`

## 6. 出现 `401 / 额度已用尽` 时先检查什么

建议按这个顺序看：

1. 看 `GET /api/debug/llm-config`
2. 确认 `glyphRouter.baseUrl / model / apiKeyHint`
3. 确认 `forge.provider` 与 `forgeFallback.provider`
4. 确认 `fieldSources.model` 来自哪个变量
5. 如果 `ignoredEnvFilesDetected` 里出现 `repo/.env`，说明机器上还有旧文件残留，但当前代码不会读取它
6. 如果主配置正确但仍 401，再确认当前 key 自身是否触发了供应商额度限制

## 7. 根目录 `.env` 现在怎么处理

根目录 `./.env` 已不再是正式入口。

本轮已经按“废弃并移除运行时依赖”的方向处理。后续如果有人在仓库根目录重新放回 `.env`：

- 运行时代码不会把它当成正式文件来源
- 调试快照会把它标记到 `ignoredEnvFilesDetected`

## 8. playerId 本地测试管理

这部分不放进 `backend/.env`，仍然是前端本地状态：

- 默认保存在 `localStorage` 的 `alchemy-forge-data.playerId`
- URL `?playerId=...` 可覆盖并持久化
- 控制台可用 `GameStorage.getPlayerIdInfo()` 查看
- 控制台可用 `GameStorage.setPlayerId('player_quota_b')` 切换
- 控制台可用 `GameStorage.resetPlayerId()` 重置

也就是说，后续敏感配置统一看 `backend/.env`，而本地 quota 测试身份仍通过前端本地持久化管理。
