# AttrSet 与 Quota 接管说明

本文是当前机制与链路说明，面向后续新会话接手时快速建立上下文。

## 1. 当前主口径

- 卡牌与 forge 结果的核心字段已经收口为 `attrSet`
- `mainAttr / subAttr / element` 继续保留，但仅作为旧 UI、旧数据和旧接口兼容字段
- 新增或重构 forge 逻辑时，优先围绕 `attrSet + themeText + videoPrompt` 思考，而不是回到旧的 `visualDesc / fusionPrompt`

## 2. 战斗规则

- `frontend/js/combat.js` 仍然按技能 `attrSet` 与怪物 `attrSet` 是否有交集来判定命中
- 无交集时，不是普通 miss，而是继续沿用当前的吸收成长链路
- 本轮没有改 battle 数值、波次、怪物、R、大招或暂停逻辑

## 3. 炼金炉输入态

当前 A/B 双槽支持四种状态：

- A 空，B 空
- A 有，B 空
- A 空，B 有
- A 有，B 有

落地方式：

1. 前端允许任何槽位状态下点击开始进入 battle。
2. 后端 `POST /api/forge` 接受 `spellA / spellB` 为 `null`。
3. 双空不调用 forge 语义 LLM，而是直接从固定开局结果池返回一个明确结果。
4. 单输入与双输入进入同一条 forge 语义链路。

## 4. Forge 链路

前端 `frontend/js/forgeAPI.js` 现在会提交：

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

后端处理顺序：

1. 解析当前输入态
2. 双空时直接走固定开局结果池
3. 单输入 / 双输入时调用 forge 语义 LLM，请其返回 `name / attrSet / themeText`
4. rulebase 负责校验 `attrSet`、决定 `generation / baseAtk / mainAttr / subAttr / element`
5. 模块B `run_alchemy_glyph_router(theme, save_output=False, verbose=False)` 把 `themeText` 继续转换为最终 `videoPrompt`
6. 模块B失败时，后端回退到本地 `videoPrompt` 文本，不阻断 forge 主流程

## 5. LLM 职责边界

### forge 语义 LLM 负责

- `name`
- `attrSet`
- `themeText`

### rulebase 负责

- 输入态判定
- `generation`
- `baseAtk`
- 兼容字段派生
- `attrSet` 合法性校验
- 关键词 fallback 与随机兜底
- 双空固定结果池

### 模块B 负责

- 读取 `themeText`
- 生成最终 `videoPrompt`
- 返回 `route_selected / route_reason / fallback_applied / final_template / model / elapsed_ms`

## 6. text 输入处理

- text 不能再被当成“无属性空壳”
- forge LLM prompt 已明确要求 text 必须参与 `attrSet` 推断
- 若 forge LLM 没返回合法 `attrSet`，后端会先做关键词 rulebase 兜底
- 关键词仍无法判定时，再退到已有 spell 输入的属性合并
- 随机只作为最后手段

## 7. 固定开局结果池

双空输入当前复用项目现有四个单属性起始法阵概念：

- `熔岩法阵`
- `冰凌法阵`
- `星环法阵`
- `剧毒法阵`

这样做的原因：

- 它们已经是当前项目中最稳定、最小闭环的起始语义对象
- 与现有 `attrSet` 战斗规则天然兼容
- 不需要额外引入新素材、新卡池系统或新 UI

## 8. 前端持久化与兼容

- forge 完成后的卡对象现在会保留 `themeText / videoPrompt / promptRoute / promptTemplate / promptModel / elapsed_ms`
- 旧卡若仍只带 `visualDesc / fusionPrompt`，前端读取时会兼容映射到 `themeText / videoPrompt`
- 新卡继续保留 `mainAttr / subAttr / element`，但这些只是兼容派生字段

## 9. 当前真相源

后续新会话应优先参考：

1. `README.md`
2. 本文档
3. `docs/forge-schema.md`
4. `backend/README.md`

`docs/archive/` 中的 handover、phase、roadmap、旧分析稿都只作为历史参考，不再代表当前协议与当前机制。
