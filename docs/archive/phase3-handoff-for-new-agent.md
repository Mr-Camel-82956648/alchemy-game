# Phase 3 Handoff Document — for New Cursor Agent / New Device

> 本文档面向"在新设备上、由新 Cursor agent 接手项目"的场景。读完后应能立刻继续开发。

**当前代码基线：** `commit 11b9d68` (main)

---

## 1. 项目概况

**项目名：** AI法阵·炼金术士 (alchemy-game)

**核心玩法：** 玩家选择两张已有法阵 → 提交合成 → 进入战斗页打怪积攒能量 → 战斗结束后领取由 LLM 生成的新法阵卡。

**当前阶段：** Phase 3.2 已完成。前后端最小真实闭环已跑通，新法阵名由真实 Gemini LLM 生成。

**仓库地址：** https://github.com/Mr-Camel-82956648/alchemy-game

---

## 2. 目录结构

```
alchemy-game/
├── frontend/              # 纯 HTML/CSS/JS（不是 React/Vite/TS）
│   ├── index.html
│   ├── css/
│   ├── js/
│   │   ├── storage.js     # localStorage 数据管理
│   │   ├── spellDefs.js   # 法阵定义、normalize、calcBaseAtk
│   │   ├── monsterDefs.js
│   │   ├── combat.js      # calcDamage（属性免疫判定）
│   │   ├── forgeAPI.js    # 合成 API 封装（mock/real 切换）
│   │   ├── collection.js  # 收藏夹页（B 页面）
│   │   ├── loadout.js     # 装备页
│   │   ├── alchemy.js     # 炼金室页（A 页面）
│   │   ├── battle.js      # 战斗页
│   │   └── main.js        # 主控制器
│   └── assets/
│       ├── data/seed_cards.json
│       ├── ui/, monsters/, videos/, ...
├── backend/               # FastAPI
│   ├── requirements.txt
│   ├── README.md
│   └── app/
│       ├── main.py        # FastAPI 入口 + CORS + .env 加载
│       ├── models.py      # Pydantic 请求/响应
│       ├── routes/
│       │   └── forge.py   # POST /api/forge + GET /api/forge/status/{taskId}
│       └── services/
│           ├── forge_service.py  # 任务调度 + fallback + 命名清洗 + 业务日志
│           └── llm_client.py     # Gemini REST 调用 + JSON 校验
├── docs/
│   ├── handover_to_cursor.md
│   ├── roadmap.md
│   ├── forge-schema.md           # Schema 文档（必读）
│   └── phase3-handoff-for-new-agent.md  # 本文档
├── .env                   # 不进 git，包含 GEMINI_API_KEY
├── .gitignore
└── README.md
```

---

## 3. 当前前后端架构

### 前端

- **纯 HTML/CSS/JS**，没有 React、没有 Vite、没有 TypeScript。请勿擅自重构。
- 通过 `<script src="js/xxx.js?v=phase3"></script>` 加载所有 JS 文件。
- 数据存储依赖 `localStorage`（`alchemy-forge-data` 键）。
- 通过 `python -m http.server` 启动，**不要直接双击 index.html**（CORS 会失败）。

### 后端

- **FastAPI** + uvicorn，端口 **18001**（不是 8001）。
- 内存任务表（dict + threading.Lock），无数据库。
- LLM 通过 **Gemini REST**（不使用 SDK），直接 HTTP POST。
- 配置通过 `.env`（`python-dotenv` 读取）。

### 通信协议

```
POST /api/forge           → { taskId, status: "pending" }
GET  /api/forge/status/{taskId}
                          → { status: "pending"|"completed"|"failed",
                              result: ForgeResult | null }
```

详细 schema 见 `docs/forge-schema.md`。

### 状态分层（当前口径）

