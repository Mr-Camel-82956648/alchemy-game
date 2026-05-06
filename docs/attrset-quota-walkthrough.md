# AttrSet + Quota Walkthrough

本文件用于说明这轮“机制重构 + 最小配额后端 + 中文 prompt”之后，当前有效的数据流和接管重点。

## 1. 卡牌与存储

- 卡牌主字段已经切到 `attrSet`
- `mainAttr / subAttr / element` 继续保留，主要用于旧 UI、旧存档和兼容接口
- `frontend/js/spellDefs.js` 负责 `attrSet` 规范化、合并与旧字段派生
- `frontend/js/storage.js` 负责把旧卡牌、seed 卡牌和新 forge 结果统一写成兼容结构

结论：

- 以后新增技能数据，优先写 `attrSet`
- 只有在兼容旧逻辑或旧渲染时，才读取 `mainAttr / subAttr`

## 2. 战斗命中

- `frontend/js/combat.js` 的正式规则是“技能 `attrSet` 与怪物 `attrSet` 有交集则命中”
- `frontend/js/monsterDefs.js` 已不再使用 `immuneAttrs`
- `frontend/js/battle.js` 现在会：
  - 从技能卡构建 `spellData.attrSet`
  - 从怪物 profile 读取 `monster.attrSet`
  - 把这两个集合送进 `Combat.calcHitResult()`

结论：

- 以后不要再往 battle 主循环里写 `immuneAttrs`
- 如果发现伤害全为 0，优先检查传给 `Combat.calcHitResult()` 的对象里是否真的有 `attrSet`

## 3. Forge 协议

前端 `frontend/js/forgeAPI.js` 会向后端提交：

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

后端 `backend/app/routes/forge.py` 会：

1. 先消费 quota
2. 把父技能规范为属性集合
3. 创建异步 forge 任务

`backend/app/services/forge_service.py` 会：

1. 合并父技能 `attrSet`
2. 决定 `mainAttr / subAttr / generation / baseAtk`
3. 调 LLM 生成创意字段，失败则 fallback
4. 返回兼容结构的 `ForgeResult`

## 4. LLM 职责边界

当前 prompt 已改成中文说明，LLM 只负责：

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

结论：

- 如果未来 prompt 再调整，不要把属性决策重新放回 LLM
- 如果未来要扩展更多属性，只改后端 merge 规则与前端显示，不要先改 prompt schema

## 5. Quota 最小实现

后端新增：

- `GET /api/player/quota`
- `POST /api/admin/quota/reset`

`backend/app/services/quota_service.py` 当前使用 SQLite 保存：

- `player_id`
- `quota_date`
- `used_count`
- `daily_limit`
- `updated_at`

补充说明：

- 服务默认使用 `Asia/Shanghai`
- 在当前 Windows 环境如果缺少系统时区数据，会自动回退到固定 `UTC+08:00`

## 6. 前端失败收口

`frontend/js/forgeAPI.js` 现在会在以下场景主动清理本地 `pendingGeneration`：

- `POST /api/forge` 失败
- 轮询超时
- 后端任务返回 `failed`

这样可以避免用户卡在“永远 generating”状态。

## 7. 文档真相源

当前应优先参考：

- `README.md`
- `backend/README.md`
- `docs/forge-schema.md`
- 本文档

以下文件保留为历史资料，不再保证字段口径最新：

- `docs/phase3-handoff-for-new-agent.md`
- `docs/phase4-minimal-balance-design-v2.md`
- `docs/handover_to_cursor.md`
- `docs/roadmap.md`
