# Forge 协议与字段说明

本文是当前有效的 forge / quota 协议说明。旧文档中若仍写“LLM 直接决定 `mainAttr / subAttr`”，以本文为准。

## 1. 请求协议

### POST /api/forge

```json
{
  "playerId": "player_xxx",
  "spellA": {
    "id": "spell_a",
    "name": "赤焰印",
    "attrSet": ["fire"],
    "mainAttr": "fire",
    "generation": 1
  },
  "spellB": {
    "id": "spell_b",
    "name": "寒潮轮",
    "attrSet": ["ice"],
    "mainAttr": "ice",
    "generation": 1
  }
}
```

说明：

- `playerId` 必填，用于 quota 统计
- `attrSet` 是当前主口径
- `mainAttr` 仍保留为兼容字段；如果没传 `attrSet`，后端会回退到 `[mainAttr]`

成功响应：

```json
{
  "taskId": "task_xxx",
  "status": "pending"
}
```

超额响应：

```json
{
  "detail": {
    "code": "quota_exhausted",
    "message": "今日实时合成次数已用尽",
    "quota": {
      "playerId": "player_xxx",
      "quotaDate": "2026-05-06",
      "dailyLimit": 5,
      "used": 5,
      "remaining": 0,
      "resetAt": "2026-05-07T00:00:00+08:00"
    }
  }
}
```

## 2. 状态协议

### GET /api/forge/status/{taskId}

```json
{
  "taskId": "task_xxx",
  "status": "completed",
  "result": {
    "name": "焚天寒环",
    "attrSet": ["fire", "ice"],
    "mainAttr": "fire",
    "subAttr": "ice",
    "element": "fire",
    "generation": 2,
    "baseAtk": 130.0,
    "videoUrl": null,
    "status": "partial",
    "visualDesc": "中文视觉描述",
    "fusionPrompt": "English video prompt",
    "source": "llm"
  },
  "error": null
}
```

## 3. 字段来源

| 字段 | 来源 | 说明 |
|------|------|------|
| `name` | LLM / fallback | 新法阵名称 |
| `attrSet` | 后端规则 | 合并后的目标属性集合 |
| `mainAttr` | 后端规则 | `attrSet[0]` 的兼容字段 |
| `subAttr` | 后端规则 | `attrSet[1]` 的兼容字段 |
| `element` | 后端规则 | 等于 `mainAttr` |
| `generation` | 后端规则 | `max(parent.gen) + 1` |
| `baseAtk` | 后端规则 | 按世代推导 |
| `videoUrl` | 后端规则 | 当前固定为 `null` |
| `status` | 后端规则 | 当前固定为 `"partial"` |
| `visualDesc` | LLM / fallback | 中文视觉描述 |
| `fusionPrompt` | LLM / fallback | 英文视频提示词 |
| `source` | 后端规则 | `"llm"` 或 `"fallback"` |

## 4. LLM 输出边界

当前 LLM 只允许输出：

```json
{
  "name": "新法阵名称",
  "visualDesc": "1到2句中文视觉描述",
  "fusionPrompt": "1到2句英文视频生成提示词"
}
```

注意：

- LLM 不再决定 `attrSet / mainAttr / subAttr`
- 后端会忽略额外字段
- 只要 `name` 合法，后端就会把创意字段和规则字段合并为最终结果

## 5. 属性集合规则

- 合法元素：`fire` / `ice` / `thunder` / `blight`
- 兼容别名：`poison -> blight`
- 合并规则：先按出现频次排序，再按首次出现顺序打破并列
- 最多保留 3 个属性

示例：

- `["fire"] + ["ice"] -> ["fire", "ice"]`
- `["fire", "ice"] + ["ice", "thunder"] -> ["ice", "fire", "thunder"]`

## 6. Quota 协议

### GET /api/player/quota

```text
GET /api/player/quota?playerId=player_xxx
```

```json
{
  "playerId": "player_xxx",
  "quotaDate": "2026-05-06",
  "dailyLimit": 5,
  "used": 1,
  "remaining": 4,
  "resetAt": "2026-05-07T00:00:00+08:00"
}
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

## 7. 状态区分

不要混淆三层状态：

- 后端任务状态：`pending | completed | failed`
- `ForgeResult.status`：当前固定 `"partial"`
- 前端本地 `pendingGeneration.status`：只在成功时写 `"done"`；失败和超时会直接清理 pending

## 8. 文档使用建议

如果你是新会话：

1. 先读 `README.md`
2. 再读 `docs/attrset-quota-walkthrough.md`
3. 最后用本文确认接口和字段细节

`docs/archive/` 中的旧 handover、phase、roadmap 文档不应再作为当前主参考。
