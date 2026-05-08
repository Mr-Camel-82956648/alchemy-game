# Forge 协议与字段说明

本文是当前有效的 forge / quota / prompt-router 协议说明。旧文档里若仍写“LLM 只产出 `visualDesc / fusionPrompt`”，以本文为准。

## 1. 输入态

当前 A/B 双槽统一支持四种输入态：

- A 空，B 空
- A 有，B 空
- A 空，B 有
- A 有，B 有

行为约定：

- 双空：不进入 forge 语义 LLM，直接走后端固定开局结果池。
- 单输入：进入 forge 语义链路，由 forge LLM 产出 `name / attrSet / themeText`。
- 双输入：进入同一条 forge 语义链路，由 forge LLM 产出 `name / attrSet / themeText`。
- 最终 `videoPrompt` 统一由模块B `run_alchemy_glyph_router(theme, save_output=False, verbose=False)` 基于 `themeText` 生成。

## 2. 请求协议

### POST /api/forge

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

- `playerId` 仍用于 quota 统计。
- `spellA / spellB` 现在都允许为 `null`。
- `attrSet` 仍是主口径；若未提供，会回退到 `[mainAttr]`。
- `themeText` 是可选上游语义补充；旧卡没有也不会报错。

成功响应：

```json
{
  "taskId": "task_xxx",
  "status": "pending"
}
```

## 3. 状态协议

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

## 4. 字段来源

| 字段 | 来源 | 说明 |
|------|------|------|
| `name` | forge LLM / fallback / opening pool | 新法阵名称 |
| `attrSet` | forge LLM 优先，rulebase 校验与 fallback | 当前核心语义字段 |
| `themeText` | forge LLM / fallback / opening pool | 提供给模块B的上游主题文本 |
| `mainAttr` | rulebase | `attrSet[0]` 的兼容字段 |
| `subAttr` | rulebase | `attrSet[1]` 的兼容字段 |
| `element` | rulebase | 等于 `mainAttr` |
| `generation` | rulebase | 单/双输入取 `max(parent.gen) + 1`；双空固定开局候选为 Gen1 |
| `baseAtk` | rulebase | 按现有世代公式推导 |
| `videoPrompt` | 模块B / 本地回退 | 最终中文视频 prompt |
| `promptRoute* / promptTemplate / promptModel` | 模块B | 路由、模板、模型、耗时审计字段 |
| `videoUrl` | rulebase | 当前仍固定为 `null` |
| `status` | rulebase | 当前固定为 `"partial"` |
| `source` | rulebase | `opening_pool / llm / fallback` |
| `inputState` | rulebase | `empty / single / dual` |

补充说明：

- `source` 表示这张结果卡最初是从哪一层产出的，例如双空输入时常见 `source=opening_pool`
- `promptRoute` 表示模块B后续为 `themeText -> videoPrompt` 选择了哪一个模板路由，例如 `E`
- 这两个字段不是同一层概念，所以 `source=opening_pool`、`promptRoute=E`、`promptFallbackApplied=false` 同时出现并不冲突；它表示“卡的来源是开局池，但它的后续视频 prompt 仍正常经过了模板路由阶段”

## 5. Forge LLM 输出协议

当前 forge 语义 LLM 只允许输出：

```json
{
  "name": "新法阵名称",
  "attrSet": ["fire", "ice"],
  "themeText": "1到3句中文主题描述"
}
```

注意：

- `attrSet` 只能使用 `fire / ice / thunder / blight`。
- `text` 输入必须参与 `attrSet` 推断，不能被视为空壳。
- `themeText` 是给模块B继续路由和扩写的视频主题文本，不是最终厂商 prompt。
- 后端不会再接受 `visualDesc / fusionPrompt` 作为正式输出字段。

## 6. 属性 fallback 规则

- 第一步：优先采用 forge LLM 返回的合法 `attrSet`。
- 第二步：若 LLM 缺失或返回非法 `attrSet`，尝试轻量关键词 rulebase 兜底。
- 第三步：若关键词仍无法判定，再回退到已有 spell 输入的合并属性。
- 第四步：随机仅作为最后手段。

## 7. 双空固定开局结果来源

当前双空输入复用项目现有四个单属性起始法阵概念作为固定开局结果池：

- `熔岩法阵`
- `冰凌法阵`
- `星环法阵`
- `剧毒法阵`

这样可以直接复用当前项目已经存在的单属性起始语义，不引入新 UI、新素材或额外系统。

## 8. Quota 协议

### GET /api/player/quota

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

## 9. 卡牌视频资产协议

### POST /api/video/pixverse/cards/register

用于把前端已有的 player-generated 卡登记到后端轻量状态仓库。最小请求体示例：

```json
{
  "cards": [
    {
      "cardId": "card_xxx",
      "forgeTaskId": "task_xxx",
      "name": "焚霜裂环",
      "attrSet": ["fire", "ice"],
      "generation": 2,
      "themeText": "火焰与寒霜在边界清晰的炼金阵内相互撕扯。",
      "videoPrompt": "最终中文视频 prompt",
      "thumbnailUrl": "data:image/webp;base64,...",
      "sourceType": "player_generated",
      "status": "not_generated"
    }
  ]
}
```

### POST /api/video/pixverse/from-card/{cardId}

- 从卡牌维度启动 PixVerse 生成
- 若当前 `cardId` 已有 `queued / submitting / polling` 任务，则直接复用
- 若当前 `cardId` 已有完成结果，则直接返回已完成资产状态
- 若上一轮失败，则允许再次调用重新提交

### GET /api/video/pixverse/card/{cardId}

返回卡牌视角的资产状态，核心字段包括：

- `assetId`
- `cardId`
- `forgeTaskId`
- `sourceType`
- `status`
- `videoTaskId`
- `pixverseVideoId`
- `providerStatus`
- `resultUrl`
- `videoUrl`
- `error`

状态口径：

- `not_generated`
- `generating`
- `completed`
- `failed`

### GET /api/assets/cards

统一卡牌资产库入口。当前会汇总：

- `built_in`
- `player_generated`
- `curated`

静态资产目录协议：

```text
backend/assets/cards/<assetId>/metadata.json
```

`metadata.json` 当前最小建议字段：

```json
{
  "id": "flame-ring-builtin",
  "name": "法阵·01",
  "sourceType": "built_in",
  "attrSet": ["fire"],
  "generation": 1,
  "thumbnailUrl": "assets/thumbnails/thumb_00.webp",
  "videoUrl": "assets/videos/20260424062246_e374c5d2.mp4"
}
```

## 10. 文档使用建议

如果你是新会话：

1. 先读 `README.md`
2. 再读 `docs/attrset-quota-walkthrough.md`
3. 最后用本文确认接口、字段和输入态细节

`docs/archive/` 中的旧 handover、phase、roadmap 文档不应再作为当前主参考。
