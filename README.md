# AI法阵炼金术士

一个前后端分离的游戏原型：玩家通过炼金合成已有法阵，生成更高世代的新法阵，并在 4-wave 战斗中用属性匹配机制对抗怪物。当前主线已经把 PixVerse 国际版文生视频接到卡牌维度，玩家生成卡的视频状态可持久化、可查询、刷新后不丢。

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

接口文档位于 `http://localhost:18001/docs`。如果修改后端端口，需要同步修改 `frontend/index.html` 里 `window.__ALCHEMY_RUNTIME_CONFIG__.apiBase` 的默认配置。

## 本地调试快捷入口

- `http://localhost:8000/`
  当前前端本地开发入口。现阶段普通本地模式仍默认显示 battle 开发按钮和 reveal 调试信息，方便联调。
- `http://localhost:8000/?autoResolveAfter=30`
  本地开发快速结算入口。只在 `file://`、`localhost`、`127.0.0.1`、`::1` 这类本地环境生效；进入 battle 后会在 30 秒后自动弹出胜利结算层，点击返程后继续沿同一个 forge task 进入 reveal。
- `http://localhost:8000/?devBattle=0`
  关闭本地 battle 开发按钮。这个参数同样只对本地环境有效；设置后会隐藏 battle 开发面板，同时也会让 `autoResolveAfter` 失效。
- `http://localhost:18001/api/debug/llm-config`
  当前后端配置调试入口，用于确认 forge 与 glyph router 实际命中的 provider、model、base_url 与脱敏 key 摘要。
- `http://localhost:18001/api/debug/pixverse/config`
  PixVerse 最小后端闭环的配置快照入口，用于核对当前默认国际版 `base_url / submitUrl / resultUrlTemplate / model / quality / aspect_ratio / generate_audio_switch` 等运行时值。
- `http://localhost:18001/api/debug/pixverse/tasks`
  PixVerse 调试任务列表入口，用于查看本地 video task、关联 forge task / card、PixVerse `video_id`、当前状态与 MP4 URL。
- `http://localhost:18001/api/debug/pixverse/tasks/{videoTaskId}`
  PixVerse 单任务诊断入口，用于查看最近一次提交/轮询的 endpoint、脱敏 header、trace id、HTTP status 与 ErrCode/ErrMsg。
- `http://localhost:18001/api/video/pixverse/cards/register`
  把前端已有的 player-generated 卡注册到后端轻量状态仓库，建立 `cardId -> forgeTaskId -> videoTaskId -> resultUrl` 关联。
- `http://localhost:18001/api/video/pixverse/from-card/{cardId}`
  从卡牌维度发起 PixVerse 视频生成；已在生成中的卡会复用当前任务，已完成的卡直接返回现有结果。
- `http://localhost:18001/api/video/pixverse/card/{cardId}`
  查询某张卡当前的视频资产状态，适合 reveal / collection / 刷新回补使用。
- `http://localhost:18001/api/assets/cards`
  统一卡牌资产库入口，当前会一起列出 `built_in / player_generated / curated`。

## PixVerse 与卡牌资产当前口径

- 当前默认 PixVerse 接入按国际版 `https://app-api.pixverse.ai/openapi/v2`。
- 国内版 `.cn` 与国际版 `.ai` 的 endpoint / key 不能混用。
- 前一轮真实排查里出现的 `ErrCode=10005, apiKey is not registered`，已定位为“国际版 key 打到了国内版 `.cn` endpoint”的环境不匹配问题。
- 当前除了 `from-forge / status / debug tasks` 这组调试入口外，还新增了面向产品链路的 `cards/register / from-card/{cardId} / card/{cardId}`。
- 后端会把 player-generated 卡视频记录持久化到 `backend/data/card_asset_state.json`，刷新页面或重启后端后仍可按 `cardId` 回查视频状态。
- 统一卡牌资产库已升级为自包含目录协议 `backend/assets/cards/<assetId>/`；静态 `built_in / curated` 资产至少包含 `metadata.json + video.mp4 + thumbnail.webp`，metadata 正式使用 `videoPath / thumbnailPath` 相对路径，对外 API 再解析成前端可直接访问的 URL。
- 前端 reveal 调试区与 collection 预览区都保留了 `状态 / task / MP4 / 打开 MP4` 入口。