- **后端任务状态**：`pending` / `completed` / `failed`
- **ForgeResult.status**：当前固定为 `"partial"`，表示法阵结果已生成但暂无视频资源
- **前端本地 pending 状态**：`localStorage.pendingGeneration.status` 当前使用 `"done"` 作为前端本地完成标记，不属于后端接口协议
- **ForgeResult.source**：表示最终结果来源；`llm` 表示最终结果主要来自 LLM 输出并通过规则校验，`fallback` 表示最终结果由 fallback 逻辑生成，或 LLM 结果被判定不可用后被 fallback 替换

### Forge 完整调用链

```
[Frontend]
alchemy.js:onStart()
  → ForgeAPI.startForge(cardA, cardB)        — forgeAPI.js
    → realForge() → POST http://localhost:18001/api/forge
    → startPolling() → 每 3s GET /api/forge/status/{id}
    → 写入 localStorage.pendingGeneration.status='done' 和 result

[Battle 阶段]
battle.js:checkForgeStatus() 每 5s 读 pending，达到能量阈值后 onVictory

[Return 阶段]
alchemy.js:onReturnFromBattle()
  → 读 pending.result
  → GameStorage.addCard(...)  ← 唯一新卡入收藏入口
  → showReveal()

[Backend]
routes/forge.py:start_forge → forge_service.create_forge_task
  → 启动后台线程 _process_forge
  → llm_client.call_gemini_rest（如启用 LLM）
  → 命名清洗（_is_mechanical_name → _generate_fallback_name）
  → 写回 _tasks dict
```

---

## 4. 已完成阶段

### Phase 1 — 法阵结构标准化
- 引入 `mainAttr`/`subAttr`/`generation`/`baseAtk`/`status` 字段
- `normalizeCard` 兼容旧数据（poison → blight 等）
- 元素免疫战斗规则（`combat.js:calcDamage`）

### Phase 2 — 前后端最小真实闭环
- FastAPI backend 上线，端口 18001
- 前端 forgeAPI.js 支持 USE_MOCK 切换
- Pseudo-async 任务模式（POST 拿 taskId，GET 轮询结果）

### Phase 3 — 真实 LLM 接入
- Gemini REST（直接 HTTP，不用 SDK）
- 系统 prompt 强调视觉优先 + 极简规则
- LLM 输出结构化 JSON（name / mainAttr / subAttr / visualDesc / fusionPrompt）
- 后端规则负责 generation / baseAtk / element / status / source / videoUrl
- 完整 fallback 机制（LLM 失败或结果被判定不可用 → fallback 词库生成）

### Phase 3.1 — 修复
- "刻写新咒语"text 卡不再污染收藏夹（`collection.js` filter + slot 直接放入）
- LLM 命名约束强化（4 字优先、禁止机械拼接）
- 后端服务端 print 业务日志（`[FORGE]` / `[LLM]` 标签）

### Phase 3.2 — 收尾
- 前端调试日志清理
- `index.html` script `?v=debug2` → `?v=phase3`（cache busting）

---

## 5. 本轮实测通过的关键事实

| 验证项 | 结果 |
|--------|------|
| 前端 Console 打印 `[ForgeAPI] loaded, USE_MOCK=false, API_BASE=http://localhost:18001` | ✓ |
| 合成时打印 `[ForgeAPI] task created: ...` 和 `[ForgeAPI] forge completed: 名字 (source=llm)` | ✓ |
| 后端终端打印 `[FORGE]` / `[LLM]` 业务日志 | ✓ |
| LLM 生成命名不再机械拼接 | ✓ |
| "刻写新咒语"不再进收藏 | ✓ |
| 完整一局：选卡 → 合成 → 战斗 → 领卡 流程通畅 | ✓ |

### 实测合成样例（链路正常时应看到的命名风格）

| 父卡 A | 父卡 B | LLM 生成的新法阵名 | source |
|--------|--------|-------------------|--------|
| 火龙 | 飞流直下三千尺 | 熔岩飞瀑 | llm |
| 炎龙阵 | 寒冰阵 | 霜龙吐息 | llm |
| 飞流直下三千尺 | 烈焰巨龙 | 霜焰龙瀑 | llm |

