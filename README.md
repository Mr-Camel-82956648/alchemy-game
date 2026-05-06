# AI法阵炼金术士

一个前后端分离的游戏原型：玩家通过炼金合成已有法阵，生成更高世代的新法阵，并在 4-wave 战斗中用属性匹配机制对抗怪物。

## 如何启动

### 前端

```bash
cd frontend
python -m http.server 8000
```

访问 `http://localhost:8000`。

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 18001
```

接口文档位于 `http://localhost:18001/docs`。如果修改后端端口，需要同步修改 `frontend/js/forgeAPI.js` 中的 `API_BASE`。

## 当前开发阶段

当前主线已经收口到“机制重构 + 最小配额后端 + 中文 forge 文档”阶段，后续继续开发前，默认先以本文和 `docs/` 根目录文档为准，不再以旧 phase / handover 稿作为当前真相源。

## 当前核心机制现状

- `attrSet` 是当前主字段。`mainAttr / subAttr / element` 只作为兼容字段保留。
- 战斗命中规则是“技能 `attrSet` 与怪物 `attrSet` 有交集才命中”，否则走吸收成长反馈。
- 当前正式战斗流程按“单属性怪优先出场”假设收口；双属性怪数据仍保留，暂不作为当前扩机制目标。
- 后端 forge 已接入最小每日配额实现，请求需要 `playerId`；超额返回 `429 quota_exhausted`。
- forge 的 LLM 只负责 `name / visualDesc / fusionPrompt`，属性集合和数值由后端规则决定。

## 当前最应该看的文档

1. `docs/attrset-quota-walkthrough.md`
2. `docs/forge-schema.md`
3. `backend/README.md`

`docs/archive/` 下的文档仅作为历史参考，不应再作为当前主参考。

## 新会话 / 新 agent 建议阅读顺序

1. 先读本文，确认当前阶段、启动方式和主文档入口。
2. 再读 `docs/attrset-quota-walkthrough.md`，建立机制、前后端链路和接管边界。
3. 再读 `docs/forge-schema.md`，确认接口、字段和 quota 行为。
4. 需要后端环境变量或接口细节时，再补读 `backend/README.md`。
5. 只有在排查历史决策或旧实现来源时，才进入 `docs/archive/`。