## 当前开发阶段

当前主线已完成“阶段二-A：PixVerse 文生视频最小后端闭环”，并继续推进到“卡牌视频资产化 + battle 结算时序调整 + 统一卡牌资产库最小框架”的合并阶段。在继续开发前，默认先以本文和 `docs/` 根目录文档为准，不再以旧 phase / handover 稿作为当前真相源。

当前唯一正式敏感配置文件是 `backend/.env`，模板文件是 `backend/.env.example`。后续本地联调只维护这一份真实配置，不再使用项目根目录 `.env` 或 glyph router 子目录 `.env`。

## 当前核心机制现状

- `attrSet` 是当前主字段。`mainAttr / subAttr / element` 只作为兼容字段保留。
- 战斗命中规则是“技能 `attrSet` 与怪物 `attrSet` 有交集才命中”，否则走吸收成长反馈。
- 当前正式战斗流程按“单属性怪优先出场”假设收口；双属性怪数据仍保留，暂不作为当前扩机制目标。
- battle 当前总时长为 `120s`，按 `30s * 4 wave` 推进；魂数达标后不会立刻退出，而是要坚持到仪式结束再统一判定胜负。
- 后端 forge 已接入最小每日配额实现，请求需要 `playerId`；超额返回 `429 quota_exhausted`。
- 炼金炉入口已支持 A/B 双槽的 `0 / 1 / 2` 输入态：双空走固定开局结果池，单输入与双输入走统一 forge 语义链路。
- forge 语义 LLM 的正式输出已收敛为 `name / attrSet / themeText`；`generation / baseAtk` 仍由 rulebase 负责。
- 最终 `videoPrompt` 不再来自旧的 `fusionPrompt`，而是由内嵌模块B `backend/alchemy_glyph_router/` 基于 `themeText` 生成。
- battle 开始后会沿同一轮 pending run 在后台推进 `forge -> player-generated 卡草稿登记 -> PixVerse 视频生成 -> 结果状态回写`。
- player-generated 奖励现在会先停留在本轮 run 内，保存 `assetId / assetSourceType / videoStatus / videoTaskId / videoUrl` 等字段；只有 battle 胜利并在 reveal 里确认领取后，才正式进入本地 collection。
- battle 失败后的【重试】会复用同一轮 run 与同一份后台结果，不会重跑 forge / PixVerse。
- PixVerse 当前只负责 `videoPrompt -> 提交任务 -> 轮询状态 -> MP4 URL -> 回填卡牌资产状态`，暂不自动回填正式战斗资源替换。

## 当前最应该看的文档

1. `docs/attrset-quota-walkthrough.md`
2. `docs/forge-schema.md`
3. `docs/builtin-asset-spec-v1.md`
4. `docs/llm-env-alignment.md`
5. `backend/README.md`

`docs/archive/` 下的文档仅作为历史参考，不应再作为当前主参考。

## 新会话 / 新 agent 建议阅读顺序

1. 先读本文，确认当前阶段、启动方式和主文档入口。
2. 再读 `docs/attrset-quota-walkthrough.md`，建立机制、前后端链路和接管边界。
3. 再读 `docs/forge-schema.md`，确认接口、字段和 quota 行为。
4. 再读 `docs/builtin-asset-spec-v1.md`，确认静态卡牌资产的正式目录协议、字段口径与入库流程。
5. 再读 `docs/llm-env-alignment.md`，确认宿主 backend 与 glyph router 的 LLM 配置口径与排查方式。
6. 需要后端接口或运行细节时，再补读 `backend/README.md`。
7. 只有在排查历史决策或旧实现来源时，才进入 `docs/archive/`。
