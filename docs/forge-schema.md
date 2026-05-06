# Forge Schema

## 目标

当前 forge 协议分成两层：

- 创意层：LLM 负责命名和视觉描述
- 规则层：后端负责属性集合、世代、攻击力和配额

不要再把旧文档里的 `LLM 直接输出 mainAttr / subAttr` 视为现行协议。

## 请求协议

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

规则：

- `playerId` 必填，用于 quota 统计
- `spellA.attrSet` / `spellB.attrSet` 是当前主口径
- `mainAttr` 仍保留为兼容字段；如果没有 `attrSet`，后端会回退到 `[mainAttr]`

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

## 状态协议

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

字段说明：

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `name` | string | LLM / fallback | 新法阵名称 |
| `attrSet` | string[] | 后端规则 | 合并后的目标属性集合 |
| `mainAttr` | string | 后端规则 | `attrSet[0]` 的兼容字段 |
| `subAttr` | string? | 后端规则 | `attrSet[1]` 的兼容字段 |
| `element` | string | 后端规则 | 等于 `mainAttr` |
| `generation` | int | 后端规则 | `max(parent.gen) + 1` |
| `baseAtk` | float | 后端规则 | 由世代推导 |
| `videoUrl` | string? | 后端规则 | 当前固定为 `null` |
| `status` | string | 后端规则 | 当前固定为 `"partial"` |
| `visualDesc` | string? | LLM / fallback | 中文视觉描述 |
| `fusionPrompt` | string? | LLM / fallback | 英文视频提示词 |
| `source` | string | 后端规则 | `"llm"` 或 `"fallback"` |

## Quota 协议

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

## LLM 输出协议

当前 LLM 只允许返回以下 JSON：

```json
{
  "name": "新法阵名称",
  "visualDesc": "1到2句中文视觉描述",
  "fusionPrompt": "1到2句英文视频生成提示词"
}
```

注意：

- LLM 不再决定 `mainAttr / subAttr / attrSet`
- 后端会忽略任何额外字段
- 只要 `name` 合法，后端就会把创意字段与规则字段合并成最终 `ForgeResult`

## 属性集合规则

- 合法元素：`fire` / `ice` / `thunder` / `blight`
- 兼容别名：`poison -> blight`
- 合并规则：先统计两个父技能中属性出现频次，再按首次出现顺序打破并列
- 最多保留 3 个属性

示例：

- `["fire"] + ["ice"] -> ["fire", "ice"]`
- `["fire", "ice"] + ["ice", "thunder"] -> ["ice", "fire", "thunder"]`

## 前端本地状态

后端任务状态与前端本地状态不要混淆：

- 后端任务状态：`pending | completed | failed`
- `ForgeResult.status`：当前固定 `"partial"`
- 前端 `localStorage.pendingGeneration.status`：本地只把成功结果标记为 `"done"`；失败和超时会直接清理 pending，避免卡死

## 已知限制

- 任务状态仍在内存中，进程重启后丢失
- 配额是最小实现，前端尚未提供独立 quota 面板
- 当前正式文档入口只有本文件、根 README 和 `backend/README.md`