**判断链路正常的特征：**
- 名称是 4 字优先的全新意象（不含父卡完整名称、不含"·"或"之阵"）
- 状态返回中 `source: "llm"`（表示最终结果主要来自 LLM，而不是 `fallback`）
- 后端终端能看到对应 `[LLM] Validation OK` 和 `[FORGE] LLM SUCCESS` 日志

**典型异常信号：**
- 名称形如 `烈焰巨龙·飞流直下三千尺之阵` → 几乎肯定是前端走了 `USE_MOCK` 本地模拟，没真实调到后端
- 名称形如 `烈焰雷阵`、`寒霜印` 这种短小但僵硬的词库短名，且 `source=fallback` → backend 走了 fallback 逻辑；可能是 LLM 调用失败，也可能是 LLM 结果被判定不可用后被替换，需查后端日志

---

## 6. 已知坑点（必读）

### 坑点 1：旧 http.server 进程残留

Windows 下 `python -m http.server` 没有显式 stop，多次启动会有多个进程同时 listen 同一端口（通过 SO_REUSEADDR 共享）。浏览器请求会被随机分配到任一进程，可能命中**完全不同目录**的旧实例。

**症状：** 浏览器看到的页面缺少新加的 JS 文件，Console 报 `ReferenceError: ForgeAPI is not defined`。

**排查：**
```powershell
netstat -ano | findstr ":<端口>"
Get-Process -Id <PID> | Select-Object Id, StartTime
```
看 StartTime 是不是今天启动的；如果有多个 PID 在同一端口，全部 `taskkill /PID <id> /F`。

### 坑点 2：浏览器 JS 缓存

`python -m http.server` 不发 `Cache-Control` 头，浏览器会无脑缓存。每次改前端 JS 后，必须做以下之一：
- Ctrl+Shift+R 强制刷新
- 在 `index.html` 的 script 上 bump version (`?v=phase3` → `?v=phase4`)

当前所有 script 已带 `?v=phase3`。

### 坑点 3：前后端端口（实战经验）

- **前端默认端口：8000**
- **后端固定端口：18001**（不是 8001）
- 如果怀疑旧 http.server 残留、端口冲突或浏览器命中旧目录，**优先改用前端端口 8010 做一次干净验证**——避免被旧端口上的残留进程干扰
- 后端端口请始终保持 18001，避免改动 `frontend/js/forgeAPI.js` 中的 `API_BASE`

**判断"是否加载到正确前端页面"的两条硬性标准：**

1. 浏览器 DevTools Console **第一行必须**出现：
   ```
   [ForgeAPI] loaded, USE_MOCK=false, API_BASE=http://localhost:18001
   ```
2. DevTools Network → 筛选 JS → **必须看到 10 个脚本文件**：
   `storage.js`、`spellDefs.js`、`monsterDefs.js`、`combat.js`、`forgeAPI.js`、`collection.js`、`loadout.js`、`alchemy.js`、`battle.js`、`main.js`

任一条件不满足，都说明命中了错误的服务目录或加载了旧版本。

如果前端拿不到后端响应，先 `curl http://localhost:18001/` 确认后端活着，再看前端 `forgeAPI.js` 的 `API_BASE`。

### 坑点 4：text 卡的临时性

`collection.js:onSpellConfirm` 创建的 `type === 'text'` 卡是**当前局临时素材**，会在 `alchemy.js:onStart` 时被删除，且不在收藏网格显示。不要把它当作正式卡牌处理。

### 坑点 5：seedVersion 升级

`storage.js:SEED_VERSION = 4`。改这个值会触发清空 spell 卡重新 seed，**会丢用户数据**。除非有非常充分的理由，不要 bump。

### 坑点 6：localStorage 兼容

字段名同时保留 `element` 和 `mainAttr`、`type === 'spell'/'text'/'basic'` 都存在。新写入卡牌走 `addCard` 时这些字段都会带，读取时建议先 `SpellDefs.normalizeCard()`。

---

## 7. 本地启动方式

