# Backend - AI法阵生成服务

## 功能概览

- 提供异步 forge 接口：`POST /api/forge` + `GET /api/forge/status/{taskId}`
- 提供最小每日配额接口：`GET /api/player/quota` + `POST /api/admin/quota/reset`
- 按 `attrSet` 规则合并父技能属性集合，并返回兼容字段 `mainAttr / subAttr / element`
- LLM 仅负责创意字段 `name / visualDesc / fusionPrompt`，属性与数值由后端规则决定

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

```env
FORGE_USE_REAL_LLM=true
LLM_PROVIDER=gemini_rest
GEMINI_API_KEY=your_gemini_api_key
LLM_MODEL=gemini-2.0-flash
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=1
FORGE_DAILY_QUOTA=5
FORGE_QUOTA_TIMEZONE=Asia/Shanghai
```

说明：

- `FORGE_USE_REAL_LLM=false` 时，forge 直接走本地 fallback 命名
- `FORGE_QUOTA_TIMEZONE` 默认是 `Asia/Shanghai`
- 在缺少系统时区数据的环境里，quota 服务会自动回退到固定 `UTC+08:00`

## 接口

### POST /api/forge

请求体：

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
    "visualDesc": null,
    "fusionPrompt": null,
    "source": "fallback"
  },
  "error": null
}
```

### GET /api/player/quota

示例：

```text
GET /api/player/quota?playerId=player_xxx
```

响应字段：

- `playerId`
- `quotaDate`
- `dailyLimit`
- `used`
- `remaining`
- `resetAt`

### POST /api/admin/quota/reset

请求体：

```json
{
  "playerId": "player_xxx",
  "applyToAll": false,
  "usedCount": 0,
  "dailyLimit": 5
}
```

## Forge 规则摘要

- 父技能先规范为 `attrSet`
- 后端按出现频次和首次出现顺序合并为目标 `attrSet`
- `mainAttr = attrSet[0]`
- `subAttr = attrSet[1]`，不存在则为 `null`
- `generation = max(parentA.gen, parentB.gen) + 1`
- `baseAtk = 100 * (1 + 0.3 * (generation - 1))`

## Prompt / LLM 说明

- prompt 文件位于 `app/prompts/forge/`
- system prompt 与 user prompt 都已改为中文说明
- LLM 必须返回严格 JSON，且只允许这三个字段：
  - `name`
  - `visualDesc`
  - `fusionPrompt`
- 后端不会再接受 LLM 直接决定 `mainAttr / subAttr`

## 已知限制

- 任务状态仍保存在进程内存中，重启后丢失
- `videoUrl` 仍为 `null`
- 前端目前只接入了最小 quota gate，没有独立配额 UI
- 旧文档中若仍写 `LLM 输出 mainAttr/subAttr`，以当前 README 和 `docs/forge-schema.md` 为准
