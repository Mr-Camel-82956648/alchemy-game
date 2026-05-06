# AttrSet 与 Quota 接管说明

本文是当前机制与链路说明，面向后续新会话接手时快速建立上下文。

## 1. 当前主口径

- 卡牌主字段已经切到 `attrSet`
- `mainAttr / subAttr / element` 仍保留，但仅用于兼容旧数据、旧 UI 和旧接口读取
- 如果新增技能、怪物或 forge 结果，优先写 `attrSet`

## 2. 战斗规则

- `frontend/js/combat.js` 的当前命中规则是：技能 `attrSet` 与怪物 `attrSet` 有交集才命中
- 无交集时，不是普通 miss，而是沿用当前的吸收成长链路
- `frontend/js/monsterDefs.js` 已不再使用 `immuneAttrs` 作为现行字段
- `frontend/js/battle.js` 会把技能卡和怪物 profile 都转换为 `attrSet` 后再交给 `Combat.calcHitResult()`

接手时如果发现伤害全为 0，优先检查传给 `Combat.calcHitResult()` 的对象里是否真的带上了 `attrSet`。

## 3. 单属性怪假设

- 当前正式战斗流程按“单属性怪优先出场”的假设收口
- 双属性怪数据和资源仍然保留在 `monsterDefs.js`
- 这些双属性定义目前主要是为后续扩展留档，不是本轮要继续扩的机制主线

## 4. Forge 链路

前端 `frontend/js/forgeAPI.js` 会提交：

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

后端会按下面顺序处理：

1. 校验并消费 quota
2. 规范父技能属性集合
3. 合并得到目标 `attrSet`
4. 由后端决定 `mainAttr / subAttr / generation / baseAtk`
5. 调用 LLM 生成 `name / visualDesc / fusionPrompt`
6. 失败时退回 fallback 命名

## 5. LLM 职责边界

当前 prompt 已经收口成中文主体，LLM 只负责：

- `name`
- `visualDesc`
- `fusionPrompt`

后端规则负责：

- `attrSet`
- `mainAttr`
- `subAttr`
- `element`
- `generation`
- `baseAtk`
- `source`

如果后续再改 prompt，不要把属性决策重新交回 LLM。

## 6. 配额最小实现

当前后端提供：

- `GET /api/player/quota`
- `POST /api/admin/quota/reset`

关键现状：

- forge 请求必须带 `playerId`
- quota 目前使用 SQLite 做最小持久化
- 默认按 `Asia/Shanghai` 计算日期
- 在缺少系统时区数据的 Windows 环境里，会自动回退到固定 `UTC+08:00`

## 7. 前端失败收口

`frontend/js/forgeAPI.js` 现在会在这些场景清理本地 `pendingGeneration`，避免用户卡死在生成中：

- `POST /api/forge` 失败
- 轮询超时
- 后端任务返回 `failed`

## 8. 当前真相源

后续新会话应优先参考：

1. `README.md`
2. 本文档
3. `docs/forge-schema.md`
4. `backend/README.md`

`docs/archive/` 中的 handover、phase、roadmap、旧分析稿都只作为历史参考，不再代表当前协议与当前机制。