### 启动后端

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 18001
```

确认启动成功：
```powershell
curl http://localhost:18001/
```
应返回 `{"message":"Alchemy Game Backend","status":"running","forge_use_real_llm":"true",...}`。

### 启动前端

```powershell
cd frontend
python -m http.server 8000
```
（如端口被占用可换 8010 等）

浏览器访问 `http://localhost:<前端端口>`，开 DevTools Console 应看到：
```
[ForgeAPI] loaded, USE_MOCK=false, API_BASE=http://localhost:18001
```

---

## 7.5 换设备后最小验证顺序（按顺序逐项执行）

新设备 clone 完仓库后，按以下顺序逐项验证。任意一步出问题就停下来排查，不要跳步。

| # | 步骤 | 期望现象 | 异常时怎么办 |
|---|------|---------|-------------|
| 1 | `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 18001` | 终端显示 `Uvicorn running on http://127.0.0.1:18001` | 端口被占用 → `netstat -ano \| findstr :18001` 杀掉占用进程 |
| 2 | `curl http://localhost:18001/` | 返回 JSON，含 `"forge_use_real_llm":"true"`、`"llm_model":"gemini-3-flash-preview"` | 缺字段 → 检查 `.env` 是否在项目根目录、是否填了 `GEMINI_API_KEY` |
| 3 | `cd frontend && python -m http.server 8000` | 终端显示 `Serving HTTP on :: port 8000` | 端口异常或怀疑残留 → 改用 `python -m http.server 8010` |
| 4 | 浏览器打开 `http://localhost:8000`（或 8010） | 看到炼金室主界面 | 白屏 → DevTools Console 看红色报错 |
| 5 | DevTools Console 第一行 | `[ForgeAPI] loaded, USE_MOCK=false, API_BASE=http://localhost:18001` | 没有这行 → 命中旧目录或缓存（见坑点 1、2、3） |
| 6 | DevTools Network → 筛选 JS | 必须看到 10 个 js 文件 | 少于 10 个 → 同上 |
| 7 | 选两张卡 → 开始合成 → 进入战斗 | Console 出现 `[ForgeAPI] task created: task_xxx` | 没有 → 前端没调后端，看 USE_MOCK 是不是被改了 |
| 8 | 战斗能量满 → 自动 victory → 返回炼金 | Console 出现 `[ForgeAPI] forge completed: <名字> (source=llm)` | source=fallback → LLM 调用失败，查后端终端 `[LLM]` 日志 |
| 9 | 领卡后查看收藏夹 | 新卡名是 LLM 风格（4 字优先、不机械拼接） | 名字含"·"或"之阵" → 链路走了 mock，回到第 5 步排查 |
| 10 | 在收藏夹点"刻写新咒语"输入文字后 | 输入的文字卡**不**出现在收藏网格 | 出现了 → 浏览器还在加载旧 collection.js，强制刷新 |

---

## 8. 环境变量说明（`.env`）

`.env` 在项目根目录，**已被 .gitignore 排除**，新设备需要手动创建：

```env
FORGE_USE_REAL_LLM=true
LLM_PROVIDER=gemini_rest
GEMINI_API_KEY=<your_gemini_api_key_here>
LLM_MODEL=gemini-3-flash-preview
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=1

# 备用 OpenAI-compatible 配置（暂未使用）
LLM_BASE_URL=
LLM_API_KEY=
OPENAI_COMPAT_MODEL=
```

