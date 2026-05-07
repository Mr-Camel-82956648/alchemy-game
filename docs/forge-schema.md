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

## 9. 文档使用建议

如果你是新会话：

1. 先读 `README.md`
2. 再读 `docs/attrset-quota-walkthrough.md`
3. 最后用本文确认接口、字段和输入态细节

`docs/archive/` 中的旧 handover、phase、roadmap 文档不应再作为当前主参考。
