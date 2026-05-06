# AI法阵炼金术士

玩家通过炼金合成已有法阵，生成更高世代的新法阵，并在 4-wave 战斗里用属性匹配规则对抗怪物。

## 当前状态

- 前端卡牌与后端 forge 结果已统一到 `attrSet` 口径，`mainAttr` / `subAttr` 作为兼容字段继续保留。
- 战斗命中规则已切换为“技能属性集合与怪物属性集合有交集则命中，否则触发吸收成长”。
- 后端 forge 接口已接入最小每日配额；请求需要 `playerId`，超额时返回 `429 quota_exhausted`。
- forge 的 LLM prompt 已改为中文创意口径，LLM 只负责 `name / visualDesc / fusionPrompt`，属性集合由后端规则决定。

## 目录

```text
alchemy-game/
  frontend/     # 游戏前端
  backend/      # FastAPI 后端
  docs/         # 当前说明与历史设计稿
```

## 本地运行

### 前端

```bash
cd frontend
python -m http.server 8000
```

浏览器访问 `http://localhost:8000`。

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 18001
```

接口文档位于 `http://localhost:18001/docs`。

默认前端会请求 `http://localhost:18001`。如果改端口，需要同时修改启动命令和 `frontend/js/forgeAPI.js` 里的 `API_BASE`。

## Forge 协议摘要

### 创建合成任务

`POST /api/forge`

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

### 查询任务结果

`GET /api/forge/status/{taskId}`

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

### 查询配额

`GET /api/player/quota?playerId=player_xxx`

返回 `playerId / quotaDate / dailyLimit / used / remaining / resetAt`。

## 文档入口

- `docs/forge-schema.md`: 当前有效的 forge + quota 接口与字段说明
- `docs/attrset-quota-walkthrough.md`: 本轮机制重构、前后端链路与接管 walkthrough
- `backend/README.md`: 后端启动、环境变量、接口与 prompt 说明

## 历史文档说明

`docs/phase3-handoff-for-new-agent.md`、`docs/phase4-minimal-balance-design-v2.md`、`docs/handover_to_cursor.md`、`docs/roadmap.md` 主要保留为历史设计与交接材料，其中仍有旧的 `mainAttr / subAttr / immuneAttrs` 叙述，不应再视为当前协议真相来源。