**API Key 获取：** Google AI Studio (https://aistudio.google.com/app/apikey)

如果不填 `GEMINI_API_KEY` 或将 `FORGE_USE_REAL_LLM=false`，后端自动走随机 mock 生成（仍然能跑通整个流程，只是名字是 fallback 词库拼出来的）。

---

## 9. 当前代码基线

| 项 | 值 |
|----|-----|
| commit hash | `11b9d68` |
| commit message | Phase 3.2: cleanup debug logs, bump asset version to phase3 |
| branch | `main` |
| origin/main 同步 | 是 |
| script 版本号 | `?v=phase3` |

最近 5 次提交：
```
11b9d68 Phase 3.2: cleanup debug logs, bump asset version to phase3
456f38c Phase 3.1: fix text-card leaking into collection, improve LLM naming, add business logging
1f59ed7 Phase 3: real LLM forge via Gemini REST, with structured output and fallback
7ab3fc9 Phase 2: FastAPI backend + frontend-backend forge closed loop
ace6c81 Add backend placeholder and update README with local run instructions
```

---

## 10. 当前开发原则（必读，下一阶段也要遵守）

- **不要把前端重构成 React / Vite / TypeScript 工程**——用户明确反对，已多次声明
- **保持当前原生静态页 + IIFE 模块 + script 标签架构**，所有 JS 通过 `index.html` 中的 `<script src="...?v=phaseN">` 加载
- **优先采用非破坏性增量修改**：新增字段不删旧字段、不 bump `seedVersion` 清空数据、不改协议字段名
- **不要扩散重构**：每个阶段严格控制改动范围，只改"最小必要文件"
- **协议优先于实现**：`/api/forge` 和 `ForgeResult` 字段已固化，扩展时新增字段不改名
- **前端 JS 任何改动后必须 bump `index.html` 的 `?v=phaseN`**，否则浏览器缓存会让改动失效

---

## 11. 下一步开发建议与优先级

### 高优先级（聚焦在协议固化与文档收口，不要发散）

1. **Forge schema / source / fallback 语义固化**
   - 保持 `ForgeResult.source: "llm" | "fallback"` 作为协议必填字段，后续扩展不要破坏其“最终结果来源”语义
   - 在 `docs/forge-schema.md` 中继续以“任务状态 / ForgeResult.status / 前端本地 pending 状态”三层语义为准，避免混用
   - 前后端校验代码加上对 `source` / `status` 的显式断言

2. **异常路径验证与补齐**
   - 后端：模拟 LLM 超时、JSON 解析失败、`mainAttr` 越界三种情况，确认 fallback 100% 触发且日志清晰
   - 前端：模拟 backend 18001 不可达，确认 `[ForgeAPI] POST /api/forge failed` 真的打出来，且 pending 不会卡死永久不清
   - 给出"如何重置一个卡死的 pending"的步骤（手动清 localStorage 或加超时清理）

3. **文档与启动流程收口**
   - 把"换设备最小验证顺序"加进 README.md（当前只在 handoff 文档里）
   - `.env` 增加 `.env.example` 模板文件入 git（不含真实 key），新设备可直接 copy 改 key
   - 把"前端调试日志开关"做成 `forgeAPI.js` 顶部一个变量，便于排查时开/关

### 中优先级（明确不在下一阶段做）

- 视频生成接入（PixVerse / Runway） — `fusionPrompt` 已就绪，但属于扩展功能
- 后端持久化（SQLite / Redis） — 当前内存表够用
- OpenAI-compatible provider 支持
- 基础鉴权 / 限流

### 低优先级 / 不建议

- React/Vite/TS 重构 — 用户明确反对
- 大规模目录重组 — 用户明确反对
- 数据库 — 当前内存表足够

---

## 附录 A：关键文件 Quick Reference

| 文件 | 关键函数 | 作用 |
|------|---------|------|
| `frontend/js/alchemy.js` | `onStart()` / `onReturnFromBattle()` | 合成入口 / 新卡领取 |
| `frontend/js/forgeAPI.js` | `startForge()` / `realForge()` / `startPolling()` | 后端通信 |
| `frontend/js/storage.js` | `addCard()` / `setPending()` / `seedIfNeeded()` | 数据层 |
| `frontend/js/collection.js` | `renderGrid()` / `onSpellConfirm()` | 收藏页 / 刻写咒语 |
| `backend/app/services/forge_service.py` | `create_forge_task()` / `_process_forge()` | 任务调度 |
| `backend/app/services/llm_client.py` | `call_gemini_rest()` / `_validate()` | LLM 调用 |
> 历史参考：这是旧 Phase 3 阶段的交接文档，对应的提交点、协议和目录说明都可能已经过时。
> 历史参考：这是旧 Phase 3 阶段的交接文档，对应的提交点、协议和目录说明都可能已经过时。
